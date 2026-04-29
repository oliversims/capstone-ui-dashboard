"use client"
import { defaultSystemTelemetry } from "@/lib/default-system"
import type {
  ChannelPhaseLetter,
  ChannelState,
  CommandState,
  SessionState,
  SystemTelemetry,
} from "@/lib/types"
import { useEffect, useMemo, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { CONFIG } from "@/lib/config"
import { validateHost } from "@/lib/validation"
import { parseEventLog } from "@/lib/validation"
import { classifyError } from "@/lib/errors"
import { createApiClient, type ApiClient } from "@/lib/api"
import { createWebSocketManager, type WebSocketManager, type AlarmEvent } from "@/app/websocket-handler"
import {
  mapChannelStateToLegacyStatus,
  getActiveChannelCount,
  rssiToPercent,
  phaseForChannelNumber,
  formatVoltageStat,
  getEventStatus,
  getEventStatusBadgeClass,
  filterEventLog,
  calculateWaveformStats,
  calculateWaveformYDomain,
} from "@/lib/page-utils"

const EVENT_FILTER_ALL = "All"
const WAVEFORM_TIME_RANGE_OPTIONS = CONFIG.WAVEFORM_TIME_RANGES
const MAX_WAVEFORM_RANGE_MS = CONFIG.WAVEFORM_TIME_RANGES[CONFIG.WAVEFORM_TIME_RANGES.length - 1].windowMs
const MAX_WAVEFORM_HISTORY_POINTS = CONFIG.LIMITS.MAX_WAVEFORM_HISTORY_POINTS

type ConnectionStatus = "Connected" | "Offline" | "Connecting"
type VoltageHistoryPoint = {
  timestamp: number
  time: string
  voltage1: number
  voltage2: number
  voltage3: number
  voltage4: number
  voltage5: number
  voltage6: number
}

type ChannelVoltageState = {
  voltage1: number | null
  voltage2: number | null
  voltage3: number | null
  voltage4: number | null
  voltage5: number | null
  voltage6: number | null
  channel1Online: boolean
  channel2Online: boolean
  channel3Online: boolean
  channel4Online: boolean
  channel5Online: boolean
  channel6Online: boolean
}

function loadStoredEventLog(): SystemTelemetry["eventLog"] | null {
  if (typeof window === "undefined") return null
  const raw = localStorage.getItem(CONFIG.STORAGE_KEYS.EVENT_LOG)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    const events = parseEventLog(parsed)
    return events.length > 0 ? events : null
  } catch {
    return null
  }
}
export default function HomePage() {
  const [esp32Ip, setEsp32Ip] = useState<string>("")
  const [savedIp, setSavedIp] = useState<string>("")
  const [status, setStatus] = useState<ConnectionStatus>("Offline")
  const [lastUpdate, setLastUpdate] = useState<string>("Never")
  const [telemetry, setTelemetry] =
    useState<SystemTelemetry>(defaultSystemTelemetry)
  const [channels, setChannels] =
    useState<ChannelState[]>(defaultSystemTelemetry.pd.channels)
  const [voltageHistory, setVoltageHistory] =
    useState<VoltageHistoryPoint[]>([])
  const [channelVoltages, setChannelVoltages] = useState<ChannelVoltageState>({
    voltage1: null,
    voltage2: null,
    voltage3: null,
    voltage4: null,
    voltage5: null,
    voltage6: null,
    channel1Online: false,
    channel2Online: false,
    channel3Online: false,
    channel4Online: false,
    channel5Online: false,
    channel6Online: false,
  })
  const [eventLog, setEventLog] = useState<SystemTelemetry["eventLog"]>(() => {
    const stored = loadStoredEventLog()
    return stored ?? defaultSystemTelemetry.eventLog
  })
  const [eventSourceFilter, setEventSourceFilter] = useState<string>(EVENT_FILTER_ALL)
  const [eventTargetFilter, setEventTargetFilter] = useState<string>(EVENT_FILTER_ALL)
  const [eventActionFilter, setEventActionFilter] = useState<string>(EVENT_FILTER_ALL)
  const [selectedWaveformRangeMs, setSelectedWaveformRangeMs] = useState<number>(
    WAVEFORM_TIME_RANGE_OPTIONS[1].windowMs
  )
  const [isWaveformLive, setIsWaveformLive] = useState<boolean>(true)
  const [pausedWaveformHistory, setPausedWaveformHistory] =
    useState<VoltageHistoryPoint[] | null>(null)
  const [pausedDisplayChannelNumber, setPausedDisplayChannelNumber] =
    useState<number | null>(null)
  const [alarmTriggered, setAlarmTriggered] = useState<boolean>(false)
  const [alarmTime, setAlarmTime] = useState<string>("")
  const apiClientRef = useRef<ApiClient | null>(null)
  const wsManagerRef = useRef<WebSocketManager | null>(null)
  function addLog(
    source: string,
    target: string,
    action: string,
    result: string,
    notes?: string
  ) {
    const nowMs = Date.now()
    setEventLog((prev) => [
      {
        id: `evt-${nowMs}`,
        time: new Date(nowMs).toLocaleTimeString(),
        source,
        target,
        action,
        result,
        notes,
      },
      ...prev.slice(0, 24),
    ])
  }
  function resetEventLog() {
    setEventLog([])
    setEventSourceFilter(EVENT_FILTER_ALL)
    setEventTargetFilter(EVENT_FILTER_ALL)
    setEventActionFilter(EVENT_FILTER_ALL)
    localStorage.removeItem(CONFIG.STORAGE_KEYS.EVENT_LOG)
  }
  function confirmAndResetEventLog() {
    const shouldReset = window.confirm(
      "Are you sure you want to reset the event log? This cannot be undone."
    )
    if (!shouldReset) return
    resetEventLog()
  }
  function saveDeviceIp() {
    const validation = validateHost(esp32Ip)
    if (!validation.success) {
      addLog("UI", "CH Endpoint", "Connect", "Failed", `Invalid IP/hostname: ${validation.error}`)
      return
    }
    localStorage.setItem(CONFIG.STORAGE_KEYS.DEVICE_IP, validation.value)
    localStorage.removeItem(CONFIG.STORAGE_KEYS.DEVICE_IP_DRAFT)
    setEsp32Ip(validation.value)
    setSavedIp(validation.value)
    apiClientRef.current = createApiClient(validation.value)
    wsManagerRef.current = createWebSocketManager(validation.value, CONFIG.WEBSOCKET_PORT)
    wsManagerRef.current.connect().catch((error) => {
      console.warn("WebSocket connection failed, will continue with polling", error)
    })
    addLog("UI", "CH Endpoint", "Connect", `Connected to ${validation.value}`)
  }
  function disconnectDevice() {
    const trimmed = esp32Ip.trim()
    if (trimmed) {
      localStorage.setItem(CONFIG.STORAGE_KEYS.DEVICE_IP_DRAFT, trimmed)
    }
    localStorage.removeItem(CONFIG.STORAGE_KEYS.DEVICE_IP)
    setSavedIp("")
    setStatus("Offline")
    apiClientRef.current = null
    wsManagerRef.current?.disconnect()
    wsManagerRef.current = null
    addLog("UI", "CH Endpoint", "Disconnect", "Disconnected")
  }
  async function fetchTelemetry() {
    if (!savedIp || !apiClientRef.current) return
    try {
      setStatus("Connecting")
      const json = await apiClientRef.current.fetchTelemetry()
      const now = new Date().toLocaleTimeString()

      // Extract channel voltages and online status
      const newChannelVoltages: ChannelVoltageState = {
        voltage1: json.voltage1 !== undefined ? Number(json.voltage1) : null,
        voltage2: json.voltage2 !== undefined ? Number(json.voltage2) : null,
        voltage3: json.voltage3 !== undefined ? Number(json.voltage3) : null,
        voltage4: json.voltage4 !== undefined ? Number(json.voltage4) : null,
        voltage5: json.voltage5 !== undefined ? Number(json.voltage5) : null,
        voltage6: json.voltage6 !== undefined ? Number(json.voltage6) : null,
        channel1Online: json.channel1 === true,
        channel2Online: json.channel2 === true,
        channel3Online: json.channel3 === true,
        channel4Online: json.channel4 === true,
        channel5Online: json.channel5 === true,
        channel6Online: json.channel6 === true,
      }
      setChannelVoltages(newChannelVoltages)

      // Check if alarm is active from telemetry
      const alarmActive = Boolean(json.alarmActive)
      if (alarmActive && !alarmTriggered) {
        setAlarmTriggered(true)
        setAlarmTime(now)
        addLog("CH", "PD All Channels", "KILL - Intrusion Detected", "Emergency shutdown triggered", "Motion + IR confirmed")
      } else if (!alarmActive && alarmTriggered) {
        // Alarm has been cleared
        setAlarmTriggered(false)
      }

      // Update voltage history with all 6 channels
      setVoltageHistory((prev) => [
        ...prev.slice(-(MAX_WAVEFORM_HISTORY_POINTS - 1)),
        {
          timestamp: Date.now(),
          time: now,
          voltage1: newChannelVoltages.voltage1 ?? 0,
          voltage2: newChannelVoltages.voltage2 ?? 0,
          voltage3: newChannelVoltages.voltage3 ?? 0,
          voltage4: newChannelVoltages.voltage4 ?? 0,
          voltage5: newChannelVoltages.voltage5 ?? 0,
          voltage6: newChannelVoltages.voltage6 ?? 0,
        },
      ])

      setTelemetry((prev) => {
        const jsonAny = json as Record<string, unknown>
        const updatedChannels: ChannelState[] = prev.pd.channels.map((channel) => {
          const channelKey = `channel${channel.number}`
          const fallbackRelayKey = `relay${channel.number}`
          const reportedState = Boolean(
            jsonAny[channelKey] ?? jsonAny[fallbackRelayKey] ?? (channel.actualState === "on")
          )
          const actualState: CommandState = reportedState ? "on" : "off"
          const channelFault =
            typeof jsonAny[`channel${channel.number}Fault`] === "string"
              ? (jsonAny[`channel${channel.number}Fault`] as string)
              : channel.fault
          return {
            ...channel,
            phase: phaseForChannelNumber(channel.number),
            actualState,
            fault: channelFault,
            lastResponse: now,
          }
        })
        setChannels(updatedChannels)
        const nextSecurityState: SessionState =
          json.securityState === "alarm" ||
          json.securityState === "armed" ||
          json.securityState === "locked" ||
          json.securityState === "idle"
            ? (json.securityState as SessionState)
            : prev.ch.securityState
        return {
          ...prev,
          ch: {
            ...prev.ch,
            endpoint: savedIp,
            online: true,
            signalStrength: Number(json.signalStrength ?? prev.ch.signalStrength ?? 0),
            cameraOnline: Boolean(json.cameraOnline ?? prev.ch.cameraOnline),
            securityState: nextSecurityState,
            lastHeartbeat: now,
          },
          pd: {
            ...prev.pd,
            online: true,
            protocol:
              json.pdProtocol === "ESP-NOW" ||
              json.pdProtocol === "LoRa" ||
              json.pdProtocol === "Wi-Fi Bridge" ||
              json.pdProtocol === "Unknown"
                ? json.pdProtocol
                : prev.pd.protocol,
            lastHeartbeat: now,
            fault: json.pdFault ?? null,
            channels: updatedChannels,
            channelCount: updatedChannels.length,
          },
          measurements: {
            ...prev.measurements,
            voltage:
              json.voltage === undefined || json.voltage === null
                ? prev.measurements.voltage
                : Number(json.voltage),
            continuityStatus: json.continuityStatus ?? prev.measurements.continuityStatus,
            phaseDetected: json.phaseDetected ?? prev.measurements.phaseDetected,
            neutralGroundStatus:
              json.neutralGroundStatus ?? prev.measurements.neutralGroundStatus,
            freshness: `Updated ${now}`,
          },
          camera: {
            ...prev.camera,
            online: Boolean(json.cameraOnline ?? prev.camera.online),
            latestImageUrl: json.latestImageUrl ?? prev.camera.latestImageUrl,
            lastCaptureTime: json.lastCaptureTime ?? prev.camera.lastCaptureTime,
            triggerSource: json.triggerSource ?? prev.camera.triggerSource,
          },
          security: {
            ...prev.security,
            alarmActive: Boolean(json.alarmActive ?? prev.security.alarmActive),
            intrusionDetected: Boolean(
              json.intrusionDetected ?? prev.security.intrusionDetected
            ),
            auditTrailEnabled: Boolean(
              json.auditTrailEnabled ?? prev.security.auditTrailEnabled
            ),
            remoteLockout: Boolean(json.remoteLockout ?? prev.security.remoteLockout),
            killSignalReady: Boolean(json.killSignalReady ?? prev.security.killSignalReady),
            lastAlarmTime: json.lastAlarmTime ?? prev.security.lastAlarmTime,
          },
        }
      })
      setStatus("Connected")
      setLastUpdate(now)
    } catch (error) {
      const classified = classifyError(error)
      setStatus("Offline")
      addLog(
        "CH",
        "Telemetry",
        "Fetch Failed",
        classified.type,
        classified.message
      )
      setTelemetry((prev) => ({
        ...prev,
        ch: {
          ...prev.ch,
          endpoint: savedIp,
          online: false,
        },
        pd: {
          ...prev.pd,
          online: false,
        },
      }))
    }
  }
  async function toggleChannel(channelNumber: number, state: boolean) {
    if (!apiClientRef.current) return
    if (state) {
      const confirmed = window.confirm(
        `Activate Channel ${channelNumber}? This will send a live command to the panel device.`
      )
      if (!confirmed) return
    }
    const action = state ? "on" : "off"
    const now = new Date().toLocaleTimeString()
    try {
      await apiClientRef.current.setChannelState(channelNumber, action)
      setChannels((prev) =>
        prev.map((channel) => {
          if (channel.number !== channelNumber) return channel
          const nextState: CommandState = state ? "on" : "off"
          return {
            ...channel,
            commandedState: nextState,
            actualState: nextState,
            lastCommand: `${action.toUpperCase()} @ ${now}`,
            lastResponse: now,
          }
        })
      )
      addLog("UI", `PD Channel ${channelNumber}`, `Set ${action}`, "Success")
      fetchTelemetry()
    } catch (error) {
      const classified = classifyError(error)
      setStatus("Offline")
      addLog("UI", `PD Channel ${channelNumber}`, `Set ${action}`, classified.type, classified.message)
    }
  }

  async function sendChannelCommand(
    channelNumber: number,
    action: "on" | "off"
  ): Promise<boolean> {
    if (!apiClientRef.current) return false
    try {
      await apiClientRef.current.setChannelState(channelNumber, action)
      return true
    } catch (error) {
      const classified = classifyError(error)
      addLog("UI", `PD Channel ${channelNumber}`, `Set ${action}`, "Failed", classified.message)
      return false
    }
  }
  async function allOutputsOff() {
    if (!savedIp || status === "Offline" || !apiClientRef.current) return
    const now = new Date().toLocaleTimeString()
    const activeChannels = channels.filter(
      (channel) => channel.commandedState === "on" || channel.actualState === "on"
    )
    // Optimistic update so button/state feedback responds immediately.
    setChannels((prev) =>
      prev.map((channel) => ({
        ...channel,
        commandedState: "off",
        actualState: "off",
        lastCommand: `OFF @ ${now}`,
        lastResponse: now,
      }))
    )
    const activeChannelNumbers = activeChannels.map((channel) => channel.number)
    const prioritizedChannels = activeChannelNumbers.includes(6)
      ? [6, ...activeChannelNumbers.filter((number) => number !== 6)]
      : activeChannelNumbers

    if (prioritizedChannels.length > 0) {
      const result = await apiClientRef.current.setMultipleChannels(prioritizedChannels, "off")
      if (result.failed.length > 0) {
        addLog("UI", "PD All Channels", "Emergency Off", "Partial failure",
          `Failed channels: ${result.failed.map(f => f.channel).join(", ")}`)
      } else {
        addLog("UI", "PD All Channels", "Emergency Off", "Success", "All channels OFF")
      }
    }
    fetchTelemetry()
  }

  async function allOutputsOn() {
    if (!savedIp || status === "Offline" || !apiClientRef.current) return
    const now = new Date().toLocaleTimeString()
    // Keep behavior consistent with the Off action.
    setChannels((prev) =>
      prev.map((channel) => ({
        ...channel,
        commandedState: "on",
        actualState: "on",
        lastCommand: `RESTORE @ ${now}`,
        lastResponse: now,
      }))
    )
    const result = await apiClientRef.current.setMultipleChannels([1, 2, 3, 4, 5, 6], "on")
    if (result.failed.length > 0) {
      addLog("UI", "PD All Channels", "Restore/Resume", "Partial failure",
        `Failed channels: ${result.failed.map(f => f.channel).join(", ")}`)
    } else {
      addLog("UI", "PD All Channels", "Restore/Resume", "Success", "All channels restored")
    }
    fetchTelemetry()
  }
  useEffect(() => {
    const storedIp = localStorage.getItem(CONFIG.STORAGE_KEYS.DEVICE_IP)
    const draft = localStorage.getItem(CONFIG.STORAGE_KEYS.DEVICE_IP_DRAFT)
    if (storedIp) {
      const validation = validateHost(storedIp)
      if (validation.success) {
        setEsp32Ip(storedIp)
        setSavedIp(storedIp)
        apiClientRef.current = createApiClient(storedIp)
      } else {
        localStorage.removeItem(CONFIG.STORAGE_KEYS.DEVICE_IP)
      }
    } else if (draft) {
      setEsp32Ip(draft)
    }
  }, [])
  useEffect(() => {
    localStorage.setItem(CONFIG.STORAGE_KEYS.EVENT_LOG, JSON.stringify(eventLog))
  }, [eventLog])
  useEffect(() => {
    setTelemetry((prev) => ({
      ...prev,
      eventLog,
      ch: {
        ...prev.ch,
        endpoint: savedIp,
        ...(!savedIp
          ? {
              online: false,
              lastHeartbeat: "Never",
              signalStrength: 0,
              cameraOnline: false,
            }
          : {}),
      },
      pd: {
        ...prev.pd,
        channels,
        channelCount: channels.length,
        ...(!savedIp
          ? {
              online: false,
              lastHeartbeat: "Never",
            }
          : {}),
      },
    }))
  }, [channels, eventLog, savedIp])
  useEffect(() => {
    if (!savedIp) return

    fetchTelemetry()
    const interval = setInterval(fetchTelemetry, CONFIG.TELEMETRY_POLL_MS)
    return () => clearInterval(interval)
  }, [savedIp])

  useEffect(() => {
    if (!wsManagerRef.current) return

    const handleAlarmEvent = (event: AlarmEvent) => {
      const now = new Date().toLocaleTimeString()
      switch (event.type) {
        case "intrusion_detected":
          setAlarmTriggered(true)
          setAlarmTime(now)
          addLog("CH", "PD All Channels", "KILL - Intrusion Detected", "Emergency shutdown triggered", event.details || "Real-time alert")
          break
        case "kill_triggered":
          setAlarmTriggered(true)
          setAlarmTime(now)
          addLog("CH", "PD All Channels", "Kill Signal", "Executed", event.details || "Remote kill signal")
          break
        case "alarm_armed":
          addLog("CH", "Security System", "Alarm Armed", "Success")
          break
        case "alarm_disarmed":
          setAlarmTriggered(false)
          addLog("CH", "Security System", "Alarm Disarmed", "Success")
          break
        case "status_update":
          if (event.details) {
            addLog("CH", "PD Status", "Update", "Success", event.details)
          }
          break
      }
    }

    wsManagerRef.current.subscribe(handleAlarmEvent)
    return () => {
      wsManagerRef.current?.unsubscribe(handleAlarmEvent)
    }
  }, [])

  const activeChannelCount = getActiveChannelCount(channels)
  const areBulkChannelButtonsDisabled = !savedIp || status === "Offline"

  // Get the first active channel for oscilloscope-style display
  const getActiveChannelForDisplay = () => {
    for (let i = 1; i <= 6; i++) {
      const onlineKey = `channel${i}Online` as keyof ChannelVoltageState
      if (channelVoltages[onlineKey]) {
        return i
      }
    }
    return 1 // Default to channel 1 if none are online
  }

  const liveDisplayChannelNumber = getActiveChannelForDisplay()
  const displayChannelNumber = isWaveformLive
    ? liveDisplayChannelNumber
    : (pausedDisplayChannelNumber ?? liveDisplayChannelNumber)
  const displayChannelKey = `voltage${displayChannelNumber}` as keyof VoltageHistoryPoint
  const channelsOnlineCount = [1, 2, 3, 4, 5, 6].filter((ch) =>
    Boolean(channelVoltages[`channel${ch}Online` as keyof ChannelVoltageState])
  ).length
  const waveformSourceHistory = isWaveformLive
    ? voltageHistory
    : (pausedWaveformHistory ?? voltageHistory)
  const visibleVoltageHistory = useMemo(() => {
    if (waveformSourceHistory.length === 0) return []
    const latestTimestamp = waveformSourceHistory[waveformSourceHistory.length - 1].timestamp
    const cutoff = latestTimestamp - selectedWaveformRangeMs
    return waveformSourceHistory.filter((point) => point.timestamp >= cutoff)
  }, [waveformSourceHistory, selectedWaveformRangeMs])
  const toggleWaveformLive = () => {
    if (isWaveformLive) {
      setPausedWaveformHistory(voltageHistory)
      setPausedDisplayChannelNumber(liveDisplayChannelNumber)
      setIsWaveformLive(false)
      return
    }
    setPausedWaveformHistory(null)
    setPausedDisplayChannelNumber(null)
    setIsWaveformLive(true)
  }
  const waveformStats = useMemo(() => {
    const vals = visibleVoltageHistory.map((p) => p[displayChannelKey] as number)
    return calculateWaveformStats(vals)
  }, [visibleVoltageHistory, displayChannelKey])
  const waveformYDomain = useMemo((): [number, number] => {
    const vals = visibleVoltageHistory.map((p) => p[displayChannelKey] as number)
    return calculateWaveformYDomain(vals)
  }, [visibleVoltageHistory, displayChannelKey])
  const eventSourceOptions = useMemo(
    () => [EVENT_FILTER_ALL, ...new Set(eventLog.map((entry) => entry.source))],
    [eventLog]
  )
  const eventTargetOptions = useMemo(
    () => [EVENT_FILTER_ALL, ...new Set(eventLog.map((entry) => entry.target))],
    [eventLog]
  )
  const eventActionOptions = useMemo(
    () => [EVENT_FILTER_ALL, ...new Set(eventLog.map((entry) => entry.action))],
    [eventLog]
  )
  const filteredEventLog = useMemo(
    () =>
      filterEventLog(
        eventLog,
        {
          source: eventSourceFilter !== EVENT_FILTER_ALL ? eventSourceFilter : undefined,
          target: eventTargetFilter !== EVENT_FILTER_ALL ? eventTargetFilter : undefined,
          action: eventActionFilter !== EVENT_FILTER_ALL ? eventActionFilter : undefined,
        },
        EVENT_FILTER_ALL
      ),
    [eventLog, eventSourceFilter, eventTargetFilter, eventActionFilter]
  )
  const visibleEventLog = filteredEventLog.slice(0, 6)

  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Remote Panel Testing Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            User interface for Communication Hub and Panel Device control
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-5">
          <Card className="min-w-0 rounded-2xl">
            <CardContent className="min-w-0 p-3">
              <div
                className={`rounded-2xl border ${
                  alarmTriggered ? "border-red-500 bg-red-50" : "border-border bg-muted/20"
                } p-3`}
              >
                <dl>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {alarmTriggered ? "🚨 ALARM TRIGGERED" : "UI Status"}
                  </dt>
                  <dd
                    className={`mt-2 inline-block w-fit max-w-full text-base font-medium leading-snug ${
                      alarmTriggered ? "text-red-700" : ""
                    }`}
                  >
                    {alarmTriggered ? `INTRUSION - ${alarmTime}` : status}
                  </dd>
                </dl>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0 rounded-2xl">
            <CardContent className="min-w-0 p-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <dl>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    CH status
                  </dt>
                  <dd className="mt-2 inline-block w-fit max-w-full text-base font-medium leading-snug">
                    {telemetry.ch.online ? "Online" : "Offline"}
                  </dd>
                </dl>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0 rounded-2xl">
            <CardContent className="min-w-0 p-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <dl>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    PD status
                  </dt>
                  <dd className="mt-2 inline-block w-fit max-w-full text-base font-medium leading-snug">
                    {telemetry.pd.online ? "Online" : "Offline"}
                  </dd>
                </dl>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0 rounded-2xl">
            <CardContent className="min-w-0 p-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <dl>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Active channels
                  </dt>
                  <dd className="mt-2 inline-block w-fit max-w-full text-base font-medium tabular-nums leading-snug">
                    {activeChannelCount}
                  </dd>
                </dl>
              </div>
            </CardContent>
          </Card>
          <Card className="min-w-0 rounded-2xl">
            <CardContent className="min-w-0 p-3">
              <div className="rounded-2xl border border-border bg-muted/20 p-3">
                <dl>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Last update
                  </dt>
                  <dd
                    className="mt-2 block min-w-0 w-full max-w-full truncate text-base font-medium leading-snug"
                    title={lastUpdate}
                  >
                    {lastUpdate}
                  </dd>
                </dl>
              </div>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="border-b border-border/70 pb-4">
              <h2 className="text-lg font-semibold tracking-tight">CH Endpoint</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter the current IP address used by the UI to reach the communication
                hub.
              </p>
            </div>
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor="ch-endpoint" className="block text-sm font-medium mb-2">
                    Device IP Address
                  </label>
                  <Input
                    id="ch-endpoint"
                    value={esp32Ip}
                    onChange={(e) => setEsp32Ip(e.target.value)}
                    placeholder="e.g. 192.168.0.204"
                    aria-label="Communication Hub IP address or hostname"
                    aria-describedby="ch-endpoint-help"
                  />
                  <p id="ch-endpoint-help" className="text-xs text-muted-foreground mt-1">
                    Enter IPv4 address (e.g., 192.168.1.100) or hostname
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button onClick={saveDeviceIp}>Connect</Button>
                  <Button variant="destructive" onClick={disconnectDevice}>
                    Disconnect
                  </Button>
                  <Button variant="outline" onClick={fetchTelemetry}>
                    Refresh
                  </Button>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                <span className="text-muted-foreground">Connected CH:</span>{" "}
                <span className="font-medium text-foreground">
                  {telemetry.ch.endpoint || "None"}
                </span>
              </p>
            </div>
          </CardContent>
        </Card>
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Communication Hub</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Wireless bridge between the UI and the panel device
                </p>
              </div>
              <dl className="text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3 sm:justify-items-center">
                  <div className="w-fit min-w-[11rem] rounded-2xl border border-border bg-muted/20 px-3.5 py-2.5 sm:justify-self-center">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </dt>
                    <dd className="mt-0 font-medium">
                      {telemetry.ch.online ? "Online" : "Offline"}
                    </dd>
                  </div>
                  <div className="w-fit min-w-[11rem] rounded-2xl border border-border bg-muted/20 px-3.5 py-2.5 sm:justify-self-center">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Signal strength
                    </dt>
                    <dd className="mt-0 font-medium tabular-nums">
                      {telemetry.ch.online ? rssiToPercent(telemetry.ch.signalStrength) : "0%"}
                    </dd>
                  </div>
                  <div className="w-fit min-w-[11rem] rounded-2xl border border-border bg-muted/20 px-3.5 py-2.5 sm:justify-self-center">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Protocol
                    </dt>
                    <dd className="mt-0 font-medium">ESP32-S3</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold tracking-tight">Panel Device</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Slave module controlling test channels inside the panel
                </p>
              </div>
              <dl className="text-sm">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-3 sm:justify-items-center">
                  <div className="w-fit min-w-[11rem] rounded-2xl border border-border bg-muted/20 px-3.5 py-2.5 sm:justify-self-center">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Status
                    </dt>
                    <dd className="mt-0 font-medium">
                      {telemetry.pd.online ? "Online" : "Offline"}
                    </dd>
                  </div>
                  <div className="w-fit min-w-[11rem] rounded-2xl border border-border bg-muted/20 px-3.5 py-2.5 sm:justify-self-center">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Signal strength
                    </dt>
                    <dd className="mt-0 font-medium tabular-nums">
                      {telemetry.ch.online ? rssiToPercent(telemetry.ch.signalStrength) : "0%"}
                    </dd>
                  </div>
                  <div className="w-fit min-w-[11rem] rounded-2xl border border-border bg-muted/20 px-3.5 py-2.5 sm:justify-self-center">
                    <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Protocol
                    </dt>
                    <dd className="mt-0 font-medium">ESP32</dd>
                  </div>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
        <Card>
          <CardContent className="space-y-4 p-5">
            <div className="border-b border-border/70 pb-4">
              <h2 className="text-lg font-semibold tracking-tight">Panel Test Channels</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Remote control and status for each PD output channel
              </p>
            </div>
            <div className="flex flex-wrap gap-2 rounded-lg border bg-muted/30 p-3">
              <Button
                onClick={allOutputsOn}
                disabled={areBulkChannelButtonsDisabled}
                aria-label={`Turn all ${6} channels on (currently ${activeChannelCount} active)`}
                className={`text-white transition-[color,background-color,transform] duration-200 ease-out ${
                  activeChannelCount === 6
                    ? "bg-green-600 hover:bg-green-700 active:bg-green-800"
                    : "bg-gray-600 hover:bg-gray-700 active:bg-gray-800"
                }`}
              >
                All Channels On
              </Button>
              <Button
                onClick={allOutputsOff}
                disabled={areBulkChannelButtonsDisabled}
                aria-label={`Turn all ${6} channels off (currently ${activeChannelCount} active)`}
                className={`text-white transition-[color,background-color,transform] duration-200 ease-out ${
                  activeChannelCount === 0
                    ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                    : "bg-gray-600 hover:bg-gray-700 active:bg-gray-800"
                }`}
              >
                All Channels Off
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {channels.map((channel) => {
                const legacyStatus = mapChannelStateToLegacyStatus(channel)
                const isActive = legacyStatus === "active"
                const isFault = legacyStatus === "fault"
                return (
                  <Card key={channel.number} className="border">
                    <CardContent className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3 border-b border-border/70 pb-3">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold tracking-tight">
                            Channel {channel.number}
                          </h3>
                          <p className="text-sm text-muted-foreground">{channel.label}</p>
                        </div>
                        <Badge
                          className={`shrink-0 ${
                            isFault
                              ? "bg-red-100 text-red-700"
                              : isActive
                                ? "bg-green-100 text-green-700"
                                : "bg-black text-white"
                          }`}
                        >
                          {isFault ? "Fault" : isActive ? "Active" : "Off"}
                        </Badge>
                      </div>

                      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Phase
                          </dt>
                          <dd className="mt-0.5 font-medium">
                            {phaseForChannelNumber(channel.number)}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Pin
                          </dt>
                          <dd className="mt-0.5 font-medium">{channel.gpio}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Fault
                          </dt>
                          <dd className="mt-0.5 font-medium">{channel.fault ?? "None"}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Last command
                          </dt>
                          <dd
                            className="mt-0.5 truncate font-medium"
                            title={channel.lastCommand ?? undefined}
                          >
                            {channel.lastCommand ?? "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Commanded
                          </dt>
                          <dd className="mt-0.5 font-medium capitalize">
                            {channel.commandedState}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Actual
                          </dt>
                          <dd
                            className={`mt-0.5 font-medium capitalize ${
                              channel.commandedState !== channel.actualState
                                ? "text-amber-700"
                                : ""
                            }`}
                          >
                            {channel.actualState}
                          </dd>
                        </div>
                      </dl>

                      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                        <label htmlFor={`channel-${channel.number}-toggle`} className="text-sm font-medium">
                          Remote output
                        </label>
                        <Switch
                          id={`channel-${channel.number}-toggle`}
                          checked={isActive}
                          onCheckedChange={(value) => toggleChannel(channel.number, value)}
                          disabled={status === "Offline"}
                          aria-label={`Toggle Channel ${channel.number} (${channel.label}) - currently ${isActive ? "on" : "off"}`}
                          className={
                            isActive
                              ? "!bg-green-500 data-[state=checked]:bg-green-500"
                              : "!bg-black data-[state=unchecked]:bg-black"
                          }
                        />
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </CardContent>
        </Card>
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-0 p-5">
              <div className="mb-6 border-b border-border/70 pb-6">
                <h2 className="text-xl font-semibold tracking-tight">Electrical Telemetry</h2>
                <p className="mt-1 text-base text-muted-foreground">
                  Live channel voltage readings with automatic waveform switching
                </p>
              </div>

              {/* 2-Column layout: All Channel Voltages (Left) and Live Waveform (Right) */}
              <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                {/* All Channel Voltages Table */}
                <div className="min-w-0 space-y-4">
                  <div className="flex h-full flex-col rounded-lg border border-gray-200 p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-lg font-semibold tracking-tight text-foreground">
                            All Channel Voltages
                          </div>
                          <div className="text-base leading-snug text-muted-foreground">
                            Updates every 2 seconds
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm text-muted-foreground">Channels online</div>
                          <div className="text-base font-semibold tabular-nums">
                            {channelsOnlineCount} / 6
                          </div>
                          <div className="text-sm text-muted-foreground">PD telemetry</div>
                        </div>
                      </div>
                      <div className="w-full min-w-0">
                        <div className="space-y-2">
                          {[1, 2, 3, 4, 5, 6].map((ch) => {
                            const voltageKey = `voltage${ch}` as keyof ChannelVoltageState
                            const onlineKey = `channel${ch}Online` as keyof ChannelVoltageState
                            const voltage = channelVoltages[voltageKey] as number | null
                            const isOnline = channelVoltages[onlineKey] as boolean
                            const isOffline = !isOnline || voltage === null || voltage === 0

                            return (
                              <div
                                key={ch}
                                className={`flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-3 text-base ${
                                  isOffline ? "opacity-50" : ""
                                }`}
                              >
                                <span className="min-w-0 flex-1 font-medium">Channel {ch}</span>
                                <span className="shrink-0 font-semibold tabular-nums">
                                  {voltage !== null && typeof voltage === "number"
                                    ? voltage.toFixed(3)
                                    : "--"}{" "}
                                  V
                                </span>
                                <span className="inline-flex w-[3.25rem] shrink-0 justify-center rounded-full border border-gray-300 px-2 py-1 text-sm font-medium text-gray-700">
                                  {isOnline && voltage !== null && voltage !== 0 ? "ON" : "OFF"}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Voltage RMS Chart - Live Waveform */}
                <div className="min-w-0 space-y-4">
                  <div className="flex h-full flex-col rounded-lg border border-gray-200 p-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1 pr-2">
                          <div className="text-lg font-semibold tracking-tight">Live Waveform</div>
                          <div className="text-base leading-snug text-muted-foreground">
                            Auto-switches to the currently active channel
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-sm text-muted-foreground">Displayed Channel</div>
                          <div className="text-base font-semibold tabular-nums">
                            Channel {displayChannelNumber}
                          </div>
                          <div
                            className={`mt-2 inline-flex min-w-[7rem] flex-col items-end rounded-md border px-2 py-1 shadow-sm ${
                              waveformStats.latest === null
                                ? "border-gray-300 bg-muted/40 text-muted-foreground"
                                : "border-primary/40 bg-primary/10 text-primary"
                            }`}
                          >
                            <span className="text-[10px] font-semibold uppercase tracking-wide">
                              Live Voltage
                            </span>
                            <span className="text-lg font-semibold leading-none tabular-nums">
                              {formatVoltageStat(waveformStats.latest)}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 px-2.5 py-1.5">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={isWaveformLive ? "default" : "secondary"}
                            className={isWaveformLive ? "bg-emerald-600 text-white" : ""}
                          >
                            {isWaveformLive ? "Live" : "Paused"}
                          </Badge>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={toggleWaveformLive}
                          >
                            {isWaveformLive ? "Pause" : "Resume"}
                          </Button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">Time range</span>
                          {WAVEFORM_TIME_RANGE_OPTIONS.map((option) => {
                            const isActive = selectedWaveformRangeMs === option.windowMs
                            return (
                              <Button
                                key={option.windowMs}
                                type="button"
                                size="sm"
                                variant={isActive ? "default" : "outline"}
                                className="min-w-12"
                                onClick={() => setSelectedWaveformRangeMs(option.windowMs)}
                                aria-pressed={isActive}
                              >
                                {option.label}
                              </Button>
                            )
                          })}
                        </div>
                      </div>
                      <div className="h-[22rem] w-full min-h-[22rem] min-w-0">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                          <LineChart
                            data={visibleVoltageHistory}
                            margin={{ top: 16, right: 14, left: 6, bottom: 12 }}
                          >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                            <XAxis
                              dataKey="time"
                              stroke="#6b7280"
                              tick={{ fill: "#6b7280", fontSize: 12 }}
                              tickFormatter={(t) => {
                                if (typeof t !== "string") return String(t)
                                const m = t.match(/(\d{1,2}:\d{2}:\d{2})/)
                                return m ? m[1] : t.length > 10 ? `${t.slice(0, 8)}…` : t
                              }}
                              interval="preserveStartEnd"
                              minTickGap={28}
                              height={34}
                              tickMargin={6}
                            />
                            <YAxis
                              stroke="#6b7280"
                              tick={{ fill: "#6b7280", fontSize: 12 }}
                              domain={waveformYDomain}
                              tickFormatter={(v) => `${Number(v).toFixed(2)}`}
                              width={48}
                              tickMargin={6}
                            />
                            <Tooltip
                              contentStyle={{ fontSize: 14 }}
                              labelStyle={{ fontSize: 13, marginBottom: 4 }}
                              formatter={(value: unknown) => {
                                if (typeof value === "number") {
                                  return [`${value.toFixed(3)} V`, `Ch ${displayChannelNumber}`]
                                }
                                return ["--", `Ch ${displayChannelNumber}`]
                              }}
                              labelFormatter={(label) => `Time: ${label}`}
                            />
                            <Line
                              type="monotone"
                              dataKey={displayChannelKey}
                              stroke="#3b82f6"
                              strokeWidth={2}
                              dot={false}
                              isAnimationActive={false}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3 pb-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">Event Log</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Command history and operator actions
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={confirmAndResetEventLog}
                  disabled={eventLog.length === 0}
                >
                  Reset Event Log
                </Button>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label htmlFor="event-source-filter" className="space-y-1 text-xs font-medium text-muted-foreground">
                  Source
                  <select
                    id="event-source-filter"
                    value={eventSourceFilter}
                    onChange={(e) => setEventSourceFilter(e.target.value)}
                    aria-label="Filter event log by source (UI, CH, or PD)"
                    className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  >
                    {eventSourceOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="event-target-filter" className="space-y-1 text-xs font-medium text-muted-foreground">
                  Target
                  <select
                    id="event-target-filter"
                    value={eventTargetFilter}
                    onChange={(e) => setEventTargetFilter(e.target.value)}
                    aria-label="Filter event log by target device"
                    className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  >
                    {eventTargetOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor="event-action-filter" className="space-y-1 text-xs font-medium text-muted-foreground">
                  Action
                  <select
                    id="event-action-filter"
                    value={eventActionFilter}
                    onChange={(e) => setEventActionFilter(e.target.value)}
                    aria-label="Filter event log by action"
                    className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                  >
                    {eventActionOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {visibleEventLog.length === 0 ? (
                <div className="rounded-lg border bg-muted/20 px-2 py-3 text-sm text-muted-foreground">
                  {eventLog.length === 0
                    ? "No events logged yet."
                    : "No events match the selected filters."}
                </div>
              ) : (
                visibleEventLog.map((entry, index) => {
                  const eventStatus = getEventStatus(entry.result, entry.action, entry.notes)
                  const connectedToMatch = entry.result.match(/^connected to\s+(.+)$/i)
                  const isConnectEvent =
                    entry.action.toLowerCase() === "connect" && connectedToMatch !== null
                  return (
                    <div
                      key={`${entry.id}-${index}`}
                      className="rounded-md border bg-card p-3 text-sm shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {entry.time}
                        </div>
                        <Badge className={getEventStatusBadgeClass(eventStatus)}>
                          {eventStatus}
                        </Badge>
                      </div>
                      <div className="mt-1 text-muted-foreground">
                        {entry.source} → {entry.target}
                      </div>
                      {eventStatus !== "Disconnected" ? (
                        isConnectEvent ? (
                          <div className="mt-1">
                            Connected to{" "}
                            <span className="font-semibold tabular-nums">
                              {connectedToMatch[1]}
                            </span>
                          </div>
                        ) : (
                          <div className="mt-1">
                            {entry.action} · <span className="font-medium">{entry.result}</span>
                          </div>
                        )
                      ) : null}
                      {entry.notes ? (
                        <div className="mt-1 text-muted-foreground">{entry.notes}</div>
                      ) : null}
                    </div>
                  )
                })
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}
