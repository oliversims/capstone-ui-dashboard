/**
 * WebSocket handler for real-time event streaming from Communication Hub
 * Handles alarm events, status updates, and emergency signals
 */

export interface AlarmEvent {
  type: "alarm_armed" | "alarm_disarmed" | "intrusion_detected" | "status_update" | "kill_triggered"
  timestamp: string
  channel?: number
  details?: string
}

export type WebSocketEventHandler = (event: AlarmEvent) => void

/**
 * Establishes WebSocket connection to device for real-time events
 * Automatically reconnects with exponential backoff on failure
 */
export class WebSocketManager {
  private ws: WebSocket | null = null
  private url: string
  private handlers: WebSocketEventHandler[] = []
  private isConnecting = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelayMs = 1000
  private maxReconnectDelayMs = 30000

  constructor(deviceIp: string, port: number = 81) {
    this.url = `ws://${deviceIp}:${port}`
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
        resolve()
        return
      }

      this.isConnecting = true

      try {
        this.ws = new WebSocket(this.url)

        this.ws.onopen = () => {
          this.isConnecting = false
          this.reconnectAttempts = 0
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data) as AlarmEvent
            this.notifyHandlers(message)
          } catch (error) {
            console.error("Failed to parse WebSocket message:", error)
          }
        }

        this.ws.onerror = (error) => {
          this.isConnecting = false
          console.error("WebSocket error:", error)
          reject(new Error("WebSocket connection failed"))
        }

        this.ws.onclose = () => {
          this.isConnecting = false
          this.attemptReconnect()
        }

        // Set connection timeout
        const timeoutId = setTimeout(() => {
          if (this.ws?.readyState !== WebSocket.OPEN) {
            this.ws?.close()
            reject(new Error("WebSocket connection timeout"))
          }
        }, 5000)

        // Clear timeout if connection succeeds
        const originalOnOpen = this.ws.onopen
        const wsRef = this.ws
        this.ws.onopen = (event) => {
          clearTimeout(timeoutId)
          originalOnOpen?.call(wsRef, event)
        }
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn("Max reconnection attempts reached for WebSocket")
      return
    }

    this.reconnectAttempts++
    const delay = Math.min(
      this.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      this.maxReconnectDelayMs
    )

    setTimeout(() => {
      this.connect().catch((error) => {
        console.error("WebSocket reconnection failed:", error)
      })
    }, delay)
  }

  subscribe(handler: WebSocketEventHandler) {
    this.handlers.push(handler)
  }

  unsubscribe(handler: WebSocketEventHandler) {
    this.handlers = this.handlers.filter((h) => h !== handler)
  }

  private notifyHandlers(event: AlarmEvent) {
    this.handlers.forEach((handler) => {
      try {
        handler(event)
      } catch (error) {
        console.error("Handler error:", error)
      }
    })
  }

  disconnect() {
    this.maxReconnectAttempts = 0 // Stop auto-reconnect
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }
}

/**
 * Creates a WebSocket manager instance
 */
export function createWebSocketManager(deviceIp: string, port?: number): WebSocketManager {
  return new WebSocketManager(deviceIp, port)
}
