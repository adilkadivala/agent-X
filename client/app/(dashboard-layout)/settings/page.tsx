"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/use-session";
import { accountsApi, billingApi, authApi } from "@/lib/api";
import type { ConnectedAccount, BillingData } from "@/lib/api";
import { startXConnect } from "@/lib/connect-x";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Settings, Twitter, CreditCard, Shield, LogOut,
  CheckCircle2, XCircle, ChevronRight, Zap, Crown, Building2, User
} from "lucide-react";
import { useRouter } from "next/navigation";

const PLAN_ICON: Record<string, React.ElementType> = {
  FREE: User, CREATOR: Zap, PRO: Crown, AGENCY: Building2,
};

const PLAN_COLOR: Record<string, string> = {
  FREE: "text-gray-600 bg-gray-500/10",
  CREATOR: "text-blue-700 bg-blue-500/10",
  PRO: "text-violet-700 bg-violet-500/10",
  AGENCY: "text-amber-700 bg-amber-500/10",
};

const PLANS = [
  { tier: "CREATOR", name: "Creator", price: "$19/mo", desc: "60 analyses, 1 account" },
  { tier: "PRO", name: "Pro", price: "$59/mo", desc: "Unlimited analyses, 3 accounts", highlight: true },
  { tier: "AGENCY", name: "Agency", price: "$199/mo", desc: "25 accounts, 5 seats" },
];

