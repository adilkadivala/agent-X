"use client"

import * as React from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { DashboardCard } from "@/components/dashboard-card"
import { CircleCheckIcon, ArrowRightIcon, CreditCardIcon, ZapIcon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { billingApi } from "@/lib/api"
import type { BillingData } from "@/lib/api"

export function BillingHealth() {
  const { session } = useSession()
  const [billing, setBilling] = React.useState<BillingData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let isMounted = true

    if (!session.signedIn) {
      setLoading(false)
      return
    }

    billingApi
      .plan()
      .then((data) => {
        if (isMounted) setBilling(data)
      })
      .catch((err) => {
        console.error("Failed to load billing status", err)
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [session.signedIn])

  const plan = billing?.plan
  const usage = billing?.usage
  const sub = billing?.subscription
  const used = usage?.analysesUsed ?? 0
  const limit = plan?.analysisLimitPerMonth
  const limitText = limit === null || limit === undefined ? "Unlimited" : `${limit}`

  return (
    <DashboardCard className="gap-0">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-balance text-base">Billing & Subscription</CardTitle>
          {plan && (
            <Badge variant="secondary" className="capitalize text-xs">
              {plan.name} Tier
            </Badge>
          )}
        </div>
        <CardDescription className="text-pretty">
          {session.signedIn
            ? `${used} of ${limitText} analyses utilized this billing cycle.`
            : "Connect your workspace to manage subscription tiers."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex h-full items-center px-0">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              {sub?.status === "ACTIVE" ? (
                <CircleCheckIcon aria-hidden="true" className="text-emerald-500" />
              ) : (
                <CreditCardIcon aria-hidden="true" className="text-primary" />
              )}
            </EmptyMedia>
            <EmptyTitle>
              {session.signedIn
                ? sub?.status === "ACTIVE"
                  ? "Subscription is Active"
                  : `${plan?.name ?? "Free"} Plan Active`
                : "No Active Subscription"}
            </EmptyTitle>
            <EmptyDescription className="text-xs">
              {session.signedIn
                ? `Account renews monthly. Quota resets on ${
                    usage?.resetAt
                      ? new Date(usage.resetAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                        })
                      : "end of period"
                  }.`
                : "Choose Creator, Pro, or Agency to unlock unlimited signal analysis."}
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
            >
              <ZapIcon className="size-3" />
              Manage Plan & Pricing
              <ArrowRightIcon className="size-3" aria-hidden="true" />
            </Link>
          </EmptyContent>
        </Empty>
      </CardContent>
    </DashboardCard>
  )
}
