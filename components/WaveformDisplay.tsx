"use client"

import { useMemo } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { calculateWaveformStats, calculateWaveformYDomain } from "@/lib/page-utils"
import { CONFIG } from "@/lib/config"

interface VoltageHistoryPoint {
  timestamp: number
  time: string
  voltage1: number
  voltage2: number
  voltage3: number
  voltage4: number
  voltage5: number
  voltage6: number
}

interface WaveformDisplayProps {
  voltageHistory: VoltageHistoryPoint[]
  pausedWaveformHistory: VoltageHistoryPoint[] | null
  isLive: boolean
  displayChannelNumber: number
  selectedTimeRangeMs: number
  onToggleLive: () => void
  onTimeRangeChange: (rangeMs: number) => void
}

export function WaveformDisplay({
  voltageHistory,
  pausedWaveformHistory,
  isLive,
  displayChannelNumber,
  selectedTimeRangeMs,
  onToggleLive,
  onTimeRangeChange,
}: WaveformDisplayProps) {
  const displayChannelKey = `voltage${displayChannelNumber}` as keyof VoltageHistoryPoint

  const waveformSourceHistory = isLive
    ? voltageHistory
    : (pausedWaveformHistory ?? voltageHistory)

  const visibleVoltageHistory = useMemo(() => {
    if (waveformSourceHistory.length === 0) return []
    const latestTimestamp = waveformSourceHistory[waveformSourceHistory.length - 1].timestamp
    const cutoff = latestTimestamp - selectedTimeRangeMs
    return waveformSourceHistory.filter((point) => point.timestamp >= cutoff)
  }, [waveformSourceHistory, selectedTimeRangeMs])

  const waveformStats = useMemo(() => {
    const vals = visibleVoltageHistory.map((p) => p[displayChannelKey] as number)
    return calculateWaveformStats(vals)
  }, [visibleVoltageHistory, displayChannelKey])

  const waveformYDomain = useMemo((): [number, number] => {
    const vals = visibleVoltageHistory.map((p) => p[displayChannelKey] as number)
    return calculateWaveformYDomain(vals)
  }, [visibleVoltageHistory, displayChannelKey])

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div className="border-b border-border/70 pb-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">
              Channel {displayChannelNumber} Voltage Waveform
            </h2>
            <Button
              size="sm"
              variant={isLive ? "default" : "outline"}
              onClick={onToggleLive}
              aria-label={isLive ? "Pause waveform display" : "Resume live waveform"}
            >
              {isLive ? "⏸ Pause" : "▶ Live"}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Oscilloscope-style voltage display with {displayChannelNumber} active
          </p>
        </div>

        {visibleVoltageHistory.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={300} className="rounded-lg border bg-muted/20">
              <LineChart
                data={visibleVoltageHistory}
                margin={{ top: 5, right: 20, left: 0, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" tick={{ fontSize: 12 }} />
                <YAxis domain={waveformYDomain} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value: unknown): string => {
                    if (typeof value === "number") {
                      return value.toFixed(2)
                    }
                    return String(value)
                  }}
                />
                <Line
                  type="monotone"
                  dataKey={displayChannelKey}
                  stroke="#2563eb"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>

            <div className="grid grid-cols-4 gap-2 rounded-lg border bg-muted/30 p-3">
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Min
                </dt>
                <dd className="mt-1 text-base font-medium">
                  {waveformStats.min !== null ? waveformStats.min.toFixed(2) : "—"}V
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Max
                </dt>
                <dd className="mt-1 text-base font-medium">
                  {waveformStats.max !== null ? waveformStats.max.toFixed(2) : "—"}V
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Avg
                </dt>
                <dd className="mt-1 text-base font-medium">
                  {waveformStats.avg !== null ? waveformStats.avg.toFixed(2) : "—"}V
                </dd>
              </div>
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  RMS
                </dt>
                <dd className="mt-1 text-base font-medium">
                  {waveformStats.rms !== null ? waveformStats.rms.toFixed(2) : "—"}V
                </dd>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {CONFIG.WAVEFORM_TIME_RANGES.map((range) => (
                <Button
                  key={range.label}
                  size="sm"
                  variant={selectedTimeRangeMs === range.windowMs ? "default" : "outline"}
                  onClick={() => onTimeRangeChange(range.windowMs)}
                >
                  {range.label}
                </Button>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">No waveform data yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Connect to a device to start receiving voltage readings
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