export default function SettingsPage() {
  const { session, loading: sessionLoading } = useSession();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingBilling, setLoadingBilling] = useState(true);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [checkingOut, setCheckingOut] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billing_interval, setBillingInterval] = useState<"month" | "year">("month");
  const router = useRouter();

  useEffect(() => {
    if (!session.signedIn) { setLoadingAccounts(false); setLoadingBilling(false); return; }
    accountsApi.list()
      .then((r) => setAccounts(r.accounts))
      .catch(() => null)
      .finally(() => setLoadingAccounts(false));
    billingApi.plan()
      .then(setBilling)
      .catch(() => null)
      .finally(() => setLoadingBilling(false));
  }, [session.signedIn]);

  const handleDisconnect = async (id: string) => {
    if (!confirm("Disconnect this account? Your data will be retained.")) return;
    setDisconnecting(id);
    try {
      await accountsApi.disconnect(id);
      setAccounts((prev) => prev.map((a) => a.id === id ? { ...a, status: "DISCONNECTED" } : a));
    } catch { /* noop */ } finally { setDisconnecting(null); }
  };

  const handleConnect = async () => {
    setConnecting(true);
    try { await startXConnect(); } catch { /* noop */ } finally { setConnecting(false); }
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await authApi.logout();
    router.push("/");
  };

  const handleCheckout = async (tier: string) => {
    setCheckingOut(tier);
    try {
      const { url } = await billingApi.checkout(tier, billing_interval);
      if (url) window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Checkout failed");
    } finally { setCheckingOut(null); }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { url } = await billingApi.portal();
      if (url) window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : "Portal not available");
    } finally { setPortalLoading(false); }
  };

  const currentTier = billing?.plan?.tier ?? "FREE";
  const PlanIcon = PLAN_ICON[currentTier] ?? User;
  const planColor = PLAN_COLOR[currentTier] ?? PLAN_COLOR.FREE!;

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your account, connections, and billing.</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 text-destructive hover:text-destructive" onClick={handleLogout} disabled={loggingOut}>
          <LogOut className="size-4" />
          {loggingOut ? "Signing out…" : "Sign out"}
        </Button>
      </div>

      {/* Account section */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Settings className="size-4 text-muted-foreground" />
          <span className="font-semibold">Account</span>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 space-y-3">
          {sessionLoading ? <Skeleton className="h-12 w-full" /> : (
            <div className="flex items-center gap-3 rounded-lg border p-3">
              <div className="flex size-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                {session.name?.slice(0, 2).toUpperCase() ?? "?"}
              </div>
              <div>
                <p className="text-sm font-medium">{session.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">{session.email ?? "No email on file"}</p>
              </div>
              <div className={`ml-auto flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${planColor}`}>
                <PlanIcon className="size-3" />
                {billing?.plan?.name ?? "Free"}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Connected accounts */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <Twitter className="size-4 text-muted-foreground" />
            <span className="font-semibold">Connected accounts</span>
          </div>
          <Button size="sm" variant="outline" onClick={handleConnect} disabled={connecting} className="gap-2">
            <Twitter className="size-3.5" />
            {connecting ? "Connecting…" : "Add account"}
          </Button>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 space-y-2">
          {loadingAccounts ? (
            <Skeleton className="h-14 w-full" />
          ) : accounts.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No accounts connected. Click &quot;Add account&quot; to connect X.
            </div>
          ) : (
            accounts.map((account) => (
              <div key={account.id} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {account.handle?.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">@{account.handle}</p>
                  <p className="text-xs text-muted-foreground capitalize">{account.platform.toLowerCase()} · {account.status.toLowerCase()}</p>
                </div>
                {account.status === "CONNECTED"
                  ? <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                  : <XCircle className="size-4 text-muted-foreground shrink-0" />}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-destructive hover:text-destructive"
                  disabled={disconnecting === account.id}
                  onClick={() => handleDisconnect(account.id)}
                >
                  {disconnecting === account.id ? "…" : "Disconnect"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Billing */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-muted-foreground" />
            <span className="font-semibold">Billing & Plan</span>
          </div>
          {billing?.subscription && (
            <Button size="sm" variant="outline" onClick={handlePortal} disabled={portalLoading}>
              {portalLoading ? "Loading…" : "Manage billing →"}
            </Button>
          )}
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 space-y-4">
          {loadingBilling ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <div className="rounded-lg border p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium">{billing?.plan?.name ?? "Free"} plan</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {billing?.usage
                        ? `${billing.usage.analysesUsed} / ${billing.plan?.analysisLimitPerMonth ?? 4} analyses used this month`
                        : "No usage data"}
                    </p>
                  </div>
                  <Badge variant="secondary">{billing?.subscription?.status ?? "FREE"}</Badge>
                </div>
                {billing?.usage && billing.plan?.analysisLimitPerMonth && (
                  <div className="mt-3 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${Math.min(100, (billing.usage.analysesUsed / billing.plan.analysisLimitPerMonth) * 100)}%` }}
                    />
                  </div>
                )}
              </div>

              {currentTier !== "AGENCY" && (
                <>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    {(["month", "year"] as const).map((i) => (
                      <button
                        key={i}
                        onClick={() => setBillingInterval(i)}
                        className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${billing_interval === i ? "bg-primary text-primary-foreground" : "text-muted-foreground border"}`}
                      >
                        {i === "year" ? "Annual (save 17%)" : "Monthly"}
                      </button>
                    ))}
                  </div>
                  <div className="space-y-2">
                    {PLANS.filter(p => {
                      const order = ["FREE", "CREATOR", "PRO", "AGENCY"];
                      return order.indexOf(p.tier) > order.indexOf(currentTier);
                    }).map((plan) => (
                      <div key={plan.tier} className={`flex items-center justify-between rounded-lg border p-3 ${plan.highlight ? "ring-1 ring-primary/30 border-primary/40" : ""}`}>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{plan.name}</span>
                            {plan.highlight && <Badge className="text-[10px]">Recommended</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground">{plan.desc}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold">{plan.price}</span>
                          <Button
                            size="sm"
                            variant={plan.highlight ? "default" : "outline"}
                            disabled={checkingOut === plan.tier}
                            onClick={() => handleCheckout(plan.tier)}
                            className="gap-1"
                          >
                            {checkingOut === plan.tier ? "…" : "Upgrade"}
                            <ChevronRight className="size-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Shield className="size-4 text-muted-foreground" />
          <span className="font-semibold">Security</span>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            OAuth only — no password stored
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            Tokens encrypted with AES-256-GCM at rest
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            HMAC-signed session cookie — 30 day expiry
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600" />
            Nothing published without your explicit approval
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
