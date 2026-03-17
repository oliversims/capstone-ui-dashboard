"use client"

import { useEffect, useState } from "react"
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

type ConnectionStatus = "Connected" | "Offline" | "Connecting"

type ChannelPhase = "A" | "B" | "C"

type Channel = {
  id: string
  number: number
  label: string
  phase: ChannelPhase
  gpio: number
  active: boolean
  armed: boolean
  fault: string | null
  lastCommand: string
}

type PanelDevice = {
  id: string
  label: string
  online: boolean
  protocol: "ESP-NOW" | "LoRa" | "Wi-Fi"
  lastHeartbeat: string
  fault: string | null
  channels: Channel[]
}

type HubStatus = {
  id: string
  online: boolean
  signalStrength: number
  cameraOnline: boolean
  securityState: "Locked" | "Unlocked" | "Fault"
  lastHeartbeat: string
}

type Telemetry = {
  voltage: number
  current: number
  power: number
  hub: HubStatus
  pd: PanelDevice
}

type VoltageHistoryPoint = {
  time: string
  voltage: number
}

type EventLogEntry = {
  time: string
  source: string
  target: string
  action: string
  result: string
}

const DEFAULT_IP = "192.168.0.204"

export default function HomePage() {
  const [esp32Ip, setEsp32Ip] = useState(DEFAULT_IP)
  const [savedIp, setSavedIp] = useState(DEFAULT_IP)
  const [status, setStatus] = useState<ConnectionStatus>("Offline")
  const [lastUpdate, setLastUpdate] = useState("Never")

  const [data, setData] = useState<Telemetry>({
    voltage: 0,
    current: 0,
    power: 0,
    hub: {
      id: "CH-01",
      online: false,
      signalStrength: 0,
      cameraOnline: false,
      securityState: "Locked",
      lastHeartbeat: "Never",
    },
    pd: {
      id: "PD-01",
      label: "Main Panel Device",
      online: false,
      protocol: "Wi-Fi",
      lastHeartbeat: "Never",
      fault: null,
      channels: [
        {
          id: "ch1",
          number: 1,
          label: "Phase A – Test Output 1",
          phase: "A",
          gpio: 4,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch2",
          number: 2,
          label: "Phase A – Test Output 2",
          phase: "A",
          gpio: 5,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch3",
          number: 3,
          label: "Phase A – Test Output 3",
          phase: "A",
          gpio: 12,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch4",
          number: 4,
          label: "Phase B – Test Output 1",
          phase: "B",
          gpio: 13,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch5",
          number: 5,
          label: "Phase B – Test Output 2",
          phase: "B",
          gpio: 14,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch6",
          number: 6,
          label: "Phase B – Test Output 3",
          phase: "B",
          gpio: 15,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch7",
          number: 7,
          label: "Phase C – Test Output 1",
          phase: "C",
          gpio: 16,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch8",
          number: 8,
          label: "Phase C – Test Output 2",
          phase: "C",
          gpio: 17,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
        {
          id: "ch9",
          number: 9,
          label: "Phase C – Test Output 3",
          phase: "C",
          gpio: 18,
          active: false,
          armed: false,
          fault: null,
          lastCommand: "None",
        },
      ],
    },
  })

  const [voltageHistory, setVoltageHistory] = useState<VoltageHistoryPoint[]>([])
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])

  function addLog(source: string, target: string, action: string, result: string) {
    setEventLog((prev) => [
      {
        time: new Date().toLocaleTimeString(),
        source,
        target,
        action,
        result,
      },
      ...prev.slice(0, 24),
    ])
  }

  function saveDeviceIp() {
    localStorage.setItem("esp32_ip", esp32Ip)
    setSavedIp(esp32Ip)
    addLog("AP", "CH Address", "Save IP", `Saved ${esp32Ip}`)
  }

  async function fetchTelemetry() {
    try {
      setStatus("Connecting")

      const res = await fetch(`http://${savedIp}/telemetry`, {
        method: "GET",
      })

      if (!res.ok) {
        throw new Error("Failed to fetch telemetry")
      }

      const json = await res.json()

      setData((prev) => {
        const updatedChannels = prev.pd.channels.map((channel) => {
          const channelKey = `channel${channel.number}`
          const fallbackRelayKey = `relay${channel.number}`

          return {
            ...channel,
            active: Boolean(json[channelKey] ?? json[fallbackRelayKey] ?? channel.active),
          }
        })

        return {
          voltage: Number(json.voltage ?? 0),
          current: Number(json.current ?? 0),
          power: Number(json.power ?? 0),
          hub: {
            ...prev.hub,
            online: true,
            signalStrength: Number(json.signalStrength ?? prev.hub.signalStrength ?? 0),
            cameraOnline: Boolean(json.cameraOnline ?? prev.hub.cameraOnline),
            securityState:
              json.securityState === "Unlocked" ||
              json.securityState === "Fault" ||
              json.securityState === "Locked"
                ? json.securityState
                : prev.hub.securityState,
            lastHeartbeat: new Date().toLocaleTimeString(),
          },
          pd: {
            ...prev.pd,
            online: true,
            lastHeartbeat: new Date().toLocaleTimeString(),
            fault: json.pdFault ?? null,
            channels: updatedChannels,
          },
        }
      })

      setVoltageHistory((prev) => [
        ...prev.slice(-19),
        {
          time: new Date().toLocaleTimeString(),
          voltage: Number(json.voltage ?? 0),
        },
      ])

      setStatus("Connected")
      setLastUpdate(new Date().toLocaleTimeString())
    } catch (error) {
      console.log("ESP32 offline", error)
      setStatus("Offline")

      setData((prev) => ({
        ...prev,
        hub: {
          ...prev.hub,
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
    if (state) {
      const confirmed = window.confirm(
        `Activate Channel ${channelNumber}? This will send a live command to the panel device.`
      )
      if (!confirmed) return
    }

    const action = state ? "on" : "off"

    try {
      const res = await fetch(`http://${savedIp}/channel/${channelNumber}/${action}`, {
        method: "GET",
      })

      if (!res.ok) {
        throw new Error(`Channel ${channelNumber} ${action} failed`)
      }

      setData((prev) => ({
        ...prev,
        pd: {
          ...prev.pd,
          channels: prev.pd.channels.map((channel) =>
            channel.number === channelNumber
              ? {
                  ...channel,
                  active: state,
                  lastCommand: `${action.toUpperCase()} @ ${new Date().toLocaleTimeString()}`,
                }
              : channel
          ),
        },
      }))

      addLog("AP", `PD Channel ${channelNumber}`, `Set ${action}`, "Success")
      fetchTelemetry()
    } catch (error) {
      console.log(`Failed to toggle channel ${channelNumber}`, error)
      setStatus("Offline")
      addLog("AP", `PD Channel ${channelNumber}`, `Set ${action}`, "Failed")
    }
  }

  async function allOutputsOff() {
    const activeChannels = data.pd.channels.filter((channel) => channel.active)

    for (const channel of activeChannels) {
      try {
        await fetch(`http://${savedIp}/channel/${channel.number}/off`, {
          method: "GET",
        })
      } catch (error) {
        console.log(`Failed to turn off channel ${channel.number}`, error)
      }
    }

    setData((prev) => ({
      ...prev,
      pd: {
        ...prev.pd,
        channels: prev.pd.channels.map((channel) => ({
          ...channel,
          active: false,
          lastCommand: `OFF @ ${new Date().toLocaleTimeString()}`,
        })),
      },
    }))

    addLog("AP", "All Channels", "Emergency Off", "Completed")
    fetchTelemetry()
  }

  useEffect(() => {
    const storedIp = localStorage.getItem("esp32_ip")
    if (storedIp) {
      setEsp32Ip(storedIp)
      setSavedIp(storedIp)
    }
  }, [])

  useEffect(() => {
    fetchTelemetry()
    const interval = setInterval(fetchTelemetry, 2000)
    return () => clearInterval(interval)
  }, [savedIp])

  const activeChannelCount = data.pd.channels.filter((channel) => channel.active).length

  return (
    <main className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Remote Panel Testing Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            AP interface for Communication Hub and Panel Device control
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">AP Status</div>
              <div className="mt-2 text-lg font-medium">{status}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">CH Status</div>
              <div className="mt-2 text-lg font-medium">
                {data.hub.online ? "Online" : "Offline"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">PD Status</div>
              <div className="mt-2 text-lg font-medium">
                {data.pd.online ? "Online" : "Offline"}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Active Channels</div>
              <div className="mt-2 text-lg font-medium">{activeChannelCount}</div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-muted-foreground">Last Update</div>
              <div className="mt-2 text-lg font-medium">{lastUpdate}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="flex flex-col gap-4 p-5 md:flex-row md:items-end">
            <div className="flex-1 space-y-2">
              <div className="text-sm font-medium">Communication Hub Address</div>
              <p className="text-sm text-muted-foreground">
                Enter the current IP address used by the AP to reach the hub or prototype
                ESP32.
              </p>
              <Input
                value={esp32Ip}
                onChange={(e) => setEsp32Ip(e.target.value)}
                placeholder="192.168.0.204"
              />
              <p className="text-sm text-muted-foreground">Active device: {savedIp}</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={saveDeviceIp}>Save</Button>
              <Button variant="outline" onClick={fetchTelemetry}>
                Refresh
              </Button>
              <Button variant="destructive" onClick={allOutputsOff}>
                All Outputs Off
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Communication Hub</h2>
                <p className="text-sm text-muted-foreground">
                  Wireless bridge between the AP and the panel device
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">Hub ID</div>
                  <div className="font-medium">{data.hub.id}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-medium">
                    {data.hub.online ? "Online" : "Offline"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Signal Strength</div>
                  <div className="font-medium">{data.hub.signalStrength}%</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Camera</div>
                  <div className="font-medium">
                    {data.hub.cameraOnline ? "Online" : "Offline"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Security</div>
                  <div className="font-medium">{data.hub.securityState}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Heartbeat</div>
                  <div className="font-medium">{data.hub.lastHeartbeat}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Panel Device</h2>
                <p className="text-sm text-muted-foreground">
                  Slave module controlling test channels inside the panel
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">PD ID</div>
                  <div className="font-medium">{data.pd.id}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Label</div>
                  <div className="font-medium">{data.pd.label}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Status</div>
                  <div className="font-medium">
                    {data.pd.online ? "Online" : "Offline"}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Protocol</div>
                  <div className="font-medium">{data.pd.protocol}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Heartbeat</div>
                  <div className="font-medium">{data.pd.lastHeartbeat}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Fault</div>
                  <div className="font-medium">{data.pd.fault ?? "None"}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold">Panel Test Channels</h2>
              <p className="text-sm text-muted-foreground">
                Remote control and status for each PD output channel
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data.pd.channels.map((channel) => (
                <Card key={channel.id} className="border">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold">
                          Channel {channel.number}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {channel.label}
                        </div>
                      </div>
                      <Badge variant={channel.active ? "default" : "secondary"}>
                        {channel.active ? "Active" : "Off"}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-muted-foreground">Phase</div>
                        <div className="font-medium">{channel.phase}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">GPIO</div>
                        <div className="font-medium">{channel.gpio}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Fault</div>
                        <div className="font-medium">{channel.fault ?? "None"}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Last Command</div>
                        <div className="font-medium">{channel.lastCommand}</div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <div className="text-sm font-medium">Output Control</div>
                        <div className="text-xs text-muted-foreground">
                          Send command to panel device
                        </div>
                      </div>

                      <Switch
                        checked={channel.active}
                        onCheckedChange={(value) =>
                          toggleChannel(channel.number, value)
                        }
                        disabled={status === "Offline"}
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Electrical Telemetry</h2>
                <p className="text-sm text-muted-foreground">
                  Live readings reported by the current prototype device
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">Voltage RMS</div>
                  <div className="text-xl font-semibold">{data.voltage} V</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Current RMS</div>
                  <div className="text-xl font-semibold">{data.current} A</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Power</div>
                  <div className="text-xl font-semibold">{data.power} W</div>
                </div>
              </div>

              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={voltageHistory}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" />
                    <YAxis />
                    <Tooltip />
                    <Line type="monotone" dataKey="voltage" stroke="currentColor" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Event Log</h2>
                <p className="text-sm text-muted-foreground">
                  Command history and operator actions
                </p>
              </div>

              <div className="max-h-64 space-y-2 overflow-auto">
                {eventLog.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No events logged yet.
                  </div>
                ) : (
                  eventLog.map((entry, index) => (
                    <div
                      key={`${entry.time}-${index}`}
                      className="rounded-lg border p-3 text-sm"
                    >
                      <div className="font-medium">{entry.time}</div>
                      <div className="text-muted-foreground">
                        {entry.source} → {entry.target}
                      </div>
                      <div>
                        {entry.action} ·{" "}
                        <span className="font-medium">{entry.result}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Camera Feed</h2>
                <p className="text-sm text-muted-foreground">
                  Remote visual confirmation for panel and room monitoring
                </p>
              </div>

              <div className="flex h-64 items-center justify-center rounded-xl border border-dashed bg-muted/30">
                <div className="text-center text-sm text-muted-foreground">
                  {data.hub.cameraOnline
                    ? "Camera stream ready for integration"
                    : "Camera offline / not integrated yet"}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 p-5">
              <div>
                <h2 className="text-lg font-semibold">Security & Access</h2>
                <p className="text-sm text-muted-foreground">
                  Session state and command protection
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <div className="text-sm text-muted-foreground">Session</div>
                  <div className="font-medium">Active</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Control Lock</div>
                  <div className="font-medium">{data.hub.securityState}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">User Role</div>
                  <div className="font-medium">Operator</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">Audit Trail</div>
                  <div className="font-medium">Enabled</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

