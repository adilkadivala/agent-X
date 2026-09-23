"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
  CreditCardIcon,
  LogOutIcon,
  ZapIcon,
  CheckCircle2Icon,
  ExternalLinkIcon,
  Trash2Icon,
} from "lucide-react"
import { XIcon } from "@/components/x-icon"
import { useSession } from "@/lib/use-session"
import { startXConnect } from "@/lib/connect-x"
import { accountsApi, billingApi, authApi } from "@/lib/api"
import type { ConnectedAccount, BillingData } from "@/lib/api"

export default function SettingsPage() {
  const { session, loading: sessionLoading } = useSession()
  const [accounts, setAccounts] = React.useState<ConnectedAccount[]>([])
  const [billing, setBilling] = React.useState<BillingData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [disconnecting, setDisconnecting] = React.useState<string | null>(null)
  const [checkingOut, setCheckingOut] = React.useState<string | null>(null)

  React.useEffect(() => {
    let isMounted = true
    if (!session.signedIn) {
      setLoading(false)
      return
    }

    Promise.allSettled([accountsApi.list(), billingApi.plan()])
      .then(([accRes, billRes]) => {
        if (!isMounted) return
        if (accRes.status === "fulfilled") setAccounts(accRes.value.accounts || [])
        if (billRes.status === "fulfilled") setBilling(billRes.value)
      })
      .catch((e) => console.error(e))
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [session.signedIn])

  const handleDisconnect = async (id: string) => {
    if (!confirm("Are you sure you want to disconnect this account?")) return
    setDisconnecting(id)
    try {
      await accountsApi.disconnect(id)
      setAccounts((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      console.error(err)
    } finally {
      setDisconnecting(null)
    }
  }

  const handleConnect = async () => {
    try {
      await startXConnect()
    } catch (e) {
      console.error(e)
    }
  }

  const handleCheckout = async (tier: string) => {
    setCheckingOut(tier)
    try {
      const res = await billingApi.checkout(tier, "month")
      if (res.url) window.location.href = res.url
    } catch (err) {
      alert(err instanceof Error ? err.message : "Checkout initialization failed")
    } finally {
      setCheckingOut(null)
    }
  }

  const handlePortal = async () => {
    try {
      const res = await billingApi.portal()
      if (res.url) window.location.href = res.url
    } catch (err) {
      alert(err instanceof Error ? err.message : "Portal session failed")
    }
  }

  const handleLogout = async () => {
    try {
      await authApi.logout()
      window.location.href = "/"
    } catch (e) {
      console.error(e)
    }
  }

  const plan = billing?.plan
  const usage = billing?.usage
  const used = usage?.analysesUsed ?? 0
  const limit = plan?.analysisLimitPerMonth
  const limitText = limit === null || limit === undefined ? "Unlimited" : `${limit}`

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Settings & Workspace</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage connected accounts, API credentials, and billing plans.
          </p>
        </div>
        {session.signedIn && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleLogout}
            className="gap-2 text-destructive hover:text-destructive rounded-none text-xs"
          >
            <LogOutIcon className="size-3.5" />
            Sign Out
          </Button>
        )}
      </div>

      {/* Connected Accounts */}
      <Card className="rounded-none">
        <CardHeader className="border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Connected Accounts</CardTitle>
            <CardDescription>
              Platforms authenticated for analysis and approval-gated publishing.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleConnect}
            className="gap-1.5 text-xs rounded-none"
          >
            <XIcon className="size-3" /> Connect Account
          </Button>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          {accounts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground border border-dashed font-mono">
              No external platforms connected. Connect an X account to begin.
            </div>
          ) : (
            accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between border p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="flex size-9 items-center justify-center bg-muted">
                    <XIcon className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold font-mono">@{acc.handle}</p>
                    <p className="text-xs text-muted-foreground">
                      {acc.platform} · {acc.status} · Connected{" "}
                      {new Date(acc.connectedAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={disconnecting === acc.id}
                  onClick={() => handleDisconnect(acc.id)}
                  className="gap-1.5 text-xs text-destructive hover:text-destructive rounded-none font-mono"
                >
                  <Trash2Icon className="size-3" />
                  {disconnecting === acc.id ? "Disconnecting…" : "Disconnect"}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Billing & Subscription */}
      <Card className="rounded-none">
        <CardHeader className="border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Plan & Quotas</CardTitle>
            <CardDescription>
              Active subscription tier and monthly analysis limits.
            </CardDescription>
          </div>
          {billing?.subscription && (
            <Button
              variant="outline"
              size="sm"
              onClick={handlePortal}
              className="gap-1.5 text-xs rounded-none font-mono"
            >
              <ExternalLinkIcon className="size-3" /> Customer Portal
            </Button>
          )}
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          <div className="border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">
                Current Plan: {plan?.name || "Free Tier"}
              </span>
              <Badge variant="outline" className="font-mono text-xs">
                {billing?.subscription?.status || "ACTIVE"}
              </Badge>
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono text-muted-foreground">
                <span>Usage this billing period:</span>
                <span>
                  {used} / {limitText} analyses
                </span>
              </div>
              {limit && (
                <div className="h-2 w-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-primary"
                    style={{
                      width: `${Math.min(100, Math.round((used / limit) * 100))}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Upgrade Options */}
          <div className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Available Tiers
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              {[
                {
                  tier: "CREATOR",
                  name: "Creator",
                  price: "$19/mo",
                  desc: "60 analyses/mo, full postmortem & audience",
                },
                {
                  tier: "PRO",
                  name: "Pro",
                  price: "$59/mo",
                  desc: "Unlimited analyses, 3 accounts, signal feed",
                },
                {
                  tier: "AGENCY",
                  name: "Agency",
                  price: "$199/mo",
                  desc: "Unlimited analyses, 25 accounts, 5 team seats",
                },
              ].map((item) => (
                <div
                  key={item.tier}
                  className="border p-4 flex flex-col justify-between space-y-3 bg-muted/10"
                >
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-sm">{item.name}</span>
                      <span className="font-mono text-xs font-bold">{item.price}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {item.desc}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={plan?.tier === item.tier ? "secondary" : "default"}
                    disabled={checkingOut === item.tier || plan?.tier === item.tier}
                    onClick={() => handleCheckout(item.tier)}
                    className="w-full text-xs rounded-none font-mono"
                  >
                    {plan?.tier === item.tier
                      ? "Current Plan"
                      : checkingOut === item.tier
                      ? "Loading…"
                      : `Upgrade to ${item.name}`}
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
