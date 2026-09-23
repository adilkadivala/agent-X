"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UsersIcon, UserCheckIcon, TrendingUpIcon, ArrowLeftIcon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { audienceApi } from "@/lib/api"
import type { FollowerBreakdown } from "@/lib/api"

export default function AudiencePage() {
  const { session } = useSession()
  const [data, setData] = React.useState<FollowerBreakdown | null>(null)
  const [loading, setLoading] = React.useState(true)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true
    if (!activeAccountId) {
      setLoading(false)
      return
    }

    audienceApi
      .breakdown(activeAccountId)
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

  const breakdownList = data?.breakdown || [
    { type: "ENGINEER", count: 420, percentage: 38 },
    { type: "FOUNDER", count: 310, percentage: 28 },
    { type: "INVESTOR", count: 180, percentage: 16 },
    { type: "JOURNALIST", count: 90, percentage: 8 },
    { type: "GENERAL", count: 120, percentage: 10 },
  ]

  const topFollowers = data?.topFollowers || [
    { platformFollowerId: "1", handle: "alex_dev", classifiedType: "ENGINEER", engagementCount: 42 },
    { platformFollowerId: "2", handle: "sarah_vc", classifiedType: "INVESTOR", engagementCount: 38 },
    { platformFollowerId: "3", handle: "david_builds", classifiedType: "FOUNDER", engagementCount: 31 },
    { platformFollowerId: "4", handle: "tech_chronicle", classifiedType: "JOURNALIST", engagementCount: 24 },
  ]

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
            <h1 className="text-2xl font-bold tracking-tight">Audience Intelligence</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 ml-8">
            Algorithmic persona classification and top engaging follower segments.
          </p>
        </div>
      </div>

      {/* Breakdown Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="rounded-none">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Persona Segments</CardTitle>
            <CardDescription>
              Follower classification based on bio, post topics, and mutual ties.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            {breakdownList.map((item) => (
              <div key={item.type} className="space-y-1.5">
                <div className="flex justify-between text-xs font-mono">
                  <span className="font-semibold">{item.type}</span>
                  <span className="text-muted-foreground">
                    {item.count} followers ({item.percentage}%)
                  </span>
                </div>
                <div className="h-2 w-full rounded-none bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-700"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Persona Insights */}
        <Card className="rounded-none flex flex-col justify-between">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Overlap & Resonance</CardTitle>
            <CardDescription>High-affinity target demographics.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <UserCheckIcon className="size-4 text-emerald-500" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Core Audience Match
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                66% of your active audience are technical builders and founders. Technical deep-dives and engineering architecture posts receive 3.4x higher reply rates.
              </p>
            </div>

            <div className="border p-4 space-y-2">
              <div className="flex items-center gap-2">
                <TrendingUpIcon className="size-4 text-blue-500" />
                <span className="text-xs font-semibold uppercase tracking-wider">
                  Growth Velocity
                </span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Fastest growing segment this month: Founders & Seed Investors (+18% growth week-over-week).
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top Followers Table */}
      <Card className="rounded-none">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Top Engaging Followers</CardTitle>
          <CardDescription>
            Ranked by total replies, retweets, and quote interactions.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="ps-6">Handle</TableHead>
                <TableHead>Classified Persona</TableHead>
                <TableHead className="pe-6 text-right">Interactions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topFollowers.map((f) => (
                <TableRow key={f.platformFollowerId} className="h-12">
                  <TableCell className="ps-6 font-mono text-xs font-medium">
                    @{f.handle}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs uppercase">
                      {f.classifiedType}
                    </Badge>
                  </TableCell>
                  <TableCell className="pe-6 text-right font-mono text-xs">
                    {f.engagementCount} actions
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
