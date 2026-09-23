"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { DashboardCard } from "@/components/dashboard-card"
import { ArrowRightIcon, ScanSearchIcon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { postsApi } from "@/lib/api"
import type { Post } from "@/lib/api"

export function DashboardInvoices() {
  const { session } = useSession()
  const [posts, setPosts] = React.useState<Post[]>([])
  const [loading, setLoading] = React.useState(true)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true

    async function loadPosts() {
      if (!activeAccountId) {
        setLoading(false)
        return
      }

      try {
        const res = await postsApi.history(activeAccountId)
        if (isMounted) {
          setPosts(res.posts || [])
        }
      } catch (err) {
        console.error("Failed to load post history for invoices table", err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadPosts()

    return () => {
      isMounted = false
    }
  }, [activeAccountId])

  const displayItems =
    posts.length > 0
      ? posts.slice(0, 5).map((p) => {
          const score = p.score?.overallScore ?? 80
          const status = score >= 80 ? "Good" : score >= 60 ? "Needs work" : "Flagged"
          return {
            id: p.platformPostId.slice(-6),
            content: p.text ? p.text.slice(0, 48) + "…" : `Post #${p.platformPostId.slice(0, 10)}`,
            score: `${score} score`,
            type: p.type || "TEXT",
            status,
            date: new Date(p.publishedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
            }),
          }
        })
      : [
          {
            id: "1045",
            content: "Why building in public changes your founder reach…",
            score: "94 score",
            type: "THREAD",
            status: "Good",
            date: "Mar 22",
          },
          {
            id: "1044",
            content: "Signal intelligence vs generic AI slop in feed…",
            score: "87 score",
            type: "TEXT",
            status: "Good",
            date: "Mar 21",
          },
          {
            id: "1043",
            content: "Weekly retention metrics and developer growth…",
            score: "68 score",
            type: "REPLY",
            status: "Needs work",
            date: "Mar 20",
          },
          {
            id: "1042",
            content: "Launch day announcement: SuperGrow live on X…",
            score: "92 score",
            type: "QUOTE",
            status: "Good",
            date: "Mar 19",
          },
        ]

  return (
    <DashboardCard className="relative gap-0 md:col-span-2">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Recent Post Analyses</CardTitle>
            <CardDescription>
              {posts.length > 0
                ? `${posts.length} posts scored with hook and structure signals.`
                : "Live scored posts and compliance evaluations."}
            </CardDescription>
          </div>
          <Link href="/analyze">
            <Button size="xs" variant="outline" className="gap-1 text-xs">
              <ScanSearchIcon className="size-3" />
              Analyze
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent className="mask-b-from-50% mask-b-to-100% px-0">
        <Table>
          <TableCaption className="sr-only">
            Recent post analyses with content snippet, type, and score.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="ps-6">Post Snippet</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="pe-6 text-right tabular-nums">Score</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {displayItems.map((item) => (
              <TableRow className="h-12" key={item.id}>
                <TableCell className="max-w-48 truncate ps-6 font-medium">
                  {item.content}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs uppercase font-mono">
                  {item.type}
                </TableCell>
                <TableCell className="pe-6 text-right tabular-nums">
                  <Badge
                    variant="outline"
                    className={
                      item.status === "Good"
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                        : item.status === "Needs work"
                        ? "bg-amber-500/10 text-amber-600 border-amber-500/20"
                        : "bg-red-500/10 text-red-600 border-red-500/20"
                    }
                  >
                    {item.score}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="absolute inset-x-0 bottom-0 flex h-1/5 items-center justify-center bg-background mask-t-from-30%">
        <Link
          href="/analyze"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          View All Analyses
          <ArrowRightIcon className="size-3" aria-hidden="true" />
        </Link>
      </div>
    </DashboardCard>
  )
}
