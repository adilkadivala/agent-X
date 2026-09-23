"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSession } from "@/lib/use-session"
import { startXConnect } from "@/lib/connect-x"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarRail,
  SidebarSeparator,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  LayoutDashboardIcon,
  ScanSearchIcon,
  UsersIcon,
  ClockIcon,
  SparklesIcon,
  ShieldCheckIcon,
  PenLineIcon,
  SettingsIcon,
  TrendingUpIcon,
  ChevronRightIcon,
} from "lucide-react"
import { XIcon } from "@/components/x-icon"

const navigationItems = [
  {
    title: "Workspace",
    items: [
      { title: "Overview", url: "/overview", icon: LayoutDashboardIcon },
      { title: "Analyze", url: "/analyze", icon: ScanSearchIcon },
      { title: "Audience", url: "/analyze/audience", icon: UsersIcon },
      { title: "Active Times", url: "/analyze/active-times", icon: ClockIcon },
      { title: "Engage", url: "/engage", icon: SparklesIcon },
      { title: "Compliance", url: "/compliance", icon: ShieldCheckIcon },
      { title: "Compose", url: "/compose", icon: PenLineIcon },
    ],
  },
  {
    title: "Account",
    items: [
      { title: "Settings & Billing", url: "/settings", icon: SettingsIcon },
    ],
  },
]

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname()
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

  const activeHandle = session.username || session.connectedAccounts?.[0]?.handle
  const userInitial = (session.name || session.username || "U").slice(0, 1).toUpperCase()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="border-b p-3">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-none bg-primary text-primary-foreground font-bold">
              <TrendingUpIcon className="size-4" />
            </div>
            <div className="flex flex-col group-data-[collapsible=icon]:hidden">
              <span className="text-sm font-semibold tracking-tight">SuperGrow</span>
              <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-mono">
                Signal Intel
              </span>
            </div>
          </Link>
          <Badge
            variant="secondary"
            className="text-[10px] font-mono group-data-[collapsible=icon]:hidden"
          >
            v1.0
          </Badge>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navigationItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    item.url === "/overview"
                      ? pathname === "/overview" || pathname === "/"
                      : pathname?.startsWith(item.url)
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        render={<Link href={item.url} />}
                        isActive={isActive}
                        tooltip={item.title}
                      >
                        <item.icon />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="border-t p-3">
        {loading ? (
          <div className="h-10 w-full animate-pulse rounded bg-muted" />
        ) : session.signedIn ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <Avatar className="size-8 shrink-0">
                {session.profileImageUrl && <AvatarImage src={session.profileImageUrl} />}
                <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                <span className="truncate text-xs font-medium">
                  {session.name || "User"}
                </span>
                <span className="truncate font-mono text-[10px] text-muted-foreground">
                  {activeHandle ? `@${activeHandle}` : session.email || "No handle"}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between group-data-[collapsible=icon]:hidden pt-1">
              <Badge variant="outline" className="text-[10px] capitalize">
                {session.plan ? `${session.plan.toLowerCase()}` : "Free"}
              </Badge>
              <Link
                href="/settings"
                className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5"
              >
                Manage <ChevronRightIcon className="size-3" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 group-data-[collapsible=icon]:hidden">
            <p className="text-xs text-muted-foreground">Connect X to view live signal</p>
            <Button
              size="sm"
              variant="outline"
              onClick={handleConnect}
              disabled={connecting}
              className="w-full gap-1.5 text-xs"
            >
              <XIcon className="size-3" />
              {connecting ? "Connecting…" : "Connect X"}
            </Button>
          </div>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
