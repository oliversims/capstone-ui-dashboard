/**
 * Utility functions extracted from page component for better testability and reusability
 */

import type { ChannelState, ChannelPhaseLetter, EventLogEntry } from "./types"
import { CONFIG } from "./config"

/**
 * Maps channel state to legacy status
 */
export function mapChannelStateToLegacyStatus(
  channel: ChannelState
): "active" | "inactive" | "fault" {
  if (
    channel.commandedState === "fault" ||
    channel.actualState === "fault" ||
    channel.fault
  ) {
    return "fault"
  }
  if (channel.commandedState === "on" || channel.actualState === "on") {
    return "active"
  }
  return "inactive"
}

/**
 * Gets count of active channels
 */
export function getActiveChannelCount(channels: ChannelState[]): number {
  return channels.filter(
    (channel) => channel.commandedState === "on" || channel.actualState === "on"
  ).length
}

/**
 * Converts RSSI to percentage
 */
export function rssiToPercent(rssi: number): string {
  if (rssi >= -50) return "100%"
  if (rssi <= -100) return "0%"
  return Math.round(((rssi + 100) / 50) * 100) + "%"
}

/**
 * Get phase letter for channel number (1→A, 2→B, etc., cycling for >6)
 */
export function phaseForChannelNumber(n: number): ChannelPhaseLetter {
  const index = (Math.max(1, Math.floor(n)) - 1) % CONFIG.PHASE_LABELS.length
  return CONFIG.PHASE_LABELS[index]
}

/**
 * Format voltage value as string with unit
 */
export function formatVoltageStat(value: number | null, precision = 3): string {
  if (value === null || !Number.isFinite(value)) return "--"
  return `${value.toFixed(precision)} V`
}

/**
 * Determine event status from result, action, and notes
 */
export type EventStatus = "Success" | "Failed" | "Warning" | "Info" | "Disconnected" | "Initialized"

export function getEventStatus(
  result: string,
  action: string,
  notes?: string
): EventStatus {
  const haystack = `${result} ${action} ${notes ?? ""}`.toLowerCase()

  if (/\b(initialized|initializing|startup|boot)\b/.test(haystack)) {
    return "Initialized"
  }
  if (/\b(disconnected|disconnect)\b/.test(haystack)) {
    return "Disconnected"
  }
  if (/\b(fail|failed|failure|error|fault|timeout)\b/.test(haystack)) {
    return "Failed"
  }
  if (/\b(warning|warn|offline)\b/.test(haystack)) {
    return "Warning"
  }
  if (/\b(success|connected|completed|done)\b/.test(haystack)) {
    return "Success"
  }

  return "Info"
}

/**
 * Get CSS class for event status badge
 */
export function getEventStatusBadgeClass(status: EventStatus): string {
  const classes: Record<EventStatus, string> = {
    Success: "bg-emerald-100 text-emerald-700 hover:bg-emerald-100",
    Failed: "bg-red-100 text-red-700 hover:bg-red-100",
    Warning: "bg-amber-100 text-amber-800 hover:bg-amber-100",
    Disconnected: "bg-slate-100 text-slate-700 hover:bg-slate-100",
    Initialized: "bg-violet-100 text-violet-700 hover:bg-violet-100",
    Info: "bg-sky-100 text-sky-700 hover:bg-sky-100",
  }
  return classes[status]
}

/**
 * Filter event log by source, target, and action
 */
export function filterEventLog(
  events: EventLogEntry[],
  filters: {
    source?: string
    target?: string
    action?: string
  },
  allOption: string = "All"
): EventLogEntry[] {
  return events.filter((entry) => {
    const sourceMatches = !filters.source || filters.source === allOption || entry.source === filters.source
    const targetMatches = !filters.target || filters.target === allOption || entry.target === filters.target
    const actionMatches = !filters.action || filters.action === allOption || entry.action === filters.action
    return sourceMatches && targetMatches && actionMatches
  })
}

/**
 * Calculate waveform statistics from voltage data
 */
export interface WaveformStats {
  min: number | null
  max: number | null
  avg: number | null
  rms: number | null
  peakToPeak: number | null
  latest: number | null
}

export function calculateWaveformStats(voltages: number[]): WaveformStats {
  const vals = voltages.filter((v) => typeof v === "number" && Number.isFinite(v))

  if (vals.length === 0) {
    return {
      min: null,
      max: null,
      avg: null,
      rms: null,
      peakToPeak: null,
      latest: null,
    }
  }

  const min = Math.min(...vals)
  const max = Math.max(...vals)
  const avg = vals.reduce((sum, v) => sum + v, 0) / vals.length
  const rms = Math.sqrt(vals.reduce((sum, v) => sum + v * v, 0) / vals.length)

  return {
    min,
    max,
    avg,
    rms,
    peakToPeak: max - min,
    latest: vals[vals.length - 1],
  }
}

/**
 * Calculate Y-axis domain for waveform chart
 */
export function calculateWaveformYDomain(voltages: number[]): [number, number] {
  const vals = voltages.filter((v) => typeof v === "number" && Number.isFinite(v))

  if (vals.length === 0) return [0, 1]

  const min = Math.min(...vals)
  const max = Math.max(...vals)

  if (min === max) {
    const pad = Math.max(Math.abs(min) * CONFIG.LIMITS.WAVEFORM_Y_AXIS_PADDING_PERCENT, CONFIG.LIMITS.WAVEFORM_Y_AXIS_MIN_PADDING)
    return [min - pad, max + pad]
  }

  const span = max - min
  const pad = Math.max(span * CONFIG.LIMITS.WAVEFORM_Y_AXIS_PADDING_PERCENT, CONFIG.LIMITS.WAVEFORM_Y_AXIS_MIN_PADDING)
  return [min - pad, max + pad]
}
