"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { audienceApi } from "@/lib/api";
import type { FollowerBreakdown } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Users, TrendingUp, Star, Bot, Building2, User } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const TYPE_META: Record<string, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  HUMAN: { label: "Human", icon: User, color: "text-blue-700", bg: "bg-blue-500/10" },
  BOT: { label: "Bot", icon: Bot, color: "text-red-700", bg: "bg-red-500/10" },
  BRAND: { label: "Brand", icon: Building2, color: "text-violet-700", bg: "bg-violet-500/10" },
  INFLUENCER: { label: "Influencer", icon: Star, color: "text-amber-700", bg: "bg-amber-500/10" },
  LURKER: { label: "Lurker", icon: TrendingUp, color: "text-gray-600", bg: "bg-gray-500/10" },
};

function BreakdownBar({ type, count, percentage }: { type: string; count: number; percentage: number }) {
  const meta = TYPE_META[type] ?? { label: type, icon: Users, color: "text-primary", bg: "bg-primary/10" };
  const Icon = meta.icon;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2">
          <span className={`inline-flex size-6 items-center justify-center rounded-md ${meta.bg} ${meta.color}`}>
            <Icon className="size-3.5" />
          </span>
          {meta.label}
        </span>
        <span className="font-semibold">{percentage}% <span className="text-muted-foreground font-normal">({count.toLocaleString()})</span></span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${meta.color.replace("text-", "bg-")}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

export default function AudiencePage() {
  const { session } = useSession();
  const [data, setData] = useState<FollowerBreakdown | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const firstAccount = session.connectedAccounts?.[0];

  useEffect(() => {
    if (!firstAccount?.id) { setLoading(false); return; }
    audienceApi.breakdown(firstAccount.id)
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load audience data"))
      .finally(() => setLoading(false));
  }, [firstAccount?.id]);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold">Audience Intelligence</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Know who&apos;s listening — segmented by follower type and engagement level.
          </p>
        </div>
        <Link href="/analyze/active-times">
          <Button variant="outline" size="sm">Active times →</Button>
        </Link>
      </div>

      {!firstAccount && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Users className="mx-auto size-10 mb-3" />
            <p className="text-sm">Connect an X account to see audience data.</p>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {firstAccount && (
        <div className="grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          {/* Breakdown */}
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <span className="font-semibold">Follower breakdown</span>
              {data && <Badge variant="secondary">{data.total.toLocaleString()} total</Badge>}
            </CardHeader>
            <Separator />
            <CardContent className="pt-5 space-y-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)
              ) : data?.breakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No follower samples yet. Data populates as analysis runs.
                </p>
              ) : (
                (data?.breakdown ?? []).map((b) => (
                  <BreakdownBar key={b.type} type={b.type} count={b.count} percentage={b.percentage} />
                ))
              )}
            </CardContent>
          </Card>

          {/* Top followers */}
          <Card>
            <CardHeader className="pb-3">
              <span className="font-semibold">Top engaged followers</span>
            </CardHeader>
            <Separator />
            <CardContent className="pt-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (data?.topFollowers.length ?? 0) === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No follower data yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {data!.topFollowers.map((f) => {
                    const meta = TYPE_META[f.classifiedType] ?? TYPE_META.HUMAN!;
                    const Icon = meta.icon;
                    return (
                      <div key={f.platformFollowerId} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <div className={`flex size-8 items-center justify-center rounded-md ${meta.bg} ${meta.color}`}>
                          <Icon className="size-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">@{f.handle}</p>
                          <p className="text-xs text-muted-foreground">{meta.label}</p>
                        </div>
                        <span className="text-xs text-muted-foreground">{f.engagementCount} interactions</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
