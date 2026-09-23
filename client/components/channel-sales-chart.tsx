"use client"

import * as React from "react"
import { useId } from "react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import { formatDate } from "@/lib/formater"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Delta, DeltaIcon, DeltaValue } from "@/components/delta"
import { DashboardCard } from "@/components/dashboard-card"
import { useSession } from "@/lib/use-session"
import { postsApi } from "@/lib/api"
import type { Post } from "@/lib/api"

type SignalScoreRow = {
  date: string
  hook: number
  shareability: number
}

const DEFAULT_ROWS: SignalScoreRow[] = [
  { date: "2026-03-24", hook: 75, shareability: 68 },
  { date: "2026-03-25", hook: 82, shareability: 74 },
  { date: "2026-03-26", hook: 78, shareability: 70 },
  { date: "2026-03-27", hook: 88, shareability: 82 },
  { date: "2026-03-28", hook: 85, shareability: 80 },
  { date: "2026-03-29", hook: 91, shareability: 86 },
  { date: "2026-03-30", hook: 94, shareability: 89 },
]

const chartConfig = {
  hook: {
    label: "Hook Strength",
    color: "var(--chart-2)",
  },
  shareability: {
    label: "Shareability",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ChannelSalesChart() {
  const chartUid = useId().replace(/:/g, "")
  const idLineGlow = `channel-sales-line-glow-${chartUid}`
  const { session } = useSession()
  const [chartRows, setChartRows] = React.useState<SignalScoreRow[]>(DEFAULT_ROWS)
  const [postCount, setPostCount] = React.useState(0)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true

    async function loadScores() {
      if (!activeAccountId) return

      try {
        const res = await postsApi.history(activeAccountId)
        if (!isMounted) return

        const posts: Post[] = res.posts
        setPostCount(posts.length)

        if (posts.length > 0) {
          const rows: SignalScoreRow[] = posts
            .slice(0, 10)
            .reverse()
            .map((p) => ({
              date: p.publishedAt ? p.publishedAt.slice(0, 10) : new Date().toISOString().slice(0, 10),
              hook: p.score?.hookScore ?? 75,
              shareability: p.score?.shareabilityScore ?? 70,
            }))

          if (rows.length >= 2) {
            setChartRows(rows)
          }
        }
      } catch (err) {
        console.error("Failed to load channel scores", err)
      }
    }

    loadScores()

    return () => {
      isMounted = false
    }
  }, [activeAccountId])

  const first = chartRows[0]
  const last = chartRows.at(-1)
  const growth =
    first && last && first.hook > 0
      ? Number((((last.hook - first.hook) / first.hook) * 100).toFixed(1))
      : 8.5

  return (
    <DashboardCard className="gap-0 md:col-span-2">
      <CardHeader>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Signal Quality Trends</CardTitle>
            <Delta value={growth} variant="badge">
              <DeltaIcon variant="trend" />
              <DeltaValue />
            </Delta>
          </div>
          <CardDescription>
            {postCount > 0
              ? `Hook strength vs shareability across ${postCount} analyzed posts.`
              : "Hook strength vs shareability score trends."}
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="aspect-auto h-60 w-full p-0 md:h-80"
          config={chartConfig}
        >
          <LineChart
            accessibilityLayer
            data={chartRows}
            margin={{
              left: 12,
              right: 12,
              top: 8,
            }}
          >
            <CartesianGrid className="stroke-border" vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="date"
              interval={0}
              tickFormatter={(value) => formatDate(String(value), "day-month")}
              tickLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              content={<ChartTooltipContent hideLabel />}
              cursor={false}
            />
            <defs>
              <filter
                height="140%"
                id={idLineGlow}
                width="140%"
                x="-20%"
                y="-20%"
              >
                <feGaussianBlur result="blur" stdDeviation="10" />
                <feComposite in="SourceGraphic" in2="blur" operator="over" />
              </filter>
            </defs>
            <Line
              dataKey="shareability"
              dot={false}
              filter={`url(#${idLineGlow})`}
              stroke="var(--color-shareability)"
              strokeWidth={2}
              type="step"
            />
            <Line
              dataKey="hook"
              dot={false}
              filter={`url(#${idLineGlow})`}
              stroke="var(--color-hook)"
              strokeWidth={2}
              type="step"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </DashboardCard>
  )
}
