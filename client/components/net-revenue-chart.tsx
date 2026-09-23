"use client"

import * as React from "react"
import { Bar, BarChart, XAxis } from "recharts"
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
import { audienceApi, postsApi } from "@/lib/api"

type DayData = {
  day: string
  signals: number
}

const DEFAULT_DAYS: DayData[] = [
  { day: "Mon", signals: 0 },
  { day: "Tue", signals: 0 },
  { day: "Wed", signals: 0 },
  { day: "Thu", signals: 0 },
  { day: "Fri", signals: 0 },
  { day: "Sat", signals: 0 },
  { day: "Sun", signals: 0 },
]

const chartConfig = {
  signals: {
    label: "Analyzed Posts",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

function CustomGradientBar(
  props: React.SVGProps<SVGRectElement> & {
    index?: number
    dataKey?: string | number
  }
) {
  const {
    fill,
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    dataKey = "signals",
    index = 0,
  } = props
  const gid = `gradient-bar-${String(dataKey)}-${index}`

  return (
    <>
      <rect
        fill={`url(#${gid})`}
        height={height}
        stroke="none"
        width={width}
        x={x}
        y={y}
      />
      <rect fill={fill} height={2} stroke="none" width={width} x={x} y={y} />
      <defs>
        <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={fill} stopOpacity={0.5} />
          <stop offset="100%" stopColor={fill} stopOpacity={0} />
        </linearGradient>
      </defs>
    </>
  )
}

export function NetRevenueChart() {
  const { session } = useSession()
  const [chartData, setChartData] = React.useState<DayData[]>(DEFAULT_DAYS)
  const [totalAnalyzed, setTotalAnalyzed] = React.useState(0)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true

    async function loadData() {
      if (!activeAccountId) return

      try {
        const [activeTimesRes, historyRes] = await Promise.allSettled([
          audienceApi.activeTimes(activeAccountId),
          postsApi.history(activeAccountId),
        ])

        if (!isMounted) return

        if (activeTimesRes.status === "fulfilled" && activeTimesRes.value) {
          const act = activeTimesRes.value
          setTotalAnalyzed(act.totalPostsAnalyzed || 0)
          if (act.dayActivity && act.dayActivity.length > 0) {
            const mapped = act.dayActivity.map((d) => ({
              day: d.day,
              signals: d.postCount,
            }))
            setChartData(mapped)
            return
          }
        }

        if (historyRes.status === "fulfilled" && historyRes.value) {
          const posts = historyRes.value.posts
          setTotalAnalyzed(posts.length)
          const daysMap: Record<string, number> = {
            Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0,
          }
          posts.forEach((p) => {
            const d = new Date(p.publishedAt)
            const dayName = d.toLocaleDateString("en-US", { weekday: "short" })
            if (daysMap[dayName] !== undefined) {
              daysMap[dayName]++
            }
          })
          const mapped = Object.entries(daysMap).map(([day, count]) => ({
            day,
            signals: count,
          }))
          setChartData(mapped)
        }
      } catch (err) {
        console.error("Failed to load active times chart data", err)
      }
    }

    loadData()

    return () => {
      isMounted = false
    }
  }, [activeAccountId])

  const firstDay = chartData[0]?.signals || 1
  const lastDay = chartData.at(-1)?.signals ?? firstDay
  const growthPct = Number(
    firstDay > 0
      ? (((lastDay - firstDay) / firstDay) * 100).toFixed(1)
      : (lastDay * 10).toFixed(1)
  )

  return (
    <DashboardCard className="gap-0 md:col-span-2">
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Post Volume & Active Times</CardTitle>
          <Delta value={growthPct} variant="badge">
            <DeltaIcon variant="trend" />
            <DeltaValue />
          </Delta>
        </div>
        <CardDescription>
          {totalAnalyzed > 0
            ? `${totalAnalyzed} posts analyzed across active days of the week.`
            : "Daily post distribution across 7 days."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer
          className="aspect-auto h-60 w-full md:h-80"
          config={chartConfig}
        >
          <BarChart accessibilityLayer data={chartData}>
            <XAxis
              axisLine={false}
              dataKey="day"
              interval={0}
              tickFormatter={(value) => String(value)}
              tickLine={false}
              tickMargin={10}
            />
            <ChartTooltip
              content={<ChartTooltipContent hideLabel />}
              cursor={false}
            />
            <Bar
              dataKey="signals"
              fill="var(--color-signals)"
              shape={<CustomGradientBar />}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </DashboardCard>
  )
}
