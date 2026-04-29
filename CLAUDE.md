# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**capstone-ui-dashboard** is a Next.js web application serving as the user interface for a wireless, remotely controlled electrical testing system. The dashboard connects to an ESP32 Communication Hub (CH) that bridges communication with a Panel Device (PD) for controlling and monitoring electrical test circuits.

## Tech Stack

- **Framework**: Next.js 16.1.6 with React 19.2.3
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 with PostCSS
- **Components**: shadcn/ui (Badge, Card, Input, Switch, Button)
- **Charting**: Recharts 3.8.0
- **Dev Dependencies**: ESLint 9, @tailwindcss/postcss

## Build & Development Commands

```bash
npm run dev       # Start dev server on http://localhost:3000
npm run build     # Build for production
npm start         # Start production server
npm run lint      # Run ESLint on all files
```

## Code Architecture

### State Management & Data Flow

The app uses React hooks for all state management (useState, useEffect, useMemo, useRef). The main `HomePage` component in `app/page.tsx` manages:

1. **Connection State**: IP address, connection status, WebSocket connection
2. **Telemetry**: CH/PD status, channel states, voltage history
3. **Event Log**: Command history with source/target/action/result filtering
4. **Waveform Display**: Live voltage visualization with 30s/1m/5m time ranges

### API Communication

**REST API** (polled every 2 seconds):
- `GET http://{device_ip}/telemetry` - System status and channel states
- `GET http://{device_ip}/channel/{number}/{on|off}` - Control channel outputs
- Responses include: channel states, voltages (1-6), security state, camera/fault status

**WebSocket** (real-time events):
- Connection: `ws://{device_ip}:81` (or `wss:` over HTTPS)
- Messages: `AlarmEvent` objects with event type, timestamp, channel data
- Event types: `kill_triggered`, `status_update`, `alarm_armed`, `alarm_disarmed`
- Handler: `app/websocket-handler.ts`

### Local Storage

- `esp32_ip` - Saved device IP for persistent connection
- `esp32_ip_draft` - Draft IP shown after disconnect
- `dashboard_event_log` - Event history (up to 25 entries), persisted across sessions

### Type System

Core types in `lib/types.ts`:

```typescript
SystemTelemetry {
  ap: APState              // User Interface
  ch: CHState             // Communication Hub (ESP32)
  pd: PDState             // Panel Device (6 channels)
  measurements: MeasurementState
  security: SecurityState
  camera: CameraState
  eventLog: EventLogEntry[]
}

ChannelState {
  number, label, phase (A-F), gpio
  commandedState, actualState ("on" | "off" | "pending" | "fault" | "no-ack")
  fault, lastCommand, lastResponse, testResult
}
```

## File Structure

```
app/
  page.tsx              (1400+ lines; main dashboard, client component)
  layout.tsx            (root layout with fonts & metadata)
  websocket-handler.ts  (WebSocket setup)
  globals.css           (Tailwind directives)

lib/
  types.ts              (TypeScript interfaces)
  default-system.ts     (initial telemetry state)
  utils.ts              (utility functions)

components/ui/
  badge.tsx, button.tsx, card.tsx, input.tsx, switch.tsx
  (shadcn/ui components with Tailwind)
```

## Key Design Patterns

### Optimistic Updates
Channel commands update local state immediately before confirming with the device, providing instant UI feedback:
```typescript
setChannels(prev => prev.map(ch => ({...ch, commandedState: "on"})))
await sendChannelCommand(channelNumber, "on")
```

### Waveform Management
- Live mode: streams latest voltage data continuously
- Paused mode: freezes history for inspection while live data still updates
- Auto-switches displayed channel to the first active (online) channel
- Calculates visible range based on selected time window (30s/1m/5m)

### Event Logging
- Captures all major actions: connections, channel commands, alarms, status updates
- Filters by source (UI, CH, PD), target, and action
- Status badge styling based on keyword matching (success/failed/warning/info)
- Limited to 25 entries with newest first

## Development Notes

### Session IP Persistence
The app distinguishes between saved IPs (active connection) and draft IPs (shown after disconnect). This allows users to preserve the IP input while testing reconnection without auto-connecting.

### Channel Numbering & Phases
Channels 1-6 map to phases A-F cyclically via `phaseForChannelNumber()`. Phase labels may extend beyond 6 channels using the same cycle.

### Voltage History
Maintains a rolling window of voltage measurements (max points = ~280 for 5-minute window at 2s intervals). Visible history is filtered by selected time range and handles missing/null values.

### WebSocket Reconnection
WebSocket connection is established when a valid saved IP exists and automatically closes when disconnected. Kill signal events trigger immediate emergency shutdown of all channels.

### TypeScript Config
- `moduleResolution: "bundler"` for Next.js
- Path alias: `@/*` points to root directory
- Strict mode enabled
- Incremental builds enabled

## Common Tasks

**Adding a new telemetry field:**
1. Add to `SystemTelemetry` interface in `lib/types.ts`
2. Add to default values in `lib/default-system.ts`
3. Update telemetry fetch in `page.tsx` (`fetchTelemetry()`)
4. Update relevant UI section to display

**Adding channel control:**
1. Add endpoint to ESP32 handler
2. Create fetch call in `toggleChannel()` or new function
3. Update `ChannelState` if new state needed
4. Add UI control (Switch or Button)

**Modifying event log:**
- Call `addLog(source, target, action, result, notes)` with appropriate strings
- Status badge auto-classifies based on keywords in result/action
- Filter options auto-populate from log entries

## Notes

- All API calls use `cache: "no-store"` to avoid Next.js caching issues with polling
- ESLint config extends `eslint-config-next` for Next.js best practices
- No tests currently; test structure would follow Next.js conventions
- Styling is pure Tailwind; no component-scoped CSS modules
