"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  ScanSearchIcon,
  SparklesIcon,
  AlertTriangleIcon,
  TrendingUpIcon,
  UsersIcon,
  ClockIcon,
} from "lucide-react"
import { useSession } from "@/lib/use-session"
import { postsApi } from "@/lib/api"
import type { Post, PostScore } from "@/lib/api"

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}/100</span>
      </div>
      <div className="h-2 w-full rounded-none bg-muted overflow-hidden">
        <div
          className={`h-full transition-all duration-700 ${color}`}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  )
}

export default function AnalyzePage() {
  const { session } = useSession()
  const [url, setUrl] = React.useState("")
  const [analyzing, setAnalyzing] = React.useState(false)
  const [result, setResult] = React.useState<{
    postId: string
    url: string
    scores: PostScore | null
    message: string
  } | null>(null)
  const [error, setError] = React.useState("")
  const [history, setHistory] = React.useState<Post[]>([])
  const [loadingHistory, setLoadingHistory] = React.useState(true)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true
    if (!activeAccountId) {
      setLoadingHistory(false)
      return
    }

    postsApi
      .history(activeAccountId)
      .then((res) => {
        if (isMounted) setHistory(res.posts || [])
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (isMounted) setLoadingHistory(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeAccountId])

  const handleAnalyze = async () => {
    if (!url.trim()) return
    if (!activeAccountId) {
      setError("Please connect your X account first in Settings to score live posts.")
      return
    }

    setError("")
    setAnalyzing(true)
    setResult(null)

    try {
      const res = await postsApi.analyze(url.trim(), activeAccountId)
      setResult(res)
      // refresh history
      const h = await postsApi.history(activeAccountId)
      setHistory(h.posts || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed. Please check the post URL.")
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Post Analyzer</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Algorithmic scoring on hook strength, structure, sentiment, shareability, and AI slop risk.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/analyze/audience">
            <Button size="xs" variant="outline" className="gap-1.5 text-xs rounded-none font-mono">
              <UsersIcon className="size-3" />
              Audience Intel
            </Button>
          </Link>
          <Link href="/analyze/active-times">
            <Button size="xs" variant="outline" className="gap-1.5 text-xs rounded-none font-mono">
              <ClockIcon className="size-3" />
              Active Times
            </Button>
          </Link>
        </div>
      </div>

      {/* Input Card */}
      <Card className="rounded-none">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Evaluate Any Post</CardTitle>
          <CardDescription>
            Paste any post URL (e.g., https://x.com/username/status/123456789) to run heuristic breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="https://x.com/username/status/123456789"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAnalyze()
              }}
              className="font-mono text-xs rounded-none"
            />
            <Button
              onClick={handleAnalyze}
              disabled={analyzing || !url.trim()}
              className="gap-2 shrink-0 rounded-none"
            >
              <ScanSearchIcon className="size-4" />
              {analyzing ? "Scoring…" : "Analyze"}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive font-mono">{error}</p>}
        </CardContent>
      </Card>

      {/* Live Result */}
      {result?.scores && (
        <Card className="rounded-none border-primary/40 bg-card">
          <CardHeader className="border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Algorithmic Scorecard</CardTitle>
              <CardDescription className="font-mono text-xs">{result.url}</CardDescription>
            </div>
            <Badge
              variant="outline"
              className={
                result.scores.overallScore >= 80
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/30"
              }
            >
              Overall: {result.scores.overallScore}/100
            </Badge>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="space-y-4">
                <ScoreBar label="Hook Strength" value={result.scores.hookScore} color="bg-blue-500" />
                <ScoreBar label="Structure & Rhythm" value={result.scores.structureScore} color="bg-violet-500" />
                <ScoreBar label="Sentiment Resonance" value={result.scores.sentimentScore} color="bg-emerald-500" />
                <ScoreBar label="Shareability Multiplier" value={result.scores.shareabilityScore} color="bg-amber-500" />
              </div>
              <div className="flex flex-col justify-between rounded-none border p-4 bg-muted/20">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                      <AlertTriangleIcon className="size-3.5 text-orange-500" />
                      AI Slop Risk Index
                    </span>
                    <span className="font-mono text-xs font-bold">{result.scores.aiSlopScore}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {result.scores.aiSlopScore < 30
                      ? "Low synthetic signature detected. Authentic tone with high engagement conversion potential."
                      : "Moderate synthetic signals. We recommend removing generic buzzwords and corporate phrases."}
                  </p>
                </div>
                <div className="pt-4 flex items-center gap-2">
                  <SparklesIcon className="size-4 text-primary" />
                  <span className="text-xs font-medium">Ready for publisher queue</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* History Table */}
      <Card className="rounded-none">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Analysis History</CardTitle>
          <CardDescription>
            All scored posts associated with this workspace.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loadingHistory ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading history…</div>
          ) : history.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              No analyses recorded yet. Paste a post URL above to run your first evaluation.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-6">Post Snippet</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Hook</TableHead>
                  <TableHead>Share</TableHead>
                  <TableHead className="pe-6 text-right">Overall</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((post) => (
                  <TableRow key={post.id} className="h-12">
                    <TableCell className="max-w-xs truncate ps-6 font-medium text-xs">
                      {post.text || `Post #${post.platformPostId}`}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {post.type}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {post.score?.hookScore ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {post.score?.shareabilityScore ?? "—"}
                    </TableCell>
                    <TableCell className="pe-6 text-right">
                      <Badge variant="outline" className="font-mono text-xs">
                        {post.score?.overallScore ?? "—"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
