/**
 * Error handling and classification system
 */

export type ConnectionErrorType =
  | "timeout"
  | "invalid_ip"
  | "connection_refused"
  | "invalid_response"
  | "network_error"
  | "unknown"

export interface ConnectionError {
  type: ConnectionErrorType
  message: string
  originalError?: Error
  timestamp: Date
}

/**
 * Classifies network errors to provide meaningful feedback
 */
export function classifyError(error: unknown): ConnectionError {
  const timestamp = new Date()

  if (error instanceof TypeError) {
    if (error.message.includes("fetch")) {
      return {
        type: "network_error",
        message: "Network request failed. Check your connection and IP address.",
        originalError: error,
        timestamp,
      }
    }
    if (error.message.includes("URL")) {
      return {
        type: "invalid_ip",
        message: "Invalid IP address or hostname format.",
        originalError: error,
        timestamp,
      }
    }
  }

  if (error instanceof DOMException) {
    if (error.name === "AbortError") {
      return {
        type: "timeout",
        message: "Request timeout. Device may be offline or unresponsive.",
        originalError: error,
        timestamp,
      }
    }
  }

  if (error instanceof Error) {
    if (error.message.includes("CORS")) {
      return {
        type: "connection_refused",
        message: "CORS error. Device may not accept connections from this origin.",
        originalError: error,
        timestamp,
      }
    }

    if (error.message.includes("offline") || error.message.includes("ERR_INTERNET_DISCONNECTED")) {
      return {
        type: "network_error",
        message: "No internet connection. Check your network.",
        originalError: error,
        timestamp,
      }
    }
  }

  return {
    type: "unknown",
    message: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    originalError: error instanceof Error ? error : undefined,
    timestamp,
  }
}

/**
 * Retries a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number
    baseDelayMs?: number
    maxDelayMs?: number
    onAttempt?: (attempt: number, error?: Error) => void
  } = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3
  const baseDelayMs = options.baseDelayMs ?? 500
  const maxDelayMs = options.maxDelayMs ?? 5000

  let lastError: Error | undefined

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      options.onAttempt?.(attempt + 1, lastError)

      if (attempt < maxAttempts - 1) {
        const delayMs = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs)
        await new Promise((resolve) => setTimeout(resolve, delayMs))
      }
    }
  }

  throw lastError || new Error("Retry failed")
}

/**
 * Creates a fetch with automatic timeout
 */
export async function fetchWithTimeout(
  url: string,
  options: {
    timeoutMs?: number
    [key: string]: unknown
  } = {}
): Promise<Response> {
  const { timeoutMs = 10000, ...fetchOptions } = options

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    })
    return response
  } finally {
    clearTimeout(timeoutId)
  }
}
