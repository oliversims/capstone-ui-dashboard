/**
 * Application configuration with environment variable support
 */

export const CONFIG = {
  // API Configuration
  API_TIMEOUT_MS: Number(process.env.NEXT_PUBLIC_API_TIMEOUT_MS ?? 10000),
  TELEMETRY_POLL_MS: Number(process.env.NEXT_PUBLIC_TELEMETRY_POLL_MS ?? 2000),

  // WebSocket Configuration
  WEBSOCKET_PORT: Number(process.env.NEXT_PUBLIC_WEBSOCKET_PORT ?? 81),
  WEBSOCKET_RECONNECT_TIMEOUT_MS: Number(process.env.NEXT_PUBLIC_WEBSOCKET_RECONNECT_TIMEOUT_MS ?? 5000),

  // Storage Keys
  STORAGE_KEYS: {
    DEVICE_IP: "esp32_ip",
    DEVICE_IP_DRAFT: "esp32_ip_draft",
    EVENT_LOG: "dashboard_event_log",
  },

  // Limits & Constraints
  LIMITS: {
    MAX_EVENT_LOG_ENTRIES: 25,
    MAX_WAVEFORM_HISTORY_POINTS: 280, // ~5 minutes at 2s intervals + 6 buffer
    WAVEFORM_BUFFER_SIZE: 6,
    WAVEFORM_Y_AXIS_PADDING_PERCENT: 0.12,
    WAVEFORM_Y_AXIS_MIN_PADDING: 0.001,
  },

  // Timing
  TIMINGS: {
    ALARM_DISPLAY_DURATION_MS: 5000,
    CHANNEL_COMMAND_RETRY_DELAY_MS: 120,
    CHANNEL_COMMAND_MAX_RETRIES: 2,
    TELEMETRY_RETRY_MAX_ATTEMPTS: 2,
    TELEMETRY_RETRY_BASE_DELAY_MS: 200,
  },

  // Waveform Display Options
  WAVEFORM_TIME_RANGES: [
    { label: "30s", windowMs: 30_000 },
    { label: "1m", windowMs: 60_000 },
    { label: "5m", windowMs: 300_000 },
  ] as const,

  // Channels
  CHANNEL_COUNT: 6,
  PHASE_LABELS: ["A", "B", "C", "D", "E", "F"] as const,
}

/**
 * Validates configuration at startup
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (CONFIG.API_TIMEOUT_MS < 1000) {
    errors.push("API_TIMEOUT_MS must be >= 1000ms")
  }

  if (CONFIG.TELEMETRY_POLL_MS < 500) {
    errors.push("TELEMETRY_POLL_MS must be >= 500ms")
  }

  if (CONFIG.WEBSOCKET_PORT < 1 || CONFIG.WEBSOCKET_PORT > 65535) {
    errors.push("WEBSOCKET_PORT must be between 1 and 65535")
  }

  if (CONFIG.LIMITS.MAX_EVENT_LOG_ENTRIES < 1) {
    errors.push("MAX_EVENT_LOG_ENTRIES must be >= 1")
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
