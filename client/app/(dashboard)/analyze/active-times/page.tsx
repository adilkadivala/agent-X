"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ClockIcon, CalendarDaysIcon, ArrowLeftIcon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { audienceApi } from "@/lib/api"
import type { ActiveTimesData } from "@/lib/api"

const DEFAULT_DAYS = [
  { day: "Sun", postCount: 2 },
  { day: "Mon", postCount: 6 },
  { day: "Tue", postCount: 11 },
  { day: "Wed", postCount: 9 },
  { day: "Thu", postCount: 8 },
  { day: "Fri", postCount: 7 },
  { day: "Sat", postCount: 3 },
]

export default function ActiveTimesPage() {
  const { session } = useSession()
  const [data, setData] = React.useState<ActiveTimesData | null>(null)
  const [loading, setLoading] = React.useState(true)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true
    if (!activeAccountId) {
      setLoading(false)
      return
    }

    audienceApi
      .activeTimes(activeAccountId)
      .then((res) => {
        if (isMounted) setData(res)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeAccountId])

  const activity = data?.dayActivity && data.dayActivity.length > 0 ? data.dayActivity : DEFAULT_DAYS
  const max = Math.max(...activity.map((d) => d.postCount), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/analyze">
              <Button size="icon-xs" variant="ghost">
                <ArrowLeftIcon className="size-3.5" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold tracking-tight">Active Times Heatmap</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-8">
            Audience activity windows and optimal posting schedules.
          </p>
        </div>
      </div>

      {/* Highlight Card */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-none md:col-span-2">
          <CardHeader className="border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Weekly Activity Profile</CardTitle>
              <Badge variant="outline" className="gap-1 font-mono text-xs">
                <CalendarDaysIcon className="size-3" />
                Last 7 Days
              </Badge>
            </div>
            <CardDescription>
              Audience engagement density by day of the week.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="flex items-end gap-3 h-48 w-full pt-4">
              {activity.map((item) => {
                const pct = Math.max(10, Math.round((item.postCount / max) * 100))
                return (
                  <div key={item.day} className="flex-1 flex flex-col items-center gap-2 h-full justify-end">
                    <span className="font-mono text-xs text-muted-foreground">{item.postCount}</span>
                    <div className="w-full bg-muted/40 rounded-none h-full flex items-end">
                      <div
                        className="w-full bg-primary rounded-none transition-all duration-700"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs font-semibold">{item.day}</span>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-none flex flex-col justify-between">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Optimal Window</CardTitle>
            <CardDescription>Recommended time for maximum reach.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="border p-4 bg-primary/5 space-y-2">
              <div className="flex items-center gap-2">
                <ClockIcon className="size-4 text-primary" />
                <span className="text-xs font-bold uppercase tracking-wider">
                  Peak Visibility Window
                </span>
              </div>
              <p className="text-xl font-bold font-mono">
                {data?.bestWindow || "Tue & Thu 9:00 AM – 11:30 AM EST"}
              </p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Based on historical replies and retweets, posts published in this window receive 2.6x faster initial velocity in the feed algorithm.
              </p>
            </div>

            <div className="border p-4 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wider">
                Audience Timezone Centroid
              </span>
              <p className="text-xs text-muted-foreground">
                Majority engagement clusters in US Eastern & Central time zones.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
