"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface ConnectionPanelProps {
  ip: string
  onIpChange: (ip: string) => void
  onConnect: () => void
  onDisconnect: () => void
  onRefresh: () => void
  connectedIp: string
}

export function ConnectionPanel({
  ip,
  onIpChange,
  onConnect,
  onDisconnect,
  onRefresh,
  connectedIp,
}: ConnectionPanelProps) {
  return (
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
                value={ip}
                onChange={(e) => onIpChange(e.target.value)}
                placeholder="e.g. 192.168.0.204"
                aria-label="Communication Hub IP address or hostname"
                aria-describedby="ch-endpoint-help"
              />
              <p id="ch-endpoint-help" className="text-xs text-muted-foreground mt-1">
                Enter IPv4 address (e.g., 192.168.1.100) or hostname
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button onClick={onConnect}>Connect</Button>
              <Button variant="destructive" onClick={onDisconnect}>
                Disconnect
              </Button>
              <Button variant="outline" onClick={onRefresh}>
                Refresh
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            <span className="text-muted-foreground">Connected CH:</span>{" "}
            <span className="font-medium text-foreground">
              {connectedIp || "None"}
            </span>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
