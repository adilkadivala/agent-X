"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { postsApi, reportsApi, billingApi } from "@/lib/api";
import type { BillingData, Report } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  TrendingUp, Zap, Shield, Sparkles, RefreshCw,
  ArrowUpRight, BarChart3, Users, Clock, CheckCircle2
} from "lucide-react";
import Link from "next/link";

function StatCard({
  label, value, sub, icon: Icon, trend, color = "text-primary",
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ElementType; trend?: string; color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">{label}</p>
            <p className="mt-1.5 text-2xl font-semibold">{value}</p>
            {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={`rounded-xl bg-muted/60 p-2.5 ${color}`}>
            <Icon className="size-4" />
          </div>
        </div>
        {trend && (
          <p className="mt-3 flex items-center gap-1 text-xs text-emerald-600">
            <ArrowUpRight className="size-3" /> {trend}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function OverviewPage() {
  const { session, loading: sessionLoading } = useSession();
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [latestReport, setLatestReport] = useState<Report | null>(null);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [loadingReport, setLoadingReport] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const firstAccount = session.connectedAccounts?.[0];

  useEffect(() => {
    if (!session.signedIn) { setLoadingBilling(false); return; }
    billingApi.plan()
      .then(setBilling)
      .catch(() => null)
      .finally(() => setLoadingBilling(false));
  }, [session.signedIn]);

  useEffect(() => {
    if (!firstAccount?.id) { setLoadingReport(false); return; }
    reportsApi.latest(firstAccount.id)
      .then((r) => setLatestReport(r.report))
      .catch(() => null)
      .finally(() => setLoadingReport(false));
  }, [firstAccount?.id]);

  const handleRefresh = async () => {
    if (!firstAccount?.id) return;
    setRefreshing(true);
    try {
      const r = await reportsApi.refresh(firstAccount.id);
      setLatestReport(r.report);
    } catch { /* noop */ } finally {
      setRefreshing(false);
    }
  };

  const usage = billing?.usage;
  const plan = billing?.plan;
  const analysisLimit = plan?.analysisLimitPerMonth ?? 4;
  const analysesUsed = usage?.analysesUsed ?? 0;
  const usagePct = analysisLimit ? Math.min(100, Math.round((analysesUsed / analysisLimit) * 100)) : 100;

  if (sessionLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {session.signedIn && session.name
              ? `Welcome back, ${session.name.split(" ")[0]} 👋`
              : "Overview"}
          </h1>
          {session.signedIn && (
            <p className="mt-1 text-sm text-muted-foreground">
              @{session.connectedAccounts?.[0]?.handle ?? "—"} · {plan?.name ?? "Free"} plan
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing || !firstAccount}>
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh report"}
          </Button>
          <Link href="/analyze">
            <Button size="sm" className="gap-2">
              <Zap className="size-4" />
              Analyze post
            </Button>
          </Link>
        </div>
      </div>

      {/* Not connected banner */}
      {!session.signedIn && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <TrendingUp className="size-10 text-muted-foreground" />
            <p className="font-semibold">Connect your X account to see your dashboard</p>
            <p className="text-sm text-muted-foreground">Your overview, scores, and reports will appear here.</p>
            <Link href="/onboarding">
              <Button>Connect X</Button>
            </Link>
          </CardContent>
        </Card>
      )}

      {/* Stats grid */}
      {session.signedIn && (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {loadingBilling ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
            ) : (
              <>
                <StatCard
                  label="Analyses used"
                  value={`${analysesUsed} / ${analysisLimit === null ? "∞" : analysisLimit}`}
                  sub={`${usagePct}% of monthly quota`}
                  icon={BarChart3}
                  color="text-blue-600"
                />
                <StatCard
                  label="Connected accounts"
                  value={session.connectedAccounts?.filter(a => a.status === "CONNECTED").length ?? 0}
                  sub={`of ${plan?.connectedAccountLimit ?? 1} allowed`}
                  icon={Users}
                  color="text-violet-600"
                />
                <StatCard
                  label="Current plan"
                  value={plan?.name ?? "Free"}
                  sub={plan?.tier !== "FREE" ? billing?.subscription?.status ?? "" : "Upgrade to unlock more"}
                  icon={Sparkles}
                  color="text-amber-600"
                />
                <StatCard
                  label="Next reset"
                  value={usage?.resetAt ? new Date(usage.resetAt).toLocaleDateString("en", { month: "short", day: "numeric" }) : "—"}
                  sub="Usage counter resets"
                  icon={Clock}
                  color="text-emerald-600"
                />
              </>
            )}
          </div>

          {/* Latest report */}
          <div className="grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-3">
                  <span className="font-semibold">Latest Report</span>
                  {latestReport && (
                    <Badge variant="secondary">
                      {new Date(latestReport.createdAt).toLocaleDateString()}
                    </Badge>
                  )}
                </CardHeader>
                <Separator />
                <CardContent className="pt-4">
                  {loadingReport ? (
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-3/4" />
                    </div>
                  ) : latestReport ? (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        <span className="text-sm font-medium capitalize">{latestReport.type.toLowerCase()} report</span>
                        <span className="text-xs text-muted-foreground">
                          · {new Date(latestReport.periodStart).toLocaleDateString()} – {new Date(latestReport.periodEnd).toLocaleDateString()}
                        </span>
                      </div>
                      {(latestReport.payload as { message?: string }).message && (
                        <p className="rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                          {(latestReport.payload as { message?: string }).message}
                        </p>
                      )}
                      <div className="flex gap-2 pt-1">
                        <Link href="/analyze"><Button variant="outline" size="sm">View analyze →</Button></Link>
                        <Link href="/analyze/audience"><Button variant="outline" size="sm">View audience →</Button></Link>
                      </div>
                    </div>
                  ) : (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      No report yet. Click &quot;Refresh report&quot; to generate your first analysis.
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick links */}
            <div className="space-y-3">
              {[
                { href: "/analyze", icon: BarChart3, label: "Post Analyzer", desc: "Score any X post" },
                { href: "/engage", icon: Sparkles, label: "Signal Feed", desc: "Find conversations" },
                { href: "/compliance", icon: Shield, label: "Compliance", desc: "Review open flags" },
                { href: "/compose", icon: Zap, label: "Compose", desc: "Create & schedule" },
              ].map((item) => (
                <Link key={item.href} href={item.href}>
                  <Card className="transition-shadow hover:shadow-md cursor-pointer">
                    <CardContent className="flex items-center gap-3 py-3">
                      <div className="rounded-lg bg-muted p-2">
                        <item.icon className="size-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                      <ArrowUpRight className="ml-auto size-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
