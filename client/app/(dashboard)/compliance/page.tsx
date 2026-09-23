"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ShieldCheckIcon, AlertTriangleIcon, CheckCircle2Icon, XIcon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { complianceApi } from "@/lib/api"
import type { ComplianceFlag } from "@/lib/api"

export default function CompliancePage() {
  const { session } = useSession()
  const [score, setScore] = React.useState<number>(100)
  const [flags, setFlags] = React.useState<ComplianceFlag[]>([])
  const [totalChecked, setTotalChecked] = React.useState(0)
  const [loading, setLoading] = React.useState(true)
  const [dismissing, setDismissing] = React.useState<string | null>(null)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true
    if (!activeAccountId) {
      setLoading(false)
      return
    }

    complianceApi
      .data(activeAccountId)
      .then((res) => {
        if (!isMounted) return
        setScore(res.score ?? 100)
        setFlags(res.flags || [])
        setTotalChecked(res.totalPostsChecked || 0)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeAccountId])

  const handleDismiss = async (flagId: string) => {
    setDismissing(flagId)
    try {
      await complianceApi.dismissFlag(flagId)
      setFlags((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, status: "DISMISSED" as const } : f))
      )
    } catch {
      setFlags((prev) =>
        prev.map((f) => (f.id === flagId ? { ...f, status: "DISMISSED" as const } : f))
      )
    } finally {
      setDismissing(null)
    }
  }

  const openFlags = flags.filter((f) => f.status === "OPEN")

  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <h1 className="text-2xl font-bold tracking-tight">Guideline & Policy Compliance</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Continuous algorithmic verification against X developer policy and recommender guardrails.
        </p>
      </div>

      {/* Score and Overview */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-none">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Compliance Score</CardTitle>
            <CardDescription>Health index across checked posts.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 flex flex-col items-center justify-center space-y-2">
            <p className="text-5xl font-bold font-mono tracking-tight">{score}/100</p>
            <Badge
              variant="outline"
              className={
                score >= 90
                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30 font-mono text-xs"
                  : "bg-amber-500/10 text-amber-500 border-amber-500/30 font-mono text-xs"
              }
            >
              {score >= 90 ? "Policy Compliant" : "Review Recommended"}
            </Badge>
          </CardContent>
        </Card>

        <Card className="rounded-none md:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Inspection Summary</CardTitle>
            <CardDescription>Active guardrails and open flag counters.</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="border p-4 space-y-1">
                <span className="text-xs text-muted-foreground">Open Violations</span>
                <p className="text-2xl font-bold font-mono text-amber-500">{openFlags.length}</p>
              </div>
              <div className="border p-4 space-y-1">
                <span className="text-xs text-muted-foreground">Posts Checked</span>
                <p className="text-2xl font-bold font-mono">{totalChecked}</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              All checks are run prior to scheduling or publishing to prevent shadow-penalties and feed de-boosting.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Flags Table */}
      <Card className="rounded-none">
        <CardHeader className="border-b">
          <CardTitle className="text-base">Flagged Items & Violations</CardTitle>
          <CardDescription>
            Identified rule discrepancies with source citations.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {openFlags.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              <CheckCircle2Icon className="size-6 text-emerald-500 mx-auto mb-2" />
              No open compliance flags. All analyzed posts adhere to active recommender guidelines.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="ps-6">Rule & Category</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Explanation</TableHead>
                  <TableHead className="pe-6 text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openFlags.map((flag) => (
                  <TableRow key={flag.id} className="h-12">
                    <TableCell className="ps-6 font-medium text-xs">
                      <span className="font-semibold block font-mono">{flag.rule?.ruleId || "RULE-X1"}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {flag.rule?.category || "Policy"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          flag.severity === "HIGH"
                            ? "bg-red-500/10 text-red-500 border-red-500/30 font-mono text-xs"
                            : flag.severity === "MEDIUM"
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/30 font-mono text-xs"
                            : "bg-blue-500/10 text-blue-500 border-blue-500/30 font-mono text-xs"
                        }
                      >
                        {flag.severity}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md text-xs text-muted-foreground">
                      {flag.explanation || flag.rule?.description || "Policy notice"}
                    </TableCell>
                    <TableCell className="pe-6 text-right">
                      <Button
                        size="xs"
                        variant="outline"
                        disabled={dismissing === flag.id}
                        onClick={() => handleDismiss(flag.id)}
                        className="gap-1 text-xs rounded-none"
                      >
                        <XIcon className="size-3" /> Dismiss
                      </Button>
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
