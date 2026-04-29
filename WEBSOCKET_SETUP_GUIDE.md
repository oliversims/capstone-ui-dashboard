# WebSocket Real-Time Implementation Guide

## Overview
The system now includes **real-time WebSocket communication** between the CH (Control Hub) and the Dashboard. When an alarm is triggered:

1. **Instantly**: CH broadcasts alarm event via WebSocket to all connected dashboard clients
2. **Immediately**: Dashboard receives event and updates ALL channel states to OFF
3. **Visual feedback**: Alarm indicator flashes with timestamp on dashboard
4. **No polling delay**: No need to wait for the next 2-second telemetry poll

---

## Installation Steps

### Step 1: Install WebSocket Library in Arduino IDE

1. Open **Arduino IDE**
2. Go to **Sketch** → **Include Library** → **Manage Libraries**
3. Search for: `ArduinoWebsockets`
4. Install **ArduinoWebsockets by Gil Maimon** (version 0.5.0 or higher)
5. Click **Install**

### Step 2: Update CH Firmware

1. Open your current CH firmware in Arduino IDE
2. **Replace the entire code** with the contents of `CH_FIRMWARE_WITH_WEBSOCKET.ino`
3. Verify no compilation errors (Sketch → Verify)
4. **Upload to ESP32-S3** (CH device)
5. Open Serial Monitor and confirm:
   ```
   WebSocket Server: Started on port 81
   === SYSTEM READY ===
   ```

### Step 3: Deploy Dashboard

The dashboard has already been updated with WebSocket support. Just:

1. Ensure you're in the `C:\Users\guyol\capstone-ui-dashboard` directory
2. Run: `npm install` (to install any missing dependencies)
3. Start the dev server: `npm run dev`
4. Dashboard will be available at `http://localhost:3000`

---

## What Changed

### CH Firmware Changes
- **Port 81**: WebSocket server listening for dashboard connections
- **triggerAlarm()**: Now broadcasts `{"event":"kill_triggered", ...}` to all connected clients
- **onDataRecv()**: Broadcasts `{"event":"status_update", ...}` when PD sends status
- **loop()**: Added `wsServer.poll()` to handle WebSocket connections

### Dashboard Changes
- **websocket-handler.ts**: New utility module for WebSocket connection management
- **page.tsx**: Added WebSocket connection, alarm event handler, visual indicators
  - **Alarm Status Card**: Shows "🚨 ALARM TRIGGERED" with timestamp when kill command sent
  - **Real-time Status Card**: Shows WebSocket connection status (Connected/Disconnected)
  - **Instant Channel Updates**: All channels immediately set to OFF when alarm triggers
  - **Auto-clear**: Alarm indicator clears after 5 seconds

---

## How It Works

### Motion Detected → Dashboard Notification Flow

```
1. PIR + IR detect motion
   ↓
2. CH device calls triggerAlarm()
   ├─ Sends KILL command to PD via ESP-NOW
   ├─ Broadcasts via WebSocket: {"event":"kill_triggered", ...}
   ↓
3. Dashboard receives WebSocket message
   ├─ Sets all channels to OFF immediately
   ├─ Shows 🚨 ALARM TRIGGERED banner
   ├─ Logs event: "INTRUSION DETECTED"
   └─ Auto-clears after 5 seconds
   ↓
4. Simultaneously (via existing telemetry):
   ├─ PD receives command and kills all relays
   ├─ Sends status confirmation back
   └─ Dashboard polls and confirms state

Total latency: ~50-200ms (WebSocket) vs ~2000ms (polling)
```

---

## Testing the Implementation

### Test 1: Verify WebSocket Connection
1. Open dashboard at `http://localhost:3000`
2. Enter CH IP address and **Connect**
3. Look for **Real-time** card to show **"Connected"** (green)
4. If not connected:
   - Verify CH firmware was updated correctly
   - Check CH device serial console for errors
   - Ensure port 81 is not blocked by firewall

### Test 2: Test Alarm Trigger
1. **Trigger alarm** (manually or wait for motion detection)
2. Observe dashboard:
   - Top-left card should turn RED: **"🚨 ALARM TRIGGERED"**
   - All 6 channel cards should show **"Off"** status
   - Event log should show: `CH → All Channels | KILL Signal | Success`
3. Verify alarm clears after ~5 seconds

### Test 3: Test Status Updates
1. While connected to WebSocket, control channels manually via web endpoints
2. Dashboard should show instant status changes (no 2-second delay)

---

## Message Format Reference

### Kill/Alarm Event (CH → Dashboard)
```json
{
  "event": "kill_triggered",
  "timestamp": 1234567890,
  "reason": "INTRUSION_DETECTED",
  "channels": [0, 0, 0, 0, 0, 0],
  "securityState": "alarm"
}
```

### Status Update Event (CH → Dashboard)
```json
{
  "event": "status_update",
  "timestamp": 1234567890,
  "channels": [1, 0, 1, 0, 1, 0],
  "voltages": [3.2, 0.0, 3.3, 0.0, 3.1, 0.0]
}
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **WebSocket shows "Disconnected"** | Check CH IP address, verify port 81 is accessible, restart CH device |
| **Dashboard won't connect** | Ensure ArduinoWebsockets library is installed, verify CH firmware compiled without errors |
| **Alarm doesn't trigger** | Check PIR/IR sensors, verify CH is armed, test via motion or manual command |
| **Channels don't update in real-time** | WebSocket fallback to polling every 2 seconds, check browser console for errors |
| **Alarm banner stays on screen** | Refresh page (auto-clears after 5 seconds anyway) |

---

## Additional Notes

- **WebSocket Fallback**: If WebSocket fails, dashboard still polls `/telemetry` every 2 seconds
- **Multiple Dashboard Clients**: WebSocket server broadcasts to ALL connected dashboards simultaneously
- **Port 81**: Make sure your network/firewall allows port 81 (or change in firmware + dashboard code)
- **Mobile Access**: WebSocket works on mobile browsers (iOS Safari, Android Chrome)
- **Production**: Consider adding WebSocket authentication if deploying publicly

---

## Files Modified/Created

```
capstone-ui-dashboard/
├── app/
│   ├── page.tsx              (MODIFIED - WebSocket integration)
│   └── websocket-handler.ts  (NEW - WebSocket utilities)
├── CH_FIRMWARE_WITH_WEBSOCKET.ino  (NEW - Replace original CH firmware)
└── WEBSOCKET_SETUP_GUIDE.md  (THIS FILE)
```
