"use client"

import * as React from "react"
import Link from "next/link"
import { Dashboard } from "@/components/dashboard"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSession } from "@/lib/use-session"
import { startXConnect } from "@/lib/connect-x"
import {
  ScanSearchIcon,
  PenLineIcon,
  SparklesIcon,
  ArrowUpRightIcon,
  RefreshCwIcon,
} from "lucide-react"
import { XIcon } from "@/components/x-icon"

export default function OverviewPage() {
  const { session } = useSession()
  const [connecting, setConnecting] = React.useState(false)

  const handleConnect = async () => {
    setConnecting(true)
    try {
      await startXConnect()
    } catch (e) {
      console.error(e)
    } finally {
      setConnecting(false)
    }
  }

  const getTimeGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good morning"
    if (hour < 18) return "Good afternoon"
    return "Good evening"
  }

  const name = session.name || session.username || "Creator"
  const activeHandle = session.username || session.connectedAccounts?.[0]?.handle

  return (
    <div className="space-y-6">
      {/* Greeting Header & Quick Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">
              {getTimeGreeting()}, {name}
            </h1>
            {activeHandle ? (
              <Badge variant="outline" className="gap-1 font-mono text-xs">
                <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                @{activeHandle}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-xs">
                Free Mode
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Real-time feed telemetry, algorithmic post scoring, and compliance monitoring.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {session.signedIn ? (
            <>
              <Link href="/analyze">
                <Button size="sm" variant="outline" className="gap-1.5 text-xs rounded-none">
                  <ScanSearchIcon className="size-3.5" />
                  Analyze Post
                </Button>
              </Link>
              <Link href="/compose">
                <Button size="sm" className="gap-1.5 text-xs rounded-none">
                  <PenLineIcon className="size-3.5" />
                  New Draft
                </Button>
              </Link>
            </>
          ) : (
            <Button
              size="sm"
              onClick={handleConnect}
              disabled={connecting}
              className="gap-1.5 text-xs rounded-none"
            >
              <XIcon className="size-3" />
              {connecting ? "Connecting…" : "Connect X Account"}
            </Button>
          )}
        </div>
      </div>

      {/* Main Dashboard Grid */}
      <Dashboard />
    </div>
  )
}
