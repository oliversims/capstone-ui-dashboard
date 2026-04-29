/**
 * Typed API client with error handling and validation
 */

import { retryWithBackoff, fetchWithTimeout, ConnectionError, classifyError } from "./errors"
import { CONFIG } from "./config"

/**
 * Telemetry response from ESP32 device
 */
export interface TelemetryResponse {
  voltage1?: number | null
  voltage2?: number | null
  voltage3?: number | null
  voltage4?: number | null
  voltage5?: number | null
  voltage6?: number | null
  channel1?: boolean
  channel2?: boolean
  channel3?: boolean
  channel4?: boolean
  channel5?: boolean
  channel6?: boolean
  channel1Fault?: string
  channel2Fault?: string
  channel3Fault?: string
  channel4Fault?: string
  channel5Fault?: string
  channel6Fault?: string
  signalStrength?: number
  cameraOnline?: boolean
  securityState?: string
  pdProtocol?: string
  pdFault?: string | null
  voltage?: number | null
  continuityStatus?: string
  phaseDetected?: string
  neutralGroundStatus?: string
  alarmActive?: boolean
  intrusionDetected?: boolean
  auditTrailEnabled?: boolean
  remoteLockout?: boolean
  killSignalReady?: boolean
  lastAlarmTime?: string | null
  latestImageUrl?: string | null
  lastCaptureTime?: string | null
  triggerSource?: string | null
}

/**
 * Parses and validates telemetry response
 */
export function parseTelemetryResponse(data: unknown): TelemetryResponse {
  if (typeof data !== "object" || data === null) {
    return {}
  }

  const obj = data as Record<string, unknown>
  const result: Record<string, unknown> = {}

  // Voltage values
  for (let i = 1; i <= 6; i++) {
    const key = `voltage${i}`
    const val = obj[key]
    if (typeof val === "number" && Number.isFinite(val)) {
      result[key] = val
    } else if (val === null) {
      result[key] = null
    }
  }

  // Channel states
  for (let i = 1; i <= 6; i++) {
    const key = `channel${i}`
    const val = obj[key]
    if (typeof val === "boolean") {
      result[key] = val
    }
  }

  // Fault strings
  for (let i = 1; i <= 6; i++) {
    const key = `channel${i}Fault`
    const val = obj[key]
    if (typeof val === "string" && val.length < 200) {
      result[key] = val
    }
  }

  // Single values
  if (typeof obj.signalStrength === "number" && Number.isFinite(obj.signalStrength)) {
    result.signalStrength = obj.signalStrength
  }

  if (typeof obj.cameraOnline === "boolean") {
    result.cameraOnline = obj.cameraOnline
  }

  if (typeof obj.securityState === "string" && obj.securityState.length < 50) {
    result.securityState = obj.securityState
  }

  if (typeof obj.pdProtocol === "string" && obj.pdProtocol.length < 50) {
    result.pdProtocol = obj.pdProtocol
  }

  if (typeof obj.pdFault === "string" || obj.pdFault === null) {
    result.pdFault = obj.pdFault
  }

  if (typeof obj.voltage === "number" && Number.isFinite(obj.voltage)) {
    result.voltage = obj.voltage
  }

  if (typeof obj.continuityStatus === "string" && obj.continuityStatus.length < 100) {
    result.continuityStatus = obj.continuityStatus
  }

  if (typeof obj.phaseDetected === "string" && obj.phaseDetected.length < 100) {
    result.phaseDetected = obj.phaseDetected
  }

  if (typeof obj.neutralGroundStatus === "string" && obj.neutralGroundStatus.length < 100) {
    result.neutralGroundStatus = obj.neutralGroundStatus
  }

  if (typeof obj.alarmActive === "boolean") {
    result.alarmActive = obj.alarmActive
  }

  if (typeof obj.intrusionDetected === "boolean") {
    result.intrusionDetected = obj.intrusionDetected
  }

  if (typeof obj.auditTrailEnabled === "boolean") {
    result.auditTrailEnabled = obj.auditTrailEnabled
  }

  if (typeof obj.remoteLockout === "boolean") {
    result.remoteLockout = obj.remoteLockout
  }

  if (typeof obj.killSignalReady === "boolean") {
    result.killSignalReady = obj.killSignalReady
  }

  if (typeof obj.lastAlarmTime === "string" || obj.lastAlarmTime === null) {
    result.lastAlarmTime = obj.lastAlarmTime
  }

  if (typeof obj.latestImageUrl === "string" && obj.latestImageUrl.length < 500) {
    result.latestImageUrl = obj.latestImageUrl
  }

  if (typeof obj.lastCaptureTime === "string" && obj.lastCaptureTime.length < 100) {
    result.lastCaptureTime = obj.lastCaptureTime
  }

  if (typeof obj.triggerSource === "string" && obj.triggerSource.length < 100) {
    result.triggerSource = obj.triggerSource
  }

  return result as TelemetryResponse
}

/**
 * API client for communicating with ESP32 device
 */
export class ApiClient {
  constructor(private deviceIp: string) {}

  /**
   * Fetch telemetry from device with retry and timeout
   */
  async fetchTelemetry(): Promise<TelemetryResponse> {
    try {
      const response = await retryWithBackoff(
        () =>
          fetchWithTimeout(`http://${this.deviceIp}/telemetry`, {
            method: "GET",
            timeoutMs: CONFIG.API_TIMEOUT_MS,
          }),
        {
          maxAttempts: CONFIG.TIMINGS.TELEMETRY_RETRY_MAX_ATTEMPTS,
          baseDelayMs: CONFIG.TIMINGS.TELEMETRY_RETRY_BASE_DELAY_MS,
        }
      )

      if (!response.ok) {
        throw new Error(`Telemetry request failed with status ${response.status}`)
      }

      const json = await response.json()
      return parseTelemetryResponse(json)
    } catch (error) {
      const classified = classifyError(error)
      throw classified
    }
  }

  /**
   * Send channel command to device
   */
  async setChannelState(channelNumber: number, state: "on" | "off"): Promise<void> {
    try {
      const response = await retryWithBackoff(
        () =>
          fetchWithTimeout(`http://${this.deviceIp}/channel/${channelNumber}/${state}`, {
            method: "GET",
            timeoutMs: CONFIG.API_TIMEOUT_MS,
            cache: "no-store",
          }),
        {
          maxAttempts: CONFIG.TIMINGS.CHANNEL_COMMAND_MAX_RETRIES + 1,
          baseDelayMs: CONFIG.TIMINGS.CHANNEL_COMMAND_RETRY_DELAY_MS,
        }
      )

      if (!response.ok) {
        throw new Error(
          `Failed to set channel ${channelNumber} to ${state}: status ${response.status}`
        )
      }
    } catch (error) {
      const classified = classifyError(error)
      throw classified
    }
  }

  /**
   * Batch set multiple channels (for "All On" / "All Off" operations)
   */
  async setMultipleChannels(
    channels: number[],
    state: "on" | "off"
  ): Promise<{ successful: number[]; failed: Array<{ channel: number; error: string }> }> {
    const successful: number[] = []
    const failed: Array<{ channel: number; error: string }> = []

    // Sequential execution with failure tracking
    for (const channelNumber of channels) {
      try {
        await this.setChannelState(channelNumber, state)
        successful.push(channelNumber)
      } catch (error) {
        failed.push({
          channel: channelNumber,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return { successful, failed }
  }
}

/**
 * Creates API client instance
 */
export function createApiClient(deviceIp: string): ApiClient {
  return new ApiClient(deviceIp)
}
