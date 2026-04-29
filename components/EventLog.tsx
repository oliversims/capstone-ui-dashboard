"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { EventLogEntry } from "@/lib/types"
import { getEventStatusBadgeClass, getEventStatus } from "@/lib/page-utils"

interface EventLogProps {
  events: EventLogEntry[]
  sourceOptions: string[]
  targetOptions: string[]
  actionOptions: string[]
  sourceFilter: string
  targetFilter: string
  actionFilter: string
  onSourceFilterChange: (value: string) => void
  onTargetFilterChange: (value: string) => void
  onActionFilterChange: (value: string) => void
  onResetLog: () => void
  visibleEvents: EventLogEntry[]
}

export function EventLog({
  events,
  sourceOptions,
  targetOptions,
  actionOptions,
  sourceFilter,
  targetFilter,
  actionFilter,
  onSourceFilterChange,
  onTargetFilterChange,
  onActionFilterChange,
  onResetLog,
  visibleEvents,
}: EventLogProps) {
  const EVENT_FILTER_ALL = "All"

  return (
    <Card>
      <CardContent className="space-y-0 p-5">
        <div className="space-y-4 border-b border-border/70 pb-4">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Event Log</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Command history and system events
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={onResetLog}
              disabled={events.length === 0}
            >
              Reset Event Log
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <label htmlFor="event-source-filter" className="space-y-1 text-xs font-medium text-muted-foreground">
              Source
              <select
                id="event-source-filter"
                value={sourceFilter}
                onChange={(e) => onSourceFilterChange(e.target.value)}
                aria-label="Filter event log by source (UI, CH, or PD)"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              >
                {sourceOptions.map((option) => (
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
                value={targetFilter}
                onChange={(e) => onTargetFilterChange(e.target.value)}
                aria-label="Filter event log by target device"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              >
                {targetOptions.map((option) => (
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
                value={actionFilter}
                onChange={(e) => onActionFilterChange(e.target.value)}
                aria-label="Filter event log by action"
                className="h-8 w-full rounded-md border bg-background px-2 text-sm text-foreground"
              >
                {actionOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="max-h-64 min-h-32 overflow-y-auto">
          <table className="w-full text-sm">
            <tbody>
              {visibleEvents.length > 0 ? (
                visibleEvents.map((entry) => {
                  const status = getEventStatus(entry.result, entry.action)
                  return (
                    <tr key={entry.id} className="border-t border-border/30 hover:bg-muted/30">
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {entry.time}
                      </td>
                      <td className="px-4 py-2 text-xs font-medium">{entry.source}</td>
                      <td className="px-4 py-2 text-xs">{entry.target}</td>
                      <td className="px-4 py-2 text-xs">{entry.action}</td>
                      <td className="px-4 py-2">
                        <Badge className={getEventStatusBadgeClass(status)}>
                          {entry.result}
                        </Badge>
                      </td>
                      {entry.notes && (
                        <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate" title={entry.notes}>
                          {entry.notes}
                        </td>
                      )}
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    No events match the current filters
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
