"use client"

import * as React from "react"
import Link from "next/link"
import { useSession } from "@/lib/use-session"
import { startXConnect } from "@/lib/connect-x"
import { authApi } from "@/lib/api"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { LogOutIcon, SettingsIcon, ZapIcon, SparklesIcon } from "lucide-react"
import { XIcon } from "@/components/x-icon"

export function AppHeader() {
  const { session, loading } = useSession()
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

  const handleLogout = async () => {
    try {
      await authApi.logout()
      window.location.href = "/"
    } catch (e) {
      console.error(e)
    }
  }

  const userInitial = (session.name || session.username || "U").slice(0, 1).toUpperCase()
  const activeHandle = session.username || session.connectedAccounts?.[0]?.handle

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b bg-background px-4 md:px-6">
      <div className="flex items-center gap-2">
        <SidebarTrigger />
        <Separator orientation="vertical" className="mr-2 h-4" />
        <div className="flex items-center gap-2 text-sm font-medium">
          <Link href="/overview" className="hover:text-foreground/80">
            Overview
          </Link>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground text-xs">Signal Intelligence</span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {loading ? (
          <div className="h-8 w-24 animate-pulse rounded bg-muted" />
        ) : session.signedIn && activeHandle ? (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1.5 font-mono text-xs">
              <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse inline-block" />
              @{activeHandle}
            </Badge>
            <Badge variant="secondary" className="text-xs capitalize">
              {session.plan ? `${session.plan.toLowerCase()} plan` : "Free"}
            </Badge>
          </div>
        ) : (
          <Button
            size="sm"
            onClick={handleConnect}
            disabled={connecting}
            className="gap-1.5 text-xs"
          >
            <XIcon className="size-3" />
            {connecting ? "Connecting…" : "Connect X"}
          </Button>
        )}

        {session.signedIn && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" className="rounded-full" />}>
              <Avatar className="size-7">
                {session.profileImageUrl && <AvatarImage src={session.profileImageUrl} />}
                <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium leading-none">{session.name || "User"}</p>
                  <p className="text-xs leading-none text-muted-foreground">
                    {session.email || (activeHandle ? `@${activeHandle}` : "No email")}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/settings" className="flex items-center gap-2 w-full" />}>
                <SettingsIcon className="size-4" /> Settings & Billing
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/analyze" className="flex items-center gap-2 w-full" />}>
                <ZapIcon className="size-4" /> Post Analyzer
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/compose" className="flex items-center gap-2 w-full" />}>
                <SparklesIcon className="size-4" /> Compose Draft
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                <LogOutIcon className="size-4 mr-2" /> Sign Out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </header>
  )
}
