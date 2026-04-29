/**
 * Input validation utilities for IP addresses and configuration
 */

export type ValidationResult<T> =
  | { success: true; value: T }
  | { success: false; error: string }

/**
 * Validates IPv4 address format (e.g., 192.168.1.1)
 */
export function validateIpv4(ip: string): ValidationResult<string> {
  const trimmed = ip.trim()

  if (!trimmed) {
    return { success: false, error: "IP address cannot be empty" }
  }

  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/

  if (!ipRegex.test(trimmed)) {
    return { success: false, error: "Invalid IP address format" }
  }

  return { success: true, value: trimmed }
}

/**
 * Validates hostname or IP address for use in URLs
 * Accepts: IPv4, localhost, or valid domain names
 */
export function validateHost(host: string): ValidationResult<string> {
  const trimmed = host.trim()

  if (!trimmed) {
    return { success: false, error: "Host cannot be empty" }
  }

  // Check IPv4
  const ipv4Result = validateIpv4(trimmed)
  if (ipv4Result.success) {
    return ipv4Result
  }

  // Check localhost
  if (trimmed === "localhost") {
    return { success: true, value: trimmed }
  }

  // Check valid hostname/domain
  const hostnameRegex = /^(?:(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/i

  if (hostnameRegex.test(trimmed)) {
    return { success: true, value: trimmed }
  }

  // Try parsing as URL
  try {
    new URL(`http://${trimmed}/`)
    return { success: true, value: trimmed }
  } catch {
    return { success: false, error: "Invalid hostname or IP address" }
  }
}

/**
 * Validates stored data from localStorage
 */
export function validateStoredIp(ip: unknown): ValidationResult<string> {
  if (typeof ip !== "string") {
    return { success: false, error: "Stored IP must be a string" }
  }

  return validateHost(ip)
}

/**
 * Validates event log entry structure
 */
export interface ValidEventLogEntry {
  id: string
  time: string
  source: string
  target: string
  action: string
  result: string
  notes?: string
}

export function validateEventLogEntry(entry: unknown): ValidationResult<ValidEventLogEntry> {
  if (typeof entry !== "object" || entry === null) {
    return { success: false, error: "Event entry must be an object" }
  }

  const e = entry as Record<string, unknown>

  // Check required fields
  if (typeof e.id !== "string" || e.id.length > 100) {
    return { success: false, error: "Invalid event id" }
  }

  if (typeof e.time !== "string" || e.time.length > 50) {
    return { success: false, error: "Invalid event time" }
  }

  if (typeof e.source !== "string" || e.source.length > 50) {
    return { success: false, error: "Invalid event source" }
  }

  if (typeof e.target !== "string" || e.target.length > 100) {
    return { success: false, error: "Invalid event target" }
  }

  if (typeof e.action !== "string" || e.action.length > 100) {
    return { success: false, error: "Invalid event action" }
  }

  if (typeof e.result !== "string" || e.result.length > 100) {
    return { success: false, error: "Invalid event result" }
  }

  // Check optional notes
  if (e.notes !== undefined && (typeof e.notes !== "string" || e.notes.length > 500)) {
    return { success: false, error: "Invalid event notes" }
  }

  return {
    success: true,
    value: {
      id: e.id,
      time: e.time,
      source: e.source,
      target: e.target,
      action: e.action,
      result: e.result,
      notes: typeof e.notes === "string" ? e.notes : undefined,
    },
  }
}

/**
 * Validates and parses event log from localStorage
 */
export function parseEventLog(raw: unknown): ValidEventLogEntry[] {
  if (!Array.isArray(raw)) {
    return []
  }

  return raw
    .map((entry) => validateEventLogEntry(entry))
    .filter((result) => result.success)
    .map((result) => (result as { success: true; value: ValidEventLogEntry }).value)
    .slice(0, 25)
}
