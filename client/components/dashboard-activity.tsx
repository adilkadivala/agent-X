"use client"

import * as React from "react"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { DashboardCard } from "@/components/dashboard-card"
import {
  ZapIcon,
  ShieldCheckIcon,
  SparklesIcon,
  PenLineIcon,
} from "lucide-react"
import { XIcon } from "@/components/x-icon"
import { useSession } from "@/lib/use-session"
import { complianceApi, suggestionsApi, draftsApi, postsApi } from "@/lib/api"

type ActivityItem = {
  title: string
  time: string
  icon: React.ReactNode
}

export function DashboardActivity() {
  const { session } = useSession()
  const [items, setItems] = React.useState<ActivityItem[]>([])

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true

    async function loadActivity() {
      if (!activeAccountId) {
        setItems([
          {
            title: "SuperGrow workspace ready",
            time: "Just now",
            icon: <XIcon className="text-primary size-4" />,
          },
          {
            title: "Post scoring model v1 loaded",
            time: "1 hour ago",
            icon: <ZapIcon className="text-blue-500" />,
          },
          {
            title: "X policy ruleset v1 synchronized",
            time: "Today",
            icon: <ShieldCheckIcon className="text-emerald-500" />,
          },
          {
            title: "Approval-gated publishing active",
            time: "Ready",
            icon: <PenLineIcon className="text-amber-500" />,
          },
        ])
        return
      }

      try {
        const [compRes, sugRes, draftsRes, postsRes] = await Promise.allSettled([
          complianceApi.data(activeAccountId),
          suggestionsApi.list(activeAccountId),
          draftsApi.queue(activeAccountId),
          postsApi.history(activeAccountId),
        ])

        if (!isMounted) return

        const loaded: ActivityItem[] = []

        if (postsRes.status === "fulfilled" && postsRes.value.posts.length > 0) {
          const latest = postsRes.value.posts[0]
          loaded.push({
            title: `Analyzed post: ${latest.text ? latest.text.slice(0, 32) + "…" : latest.platformPostId}`,
            time: new Date(latest.publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            icon: <ZapIcon className="text-blue-500" />,
          })
        }

        if (compRes.status === "fulfilled" && compRes.value.flags.length > 0) {
          const f = compRes.value.flags[0]
          loaded.push({
            title: `Compliance rule flagged: ${f.rule?.category || "Policy"}`,
            time: new Date(f.flaggedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            icon: <ShieldCheckIcon className="text-amber-500" />,
          })
        }

        if (sugRes.status === "fulfilled" && sugRes.value.suggestions.length > 0) {
          const s = sugRes.value.suggestions[0]
          loaded.push({
            title: `Recommendation: ${s.title}`,
            time: new Date(s.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            icon: <SparklesIcon className="text-violet-500" />,
          })
        }

        if (draftsRes.status === "fulfilled" && draftsRes.value.drafts.length > 0) {
          const d = draftsRes.value.drafts[0]
          loaded.push({
            title: `Draft created: ${d.body.slice(0, 30)}…`,
            time: new Date(d.createdAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
            icon: <PenLineIcon className="text-emerald-500" />,
          })
        }

        if (session.username) {
          loaded.push({
            title: `@${session.username} connected to workspace`,
            time: "Active session",
            icon: <XIcon className="text-primary size-4" />,
          })
        }

        if (loaded.length > 0) {
          setItems(loaded.slice(0, 4))
        }
      } catch (err) {
        console.error("Failed to load activity stream", err)
      }
    }

    loadActivity()

    return () => {
      isMounted = false
    }
  }, [activeAccountId, session.username])

  return (
    <DashboardCard className="gap-0">
      <CardHeader className="border-b">
        <CardTitle>Activity Feed</CardTitle>
        <CardDescription>Live updates from your signal stream.</CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="flex flex-col divide-y divide-border">
          {items.map((item, idx) => (
            <li className="flex h-16 items-center gap-3 px-6" key={`${item.title}-${idx}`}>
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center [&_svg]:size-4"
              >
                {item.icon}
              </span>
              <div className="min-w-0 flex-1 space-y-1">
                <p className="line-clamp-1 text-pretty text-foreground text-sm leading-snug">
                  {item.title}
                </p>
                <p className="text-muted-foreground text-xs">{item.time}</p>
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </DashboardCard>
  )
}
