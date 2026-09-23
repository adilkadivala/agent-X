"use client"

import * as React from "react"
import {
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta"
import { DashboardCard } from "@/components/dashboard-card"
import { useSession } from "@/lib/use-session"
import { billingApi, complianceApi, postsApi } from "@/lib/api"
import type { BillingData } from "@/lib/api"

type Stat = {
  label: string
  value: string
  sub?: string
  delta: number
  deltaLabel?: string
}

export function DashboardStats() {
  const { session } = useSession()
  const [billing, setBilling] = React.useState<BillingData | null>(null)
  const [complianceScore, setComplianceScore] = React.useState<number>(100)
  const [totalPosts, setTotalPosts] = React.useState<number>(0)
  const [loading, setLoading] = React.useState(true)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true

    async function loadStats() {
      try {
        const [billingRes, compRes, postsRes] = await Promise.allSettled([
          session.signedIn ? billingApi.plan() : Promise.resolve(null),
          activeAccountId ? complianceApi.data(activeAccountId) : Promise.resolve(null),
          activeAccountId ? postsApi.history(activeAccountId) : Promise.resolve(null),
        ])

        if (!isMounted) return

        if (billingRes.status === "fulfilled" && billingRes.value) {
          setBilling(billingRes.value)
        }
        if (compRes.status === "fulfilled" && compRes.value) {
          setComplianceScore(compRes.value.score)
        }
        if (postsRes.status === "fulfilled" && postsRes.value) {
          setTotalPosts(postsRes.value.posts.length)
        }
      } catch (err) {
        console.error("Failed to load dashboard stats", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadStats()

    return () => {
      isMounted = false
    }
  }, [session.signedIn, activeAccountId])

  const plan = billing?.plan
  const usage = billing?.usage
  const used = usage?.analysesUsed ?? 0
  const limit = plan?.analysisLimitPerMonth
  const limitDisplay = limit === null || limit === undefined ? "Unlimited" : String(limit)
  const quotaPct = limit ? Math.min(100, Math.round((used / limit) * 100)) : 100

  const stats: Stat[] = [
    {
      label: "Analyses Quota",
      value: loading ? "—" : `${used} / ${limitDisplay}`,
      delta: quotaPct > 80 ? -quotaPct : quotaPct,
      deltaLabel: limit ? `${quotaPct}% of cap` : "Unlimited quota",
    },
    {
      label: "Compliance Score",
      value: loading ? "—" : `${complianceScore}`,
      delta: complianceScore >= 90 ? 4.5 : complianceScore >= 70 ? 0 : -8.2,
      deltaLabel: complianceScore >= 90 ? "Optimal guardrails" : "Review flags",
    },
    {
      label: "Posts Analyzed",
      value: loading ? "—" : `${totalPosts}`,
      delta: totalPosts > 0 ? 12.4 : 0,
      deltaLabel: "Analyzed in workspace",
    },
    {
      label: "Active Plan",
      value: session.signedIn ? (plan?.name ?? "Free") : "Disconnected",
      delta: session.signedIn ? 100 : 0,
      deltaLabel: session.username ? `@${session.username}` : "Connect X to begin",
    },
  ]

  return (
    <>
      {stats.map((s) => (
        <DashboardCard className="" key={s.label}>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-xs font-normal tracking-wide">
              {s.label}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-row items-center gap-2">
            <p className="text-2xl font-semibold tabular-nums">{s.value}</p>
          </CardContent>
          <CardFooter className="gap-1 rounded-none bg-background text-xs">
            <Delta value={s.delta}>
              <DeltaIcon />
              <DeltaValue />
            </Delta>
            <span className="text-muted-foreground truncate">{s.deltaLabel}</span>
          </CardFooter>
        </DashboardCard>
      ))}
    </>
  )
}
