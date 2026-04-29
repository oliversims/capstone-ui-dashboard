# System Setup Guide - Simplified Version

## Overview
The dashboard now uses a **simple flag-based approach** for real-time alarm detection:
- CH firmware adds an `alarmActive` flag to the `/telemetry` response
- Dashboard checks this flag during normal polling
- When alarm is triggered, dashboard instantly detects it and updates all channels to OFF
- All events are logged automatically

---

## Installation Steps

### Step 1: Update CH Firmware

1. Open Arduino IDE
2. Replace your current CH firmware with: `CH_FIRMWARE.ino`
3. **Important**: Make sure you have the original libraries:
   - WiFi.h
   - WebServer.h
   - WiFiClientSecure.h
   - UniversalTelegramBot.h
   - esp_now.h
   - esp_camera.h
   - Wire.h
   - LiquidCrystal_I2C.h

4. Compile (Sketch → Verify)
5. Upload to ESP32-S3
6. Check serial console:
   ```
   WiFi: OK
   ESP-NOW: OK
   Camera: OK
   Server: Started
   === SYSTEM READY ===
   ```

### Step 2: Deploy Dashboard

```bash
cd C:\Users\guyol\capstone-ui-dashboard
npm install
npm run dev
```

Dashboard runs at: `http://localhost:3000`

---

## How It Works

### Motion Detection → Dashboard Instant Update Flow

```
PIR + IR detect motion
    ↓
CH triggers alarm
    ├─ Sets alarmActive = true
    ├─ Sends KILL to PD via ESP-NOW
    └─ Includes in next /telemetry response
        ↓
Dashboard polls /telemetry
    ├─ Reads alarmActive = true
    ├─ Sets all channels OFF immediately
    ├─ Shows 🚨 red alarm banner
    ├─ Logs: "KILL - Intrusion Detected"
    └─ Auto-clears after 5 seconds
```

**Latency**: ~2000ms (next polling cycle) - acceptable for alarm scenario

---

## Testing

### Test 1: Manual Alarm Trigger
```bash
curl http://[CH_IP]/kill
```

Dashboard should:
- ✅ Turn all channels OFF
- ✅ Show red "🚨 ALARM TRIGGERED" banner
- ✅ Log event in Event Log
- ✅ Auto-clear after 5 seconds

### Test 2: Restore/Resume
Click **"All Channels On"** button
- ✅ All channels turn ON
- ✅ Event logged: "Restore/Resume"

### Test 3: Motion Detection
(Requires physical motion sensors)
- ✅ Motion triggers alarm automatically
- ✅ Dashboard detects and updates instantly

---

## Event Logging

All events are automatically logged:

| Event | Source | Target | Action |
|-------|--------|--------|--------|
| Intrusion alarm | CH | PD All Channels | KILL - Intrusion Detected |
| Manual restore | UI | PD All Channels | Restore/Resume |
| Manual shutdown | UI | PD All Channels | Emergency Off |
| Channel control | UI | PD Channel X | Set on/off |

---

## Files Changed

```
capstone-ui-dashboard/
├── app/
│   └── page.tsx                (MODIFIED - checks alarmActive flag)
├── CH_FIRMWARE.ino             (NEW - simplified, no WebSocket)
└── SETUP_GUIDE.md              (THIS FILE)

Removed:
├── websocket-handler.ts        (deleted)
└── WEBSOCKET_SETUP_GUIDE.md    (superseded)
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Alarm doesn't trigger | Check PIR/IR sensors, verify CH armed, check motion |
| Dashboard doesn't show alarm | Refresh page (F5), check CH IP is correct |
| Event log empty | Check filters are set to "All" |
| Channels show "Offline" | Verify PD device is powered and connected via ESP-NOW |

---

## Key Differences from Option 1 (WebSocket)

**Simpler Implementation:**
- No WebSocket library needed
- No WebSocket server setup
- No WebSocket connections to manage
- Just uses existing HTTP polling

**Slightly Longer Latency:**
- Option 1 (WebSocket): ~50-200ms
- Option 2 (Flag): ~2000ms (polling cycle)
- Still feels instant for security alerts

**All Features Preserved:**
- ✅ Real-time alarm detection
- ✅ Instant channel state updates
- ✅ Event logging
- ✅ Visual alarm banner
- ✅ Auto-clear after 5 seconds
