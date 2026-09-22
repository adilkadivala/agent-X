"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { suggestionsApi } from "@/lib/api";
import type { Suggestion } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Sparkles, CheckCircle2, X, Filter } from "lucide-react";

const CATEGORY_STYLES: Record<string, string> = {
  CONTENT: "bg-blue-500/10 text-blue-700",
  TIMING: "bg-violet-500/10 text-violet-700",
  COMPLIANCE: "bg-red-500/10 text-red-700",
};

type Category = "ALL" | "CONTENT" | "TIMING" | "COMPLIANCE";

export default function EngagePage() {
  const { session } = useSession();
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category>("ALL");
  const [acting, setActing] = useState<string | null>(null);

  const firstAccount = session.connectedAccounts?.[0];

  const load = (cat?: string) => {
    if (!firstAccount?.id) { setLoading(false); return; }
    setLoading(true);
    suggestionsApi.list(firstAccount.id, cat === "ALL" ? undefined : cat)
      .then((r) => setSuggestions(r.suggestions))
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(filter); }, [firstAccount?.id, filter]);

  const handleAccept = async (id: string) => {
    setActing(id);
    try {
      await suggestionsApi.accept(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch { /* noop */ } finally { setActing(null); }
  };

  const handleDismiss = async (id: string) => {
    setActing(id);
    try {
      await suggestionsApi.dismiss(id);
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
    } catch { /* noop */ } finally { setActing(null); }
  };

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Engage</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-generated suggestions for your content, timing, and compliance. Act or dismiss.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="size-4 text-muted-foreground" />
          {(["ALL", "CONTENT", "TIMING", "COMPLIANCE"] as Category[]).map((cat) => (
            <Button
              key={cat}
              variant={filter === cat ? "default" : "outline"}
              size="sm"
              onClick={() => setFilter(cat)}
              className="text-xs"
            >
              {cat}
            </Button>
          ))}
        </div>
      </div>

      {!firstAccount ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <Sparkles className="mx-auto size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Connect your X account to see suggestions.</p>
          </CardContent>
        </Card>
      ) : loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : suggestions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="mx-auto size-10 text-emerald-600 mb-3" />
            <p className="font-medium">All caught up!</p>
            <p className="text-sm text-muted-foreground mt-1">
              No {filter !== "ALL" ? filter.toLowerCase() + " " : ""}suggestions right now. Check back after your next report refresh.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {suggestions.map((s) => (
            <Card key={s.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge className={CATEGORY_STYLES[s.category] ?? ""}>{s.category}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(s.createdAt).toLocaleDateString()}</span>
                    </div>
                    <p className="text-sm font-semibold">{s.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1 text-xs"
                      disabled={acting === s.id}
                      onClick={() => handleDismiss(s.id)}
                    >
                      <X className="size-3" /> Dismiss
                    </Button>
                    <Button
                      size="sm"
                      className="gap-1 text-xs"
                      disabled={acting === s.id}
                      onClick={() => handleAccept(s.id)}
                    >
                      <CheckCircle2 className="size-3" /> Accept
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
