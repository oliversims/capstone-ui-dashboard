"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import type { ChannelState, CommandState } from "@/lib/types"
import { phaseForChannelNumber } from "@/lib/page-utils"

interface ChannelControlPanelProps {
  channels: ChannelState[]
  channelVoltages: Record<string, number | boolean | null>
  connectionStatus: string
  activeChannelCount: number
  onChannelToggle: (channelNumber: number, state: boolean) => void
  onAllOn: () => void
  onAllOff: () => void
}

function getStateColor(state: CommandState): string {
  switch (state) {
    case "on":
      return "bg-green-100 text-green-800 border-green-300"
    case "off":
      return "bg-gray-100 text-gray-800 border-gray-300"
    case "pending":
      return "bg-yellow-100 text-yellow-800 border-yellow-300"
    case "fault":
      return "bg-red-100 text-red-800 border-red-300"
    case "no-ack":
      return "bg-orange-100 text-orange-800 border-orange-300"
    default:
      return "bg-gray-50 text-gray-600 border-gray-200"
  }
}

export function ChannelControlPanel({
  channels,
  channelVoltages,
  connectionStatus,
  activeChannelCount,
  onChannelToggle,
  onAllOn,
  onAllOff,
}: ChannelControlPanelProps) {
  const isDisabled = connectionStatus === "Offline"
  const bulkControlsDisabled = !channelVoltages || Object.keys(channelVoltages).length === 0 || isDisabled

  return (
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
            onClick={onAllOn}
            disabled={bulkControlsDisabled}
            aria-label={`Turn all ${channels.length} channels on (currently ${activeChannelCount} active)`}
            className={`text-white transition-[color,background-color,transform] duration-200 ease-out ${
              activeChannelCount === channels.length
                ? "bg-green-600 hover:bg-green-700 active:bg-green-800"
                : "bg-gray-600 hover:bg-gray-700 active:bg-gray-800"
            }`}
          >
            All Channels On
          </Button>
          <Button
            onClick={onAllOff}
            disabled={bulkControlsDisabled}
            aria-label={`Turn all ${channels.length} channels off (currently ${activeChannelCount} active)`}
            className={`text-white transition-[color,background-color,transform] duration-200 ease-out ${
              activeChannelCount === 0
                ? "bg-red-600 hover:bg-red-700 active:bg-red-800"
                : "bg-gray-600 hover:bg-gray-700 active:bg-gray-800"
            }`}
          >
            All Channels Off
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {channels.map((channel) => {
            const voltageKey = `voltage${channel.number}`
            const onlineKey = `channel${channel.number}Online`
            const voltage = channelVoltages?.[voltageKey]
            const isOnline = channelVoltages?.[onlineKey]
            const isActive = channel.actualState === "on"

            return (
              <Card key={channel.number} className="overflow-hidden">
                <CardContent className="space-y-3 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-sm font-semibold tracking-tight">
                        {channel.label}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        {channel.phase ? `Phase ${channel.phase}` : "Unknown"}
                      </p>
                    </div>
                    <Badge variant={isOnline ? "default" : "secondary"}>
                      {isOnline ? "Online" : "Offline"}
                    </Badge>
                  </div>

                  <dl className="text-xs">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <dt className="font-medium text-muted-foreground">Voltage</dt>
                        <dd className="font-mono text-foreground">
                          {typeof voltage === "number" ? voltage.toFixed(2) : "—"}V
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-muted-foreground">GPIO</dt>
                        <dd className="font-mono text-foreground">{channel.gpio}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-muted-foreground">Commanded</dt>
                        <dd
                          className={`font-mono font-semibold capitalize border rounded px-1.5 py-0.5 ${getStateColor(
                            channel.commandedState
                          )}`}
                        >
                          {channel.commandedState}
                        </dd>
                      </div>
                      <div>
                        <dt className="font-medium text-muted-foreground">Actual</dt>
                        <dd
                          className={`font-mono font-semibold capitalize border rounded px-1.5 py-0.5 ${getStateColor(
                            channel.actualState
                          )}`}
                        >
                          {channel.actualState}
                        </dd>
                      </div>
                    </div>
                  </dl>

                  <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
                    <label htmlFor={`channel-${channel.number}-toggle`} className="text-sm font-medium">
                      Remote output
                    </label>
                    <Switch
                      id={`channel-${channel.number}-toggle`}
                      checked={isActive}
                      onCheckedChange={(value) => onChannelToggle(channel.number, value)}
                      disabled={isDisabled}
                      aria-label={`Toggle Channel ${channel.number} (${channel.label}) - currently ${
                        isActive ? "on" : "off"
                      }`}
                      className={
                        isActive
                          ? "!bg-green-500 data-[state=checked]:bg-green-500"
                          : "!bg-black data-[state=unchecked]:bg-black"
                      }
                    />
                  </div>

                  {channel.fault && (
                    <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                      <p className="text-xs text-red-700">
                        <strong>Fault:</strong> {channel.fault}
                      </p>
                    </div>
                  )}

                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      <strong>Last Cmd:</strong> {channel.lastCommand || "None"}
                    </p>
                    <p>
                      <strong>Last Resp:</strong> {channel.lastResponse || "Never"}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
