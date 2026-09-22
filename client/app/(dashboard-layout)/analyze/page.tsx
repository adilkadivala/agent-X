"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/use-session";
import { postsApi } from "@/lib/api";
import type { Post } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { ScanSearch, Zap, Clock, TrendingUp, AlertTriangle, ExternalLink } from "lucide-react";

function ScoreBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold">{value}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${color}`}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const color = value >= 80 ? "text-emerald-600" : value >= 60 ? "text-amber-600" : "text-red-600";
  return (
    <div className={`flex flex-col items-center gap-1 ${color}`}>
      <span className="text-4xl font-bold">{value}</span>
      <span className="text-xs text-muted-foreground">Overall</span>
    </div>
  );
}

export default function AnalyzePage() {
  const { session } = useSession();
  const [url, setUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof postsApi.analyze>> | null>(null);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<Post[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const firstAccount = session.connectedAccounts?.[0];

  useEffect(() => {
    if (!firstAccount?.id) return;
    setLoadingHistory(true);
    postsApi.history(firstAccount.id)
      .then((r) => setHistory(r.posts))
      .catch(() => null)
      .finally(() => setLoadingHistory(false));
  }, [firstAccount?.id]);

  const handleAnalyze = async () => {
    if (!url.trim()) return;
    if (!firstAccount?.id) { setError("Connect an X account first."); return; }
    setError("");
    setAnalyzing(true);
    setResult(null);
    try {
      const r = await postsApi.analyze(url.trim(), firstAccount.id);
      setResult(r);
      // refresh history
      postsApi.history(firstAccount.id).then((h) => setHistory(h.posts)).catch(() => null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Post Analyzer</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Paste any X post URL to score it on hook strength, structure, sentiment, shareability, and AI-slop risk.
        </p>
      </div>

      {/* Analyzer input */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex gap-2">
            <Input
              ref={inputRef}
              placeholder="https://x.com/username/status/..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAnalyze(); }}
              className="font-mono text-sm"
            />
            <Button onClick={handleAnalyze} disabled={analyzing || !url.trim()} className="shrink-0 gap-2">
              <ScanSearch className="size-4" />
              {analyzing ? "Analyzing…" : "Analyze"}
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
          <p className="mt-2 text-xs text-muted-foreground">
            Uses {session.plan === "FREE" ? "your free quota" : session.plan + " plan"} · paste the full tweet URL
          </p>
        </CardContent>
      </Card>

      {/* Result */}
      {(analyzing || result) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <span className="font-semibold">Analysis Result</span>
            {result && (
              <a href={result.url} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" size="sm" className="gap-1 text-xs">
                  <ExternalLink className="size-3" /> Open post
                </Button>
              </a>
            )}
          </CardHeader>
          <Separator />
          <CardContent className="pt-5">
            {analyzing ? (
              <div className="space-y-3">
                <Skeleton className="h-16 w-full rounded-xl" />
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
                </div>
              </div>
            ) : result?.scores ? (
              <div className="grid gap-6 md:grid-cols-[auto_1fr]">
                <div className="flex flex-col items-center justify-center rounded-2xl bg-muted/40 px-8 py-6 gap-2">
                  <ScoreRing value={result.scores.overallScore} />
                  <Badge
                    variant="secondary"
                    className={result.scores.overallScore >= 80 ? "bg-emerald-500/10 text-emerald-700" :
                      result.scores.overallScore >= 60 ? "bg-amber-500/10 text-amber-700" : "bg-red-500/10 text-red-700"}
                  >
                    {result.scores.overallScore >= 80 ? "High signal" : result.scores.overallScore >= 60 ? "Medium signal" : "Low signal"}
                  </Badge>
                </div>
                <div className="space-y-3">
                  <ScoreBar label="Hook strength" value={result.scores.hookScore} color="bg-blue-500" />
                  <ScoreBar label="Structure" value={result.scores.structureScore} color="bg-violet-500" />
                  <ScoreBar label="Sentiment" value={result.scores.sentimentScore} color="bg-emerald-500" />
                  <ScoreBar label="Shareability" value={result.scores.shareabilityScore} color="bg-amber-500" />
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <AlertTriangle className="size-3 text-orange-500" /> AI slop risk
                      </span>
                      <span className={`font-semibold ${result.scores.aiSlopScore > 50 ? "text-red-600" : "text-emerald-600"}`}>
                        {result.scores.aiSlopScore}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${result.scores.aiSlopScore > 50 ? "bg-red-500" : "bg-emerald-500"}`}
                        style={{ width: `${result.scores.aiSlopScore}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{result?.message ?? "No scores returned."}</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* History */}
      <div>
        <h2 className="mb-3 font-semibold">Recent analyses</h2>
        {loadingHistory ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
          </div>
        ) : history.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
              <Zap className="size-8" />
              <p className="text-sm">No posts analyzed yet. Paste a URL above to start.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {history.map((post) => (
              <Card key={post.id}>
                <CardContent className="flex items-center gap-4 py-3">
                  <div className={`flex flex-col items-center justify-center size-12 shrink-0 rounded-xl text-sm font-bold ${
                    (post.score?.overallScore ?? 0) >= 80 ? "bg-emerald-500/10 text-emerald-700" :
                    (post.score?.overallScore ?? 0) >= 60 ? "bg-amber-500/10 text-amber-700" :
                    "bg-muted text-muted-foreground"
                  }`}>
                    {post.score?.overallScore ?? "—"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-mono truncate text-muted-foreground">{post.platformPostId}</p>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><TrendingUp className="size-3" /> Hook: {post.score?.hookScore ?? "—"}</span>
                      <span className="flex items-center gap-1"><Zap className="size-3" /> Share: {post.score?.shareabilityScore ?? "—"}</span>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                    <Clock className="size-3" />
                    {new Date(post.publishedAt).toLocaleDateString()}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
