"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { complianceApi } from "@/lib/api";
import type { ComplianceFlag } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Shield, AlertTriangle, CheckCircle2, X, ExternalLink } from "lucide-react";

const SEVERITY_STYLES = {
  LOW: "bg-yellow-500/10 text-yellow-700 border-yellow-200",
  MEDIUM: "bg-orange-500/10 text-orange-700 border-orange-200",
  HIGH: "bg-red-500/10 text-red-700 border-red-200",
};

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600";
  const label = score >= 80 ? "Healthy" : score >= 60 ? "Needs review" : "At risk";
  return (
    <div className="flex flex-col items-center gap-2 py-4">
      <div className={`text-5xl font-bold ${color}`}>{score}</div>
      <div className="h-2 w-32 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full ${score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-red-500"}`}
          style={{ width: `${score}%` }} />
      </div>
      <Badge variant="secondary" className={color.replace("text-", "bg-").replace("-600", "-500/10") + " " + color}>
        {label}
      </Badge>
    </div>
  );
}

export default function CompliancePage() {
  const { session } = useSession();
  const [score, setScore] = useState<number | null>(null);
  const [flags, setFlags] = useState<ComplianceFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [totalChecked, setTotalChecked] = useState(0);

  const firstAccount = session.connectedAccounts?.[0];

  const load = () => {
    if (!firstAccount?.id) { setLoading(false); return; }
    setLoading(true);
    complianceApi.data(firstAccount.id)
      .then((d) => {
        setScore(d.score);
        setFlags(d.flags);
        setTotalChecked(d.totalPostsChecked);
      })
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [firstAccount?.id]);

  const handleDismiss = async (flagId: string) => {
    setDismissing(flagId);
    try {
      await complianceApi.dismissFlag(flagId);
      setFlags((prev) => prev.map((f) => f.id === flagId ? { ...f, status: "DISMISSED" as const } : f));
    } catch { /* noop */ } finally {
      setDismissing(null);
    }
  };

  const openFlags = flags.filter(f => f.status === "OPEN");
  const dismissedFlags = flags.filter(f => f.status === "DISMISSED");

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Compliance</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flags and rule violations detected across your posts.
        </p>
      </div>

      {!firstAccount ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Shield className="mx-auto size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Connect an X account to see compliance data.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Score + stats */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="md:col-span-1">
              <CardContent className="pt-4">
                {loading ? <Skeleton className="h-32 w-full" /> : <ScoreGauge score={score ?? 100} />}
                <p className="text-center text-xs text-muted-foreground">Compliance score</p>
              </CardContent>
            </Card>
            <div className="md:col-span-2 grid grid-cols-2 gap-3">
              {[
                { label: "Open flags", value: loading ? "—" : openFlags.length, icon: AlertTriangle, color: "text-orange-600" },
                { label: "Dismissed", value: loading ? "—" : dismissedFlags.length, icon: CheckCircle2, color: "text-emerald-600" },
                { label: "Posts checked", value: loading ? "—" : totalChecked, icon: Shield, color: "text-blue-600" },
                { label: "Account", value: firstAccount.handle ? `@${firstAccount.handle}` : "—", icon: Shield, color: "text-violet-600" },
              ].map((s) => (
                <Card key={s.label}>
                  <CardContent className="pt-4">
                    <div className={`mb-1 ${s.color}`}><s.icon className="size-4" /></div>
                    <p className="text-xl font-semibold">{s.value}</p>
                    <p className="text-xs text-muted-foreground">{s.label}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Flags */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Open flags ({openFlags.length})</h2>
            </div>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : openFlags.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-10 text-center">
                  <CheckCircle2 className="mx-auto size-8 text-emerald-600 mb-2" />
                  <p className="text-sm font-medium text-emerald-700">No open flags</p>
                  <p className="text-xs text-muted-foreground mt-1">Your account looks clean across {totalChecked} checked posts.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {openFlags.map((flag) => (
                  <Card key={flag.id} className={`border-l-4 ${SEVERITY_STYLES[flag.severity].split(" ").find(c => c.startsWith("border-")) ?? ""}`}>
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-2">
                            <Badge variant="outline" className={SEVERITY_STYLES[flag.severity]}>
                              {flag.severity}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{flag.rule.category}</span>
                            <span className="text-xs text-muted-foreground">{new Date(flag.flaggedAt).toLocaleDateString()}</span>
                          </div>
                          <p className="text-sm font-medium">{flag.rule.description}</p>
                          {flag.explanation && (
                            <p className="mt-1 text-xs text-muted-foreground">{flag.explanation}</p>
                          )}
                          {flag.post && (
                            <p className="mt-2 text-xs text-muted-foreground truncate border-l-2 pl-2">
                              &ldquo;{flag.post.text.slice(0, 120)}&rdquo;
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                          {flag.rule.sourceUrl && (
                            <a href={flag.rule.sourceUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="size-8">
                                <ExternalLink className="size-3.5" />
                              </Button>
                            </a>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={dismissing === flag.id}
                            onClick={() => handleDismiss(flag.id)}
                          >
                            <X className="size-3" />
                            Dismiss
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
