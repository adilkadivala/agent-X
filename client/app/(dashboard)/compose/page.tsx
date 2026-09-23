"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { PenLineIcon, SparklesIcon, SendIcon, CheckCircle2Icon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { draftsApi } from "@/lib/api"
import type { Draft } from "@/lib/api"

export default function ComposePage() {
  const { session } = useSession()
  const [drafts, setDrafts] = React.useState<Draft[]>([])
  const [body, setBody] = React.useState("")
  const [kind, setKind] = React.useState<"ORIGINAL" | "REPLY" | "QUOTE">("ORIGINAL")
  const [creating, setCreating] = React.useState(false)
  const [acting, setActing] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  const loadQueue = React.useCallback(async () => {
    if (!activeAccountId) {
      setLoading(false)
      return
    }
    try {
      const res = await draftsApi.queue(activeAccountId)
      setDrafts(res.drafts || [])
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [activeAccountId])

  React.useEffect(() => {
    loadQueue()
  }, [loadQueue])

  const handleCreate = async () => {
    if (!body.trim() || !activeAccountId) return
    setCreating(true)
    try {
      await draftsApi.create(activeAccountId, body.trim(), kind)
      setBody("")
      await loadQueue()
    } catch (e) {
      console.error(e)
    } finally {
      setCreating(false)
    }
  }

  const handleApprove = async (id: string) => {
    setActing(id)
    try {
      await draftsApi.approve(id)
      setDrafts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "SCHEDULED" as const } : d))
      )
    } catch (e) {
      console.error(e)
    } finally {
      setActing(null)
    }
  }

  const handlePublish = async (id: string) => {
    setActing(id)
    try {
      await draftsApi.publish(id)
      setDrafts((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: "PUBLISHED" as const } : d))
      )
    } catch (e) {
      console.error(e)
    } finally {
      setActing(null)
    }
  }

  const charLimit = 280
  const charRemaining = charLimit - body.length

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Compose & Approval Queue</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Strict human-in-the-loop publisher. Nothing posts without your explicit approval.
        </p>
      </div>

      {/* Composer Card */}
      <Card className="rounded-none">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Draft Creator</CardTitle>
            <div className="flex items-center gap-1.5">
              {(["ORIGINAL", "REPLY", "QUOTE"] as const).map((k) => (
                <Button
                  key={k}
                  size="xs"
                  variant={kind === k ? "default" : "outline"}
                  onClick={() => setKind(k)}
                  className="font-mono text-[10px] rounded-none"
                >
                  {k}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <textarea
            rows={4}
            placeholder="Draft your post or hook here… Guardrails will automatically analyze prior to queueing."
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full border bg-transparent p-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary rounded-none font-mono"
          />
          <div className="flex items-center justify-between">
            <span
              className={`text-xs font-mono ${
                charRemaining < 20 ? "text-destructive font-semibold" : "text-muted-foreground"
              }`}
            >
              {charRemaining} characters remaining
            </span>
            <Button
              onClick={handleCreate}
              disabled={creating || !body.trim() || !activeAccountId}
              className="gap-2 rounded-none"
            >
              <PenLineIcon className="size-4" />
              {creating ? "Queueing…" : "Save to Queue"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue Table */}
      <Card className="rounded-none">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Approval Queue</CardTitle>
          <CardDescription>
            Review, approve, and execute scheduled posts.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">Loading queue…</div>
          ) : drafts.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground font-mono">
              Queue is empty. Create a draft above to stage your next post.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-6">Draft Content</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pe-6 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {drafts.map((d) => (
                  <TableRow key={d.id} className="h-14">
                    <TableCell className="max-w-md ps-6 font-mono text-xs">
                      {d.body}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-[10px]">
                        {d.kind}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={
                          d.status === "PUBLISHED"
                            ? "bg-emerald-500/10 text-emerald-500 font-mono text-xs"
                            : d.status === "SCHEDULED"
                            ? "bg-blue-500/10 text-blue-500 font-mono text-xs"
                            : "bg-muted text-muted-foreground font-mono text-xs"
                        }
                      >
                        {d.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="pe-6 text-right space-x-2">
                      {d.status === "DRAFT" && (
                        <Button
                          size="xs"
                          variant="outline"
                          disabled={acting === d.id}
                          onClick={() => handleApprove(d.id)}
                          className="gap-1 text-xs rounded-none font-mono"
                        >
                          <CheckCircle2Icon className="size-3" /> Approve
                        </Button>
                      )}
                      {d.status === "SCHEDULED" && (
                        <Button
                          size="xs"
                          disabled={acting === d.id}
                          onClick={() => handlePublish(d.id)}
                          className="gap-1 text-xs rounded-none font-mono"
                        >
                          <SendIcon className="size-3" /> Publish
                        </Button>
                      )}
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
