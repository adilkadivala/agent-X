"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { audienceApi } from "@/lib/api";
import type { ActiveTimesData } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Clock, TrendingUp } from "lucide-react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function ActiveTimesPage() {
  const { session } = useSession();
  const [data, setData] = useState<ActiveTimesData | null>(null);
  const [loading, setLoading] = useState(true);

  const firstAccount = session.connectedAccounts?.[0];

  useEffect(() => {
    if (!firstAccount?.id) { setLoading(false); return; }
    audienceApi.activeTimes(firstAccount.id)
      .then(setData)
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [firstAccount?.id]);

  const max = Math.max(...(data?.dayActivity.map(d => d.postCount) ?? [1]), 1);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold">Active Times</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          When your posts get the most traction — based on {data?.totalPostsAnalyzed ?? 0} posts analyzed.
        </p>
      </div>

      <Card>
        <CardHeader className="pb-3 flex flex-row items-center gap-2">
          <Clock className="size-4 text-muted-foreground" />
          <span className="font-semibold">Posts by day of week</span>
        </CardHeader>
        <Separator />
        <CardContent className="pt-6">
          {loading ? (
            <div className="flex gap-3 items-end h-40">
              {Array.from({ length: 7 }).map((_, i) => (
                <Skeleton key={i} className="flex-1 rounded-t-lg" style={{ height: `${30 + Math.random() * 70}%` }} />
              ))}
            </div>
          ) : (
            <div className="flex gap-3 items-end h-40">
              {(data?.dayActivity ?? DAYS.map(d => ({ day: d, postCount: 0 }))).map((item) => {
                const pct = max > 0 ? Math.max(8, (item.postCount / max) * 100) : 8;
                return (
                  <div key={item.day} className="flex flex-1 flex-col items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">{item.postCount}</span>
                    <div className="w-full rounded-t-lg bg-primary/20 flex items-end" style={{ height: "100%" }}>
                      <div
                        className="w-full rounded-t-lg bg-primary transition-all duration-700"
                        style={{ height: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground">{item.day}</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex items-start gap-3 py-5">
          <TrendingUp className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium">AI Recommendation</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {loading ? <Skeleton className="h-4 w-full" /> : (data?.bestWindow ?? "Connect agents-api for AI-powered posting time recommendations.")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
