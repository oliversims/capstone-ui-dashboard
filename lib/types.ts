export type ConnectionState = "online" | "offline" | "degraded"
export type SessionState = "idle" | "armed" | "alarm" | "locked"
export type ProtocolType = "ESP-NOW" | "LoRa" | "Wi-Fi Bridge" | "Unknown"
export type CommandState = "on" | "off" | "pending" | "fault" | "no-ack"
export type TestResult = "untested" | "passed" | "failed" | "wrong-circuit" | "retry"
/** Panel channel phase label by channel index (1→A … 6→F). */
export type ChannelPhaseLetter = "A" | "B" | "C" | "D" | "E" | "F"
export interface APState {
  id: string
  name: string
  online: boolean
  sessionState: SessionState
  controlLocked: boolean
  operatorName: string
  lastHeartbeat: string
}
export interface CHState {
  id: string
  label: string
  online: boolean
  endpoint: string
  signalStrength: number
  cameraOnline: boolean
  securityState: SessionState
  lastHeartbeat: string
  bridgeProtocol: ProtocolType
}
export interface ChannelState {
  number: number
  label: string
  phase: ChannelPhaseLetter
  gpio: string
  enabled: boolean
  commandedState: CommandState
  actualState: CommandState
  continuity: "unknown" | "open" | "closed"
  fault: string | null
  lastCommand: string
  lastResponse: string
  testResult: TestResult
}
export interface PDState {
  id: string
  label: string
  online: boolean
  protocol: ProtocolType
  lastHeartbeat: string
  fault: string | null
  channelCount: number
  channels: ChannelState[]
}
export interface MeasurementState {
  voltage: number | null
  continuityStatus: string
  phaseDetected: string
  neutralGroundStatus: string
  freshness: string
}
export interface SecurityState {
  alarmActive: boolean
  intrusionDetected: boolean
  auditTrailEnabled: boolean
  remoteLockout: boolean
  killSignalReady: boolean
  lastAlarmTime: string | null
}
export interface CameraState {
  online: boolean
  latestImageUrl: string | null
  lastCaptureTime: string | null
  triggerSource: string | null
}
export interface EventLogEntry {
  id: string
  time: string
  source: string
  target: string
  action: string
  result: string
  channelNumber?: number
  phase?: ChannelPhaseLetter
  notes?: string
}
export interface SystemTelemetry {
  ap: APState
  ch: CHState
  pd: PDState
  measurements: MeasurementState
  security: SecurityState
  camera: CameraState
  eventLog: EventLogEntry[]
}
 
