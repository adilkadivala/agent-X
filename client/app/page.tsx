"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight, BarChart3, CheckCircle2, MessageCircle, ScanSearch,
  Sparkles, Shield, Zap, TrendingUp, Users, Star, ChevronRight,
  Twitter, LayoutDashboard
} from "lucide-react";
import { startXConnect } from "@/lib/connect-x";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

// ─── Pricing data ─────────────────────────────────────────────────────────────

const plans = [
  {
    name: "Free",
    price: { monthly: 0, annual: 0 },
    tier: "FREE",
    analyses: "4 / month",
    accounts: 1,
    seats: 1,
    features: ["Post Analyzer (4x/mo)", "Health score preview", "Onboarding walkthrough"],
    cta: "Get started free",
    highlight: false,
  },
  {
    name: "Creator",
    price: { monthly: 19, annual: 190 },
    tier: "CREATOR",
    analyses: "60 / month",
    accounts: 1,
    seats: 1,
    features: [
      "Post Analyzer (60x/mo)",
      "Profile postmortem",
      "Audience intelligence",
      "Active-time heatmap",
      "Compliance dashboard",
    ],
    cta: "Start Creator",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Pro",
    price: { monthly: 59, annual: 500 },
    tier: "PRO",
    analyses: "Unlimited",
    accounts: 3,
    seats: 1,
    features: [
      "Everything in Creator",
      "Unlimited analyses",
      "3 connected accounts",
      "Engage signal feed",
      "Compose & approval gating",
    ],
    cta: "Start Pro",
    highlight: false,
  },
  {
    name: "Agency",
    price: { monthly: 199, annual: 1900 },
    tier: "AGENCY",
    analyses: "Unlimited",
    accounts: 25,
    seats: 5,
    features: [
      "Everything in Pro",
      "25 connected accounts",
      "5 team seats",
      "Priority support",
      "Custom reporting",
    ],
    cta: "Start Agency",
    highlight: false,
  },
];

const features = [
  {
    icon: ScanSearch,
    title: "Post Analyzer",
    desc: "Score any post on hook strength, structure, sentiment, shareability, and AI-slop risk in seconds.",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
  {
    icon: BarChart3,
    title: "Profile Postmortem",
    desc: "Deep-dive into your last 30 days. Find what formats and topics are actually moving the needle.",
    color: "text-violet-600",
    bg: "bg-violet-50 dark:bg-violet-950/30",
  },
  {
    icon: Users,
    title: "Audience Intelligence",
    desc: "Know who's listening. Segment your followers by type — engineers, founders, investors, journalists.",
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
  },
  {
    icon: MessageCircle,
    title: "Signal Feed (Engage)",
    desc: "Ranked reply and quote opportunities from your following. Only the posts worth your attention.",
    color: "text-amber-600",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    icon: Shield,
    title: "Compliance Guardrails",
    desc: "Every draft runs through X policy rules before it reaches you. Flags are explained, not just flagged.",
    color: "text-red-600",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  {
    icon: Sparkles,
    title: "Compose & Schedule",
    desc: "Draft, approve, and schedule. Nothing is published until you say so — ever.",
    color: "text-pink-600",
    bg: "bg-pink-50 dark:bg-pink-950/30",
  },
];

const testimonials = [
  {
    quote: "Finally a tool that tells me *why* a post worked, not just that it got views.",
    name: "Karan M.",
    role: "Founder, building in public",
    avatar: "KM",
  },
  {
    quote: "The compliance check before publishing is a game-changer. I stopped worrying about getting flagged.",
    name: "Priya D.",
    role: "Creator · 28K followers",
    avatar: "PD",
  },
  {
    quote: "Signal feed saves me 2 hours a day. I only see the conversations I should actually be in.",
    name: "Alex T.",
    role: "Indie hacker",
    avatar: "AT",
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [error, setError] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [billing, setBilling] = useState<"monthly" | "annual">("monthly");

  const handleConnect = async () => {
    setError("");
    setIsConnecting(true);
    try {
      await startXConnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start X connect");
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground antialiased">
      {/* ── Nav ─────────────────────────────────────────────────────── */}
      <nav className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <TrendingUp className="size-4" />
            </div>
            <span className="text-base font-semibold tracking-tight">SuperGrow</span>
          </Link>
          <div className="flex items-center gap-4">
            <Link href="#pricing" className="hidden text-sm text-muted-foreground hover:text-foreground sm:block">
              Pricing
            </Link>
            <Link href="/overview">
              <Button variant="outline" size="sm" className="gap-2">
                <LayoutDashboard className="size-3.5" />
                Dashboard
              </Button>
            </Link>
            <Button size="sm" onClick={handleConnect} disabled={isConnecting} className="gap-2">
              <Twitter className="size-3.5" />
              {isConnecting ? "Connecting…" : "Connect X"}
            </Button>
          </div>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 pb-20 pt-20">
        <div className="grid gap-14 lg:grid-cols-[1fr_0.85fr] lg:items-center">
          <div>
            <Badge variant="secondary" className="mb-6 gap-1.5 text-xs font-medium">
              <Zap className="size-3 text-amber-500" />
              Signal intelligence for X · Now in beta
            </Badge>
            <h1 className="text-5xl font-semibold leading-[1.1] tracking-tight sm:text-6xl">
              Build visibility
              <br />
              <span className="text-muted-foreground">without guessing.</span>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              SuperGrow watches the conversations that matter, explains what&apos;s working, and helps you choose the right moment to reply, quote, or publish — all behind your approval.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button size="lg" onClick={handleConnect} disabled={isConnecting} className="gap-2">
                Connect X to start
                <ArrowRight className="size-4" />
              </Button>
              <Link href="#features">
                <Button size="lg" variant="outline">
                  See how it works
                </Button>
              </Link>
            </div>
            {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
            <p className="mt-5 flex items-center gap-2 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              OAuth only · No password · You approve every publish
            </p>
          </div>

          {/* Hero card — live-looking signal feed preview */}
          <div className="relative">
            <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-primary/5 via-transparent to-violet-500/5 blur-2xl" />
            <Card className="relative shadow-2xl">
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <span className="text-sm font-semibold">Signal feed · Today</span>
                <Badge className="gap-1 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10">
                  <span className="size-1.5 animate-pulse rounded-full bg-emerald-500 inline-block" />
                  Live
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { handle: "maya_builds", score: 92, reason: "Reply recommended · 1.8K impressions", tag: "Founders" },
                  { handle: "devonwrites", score: 87, reason: "Quote recommended · 68% audience overlap", tag: "Builders" },
                  { handle: "arjunlabs", score: 81, reason: "Topic match: startups + AI", tag: "Engineers" },
                ].map((item) => (
                  <div key={item.handle} className="rounded-lg border border-border bg-muted/30 p-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">@{item.handle}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.reason}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                          {item.score}
                        </span>
                        <Badge variant="outline" className="text-[10px]">{item.tag}</Badge>
                      </div>
                    </div>
                  </div>
                ))}
                <Separator />
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[["92", "Health score"], ["68%", "Audience fit"], ["0", "Open flags"]].map(([val, label]) => (
                    <div key={label} className="text-center">
                      <p className="text-lg font-semibold">{val}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────── */}
      <section id="features" className="bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Features</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              Everything your X presence needs
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              From a single post to a full account audit — every tool is designed around your approval.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, desc, color, bg }) => (
              <Card key={title} className="border-border/60 transition-shadow hover:shadow-md">
                <CardContent className="pt-6">
                  <div className={`mb-4 inline-flex rounded-xl ${bg} p-3`}>
                    <Icon className={`size-5 ${color}`} />
                  </div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-12 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Testimonials</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">People who stopped guessing</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="border-border/60">
                <CardContent className="pt-6">
                  <div className="mb-4 flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className="size-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <p className="text-sm leading-7 text-muted-foreground">&quot;{t.quote}&quot;</p>
                  <div className="mt-5 flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {t.avatar}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pricing ─────────────────────────────────────────────────── */}
      <section id="pricing" className="bg-muted/30 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-10 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Pricing</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Simple, honest pricing</h2>
            <p className="mx-auto mt-4 max-w-md text-muted-foreground">
              Start free. Upgrade when you need more power.
            </p>
            {/* Billing toggle */}
            <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-background p-1">
              <button
                onClick={() => setBilling("monthly")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  billing === "monthly" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBilling("annual")}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                  billing === "annual" ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Annual
                <span className="ml-1.5 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">-17%</span>
              </button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {plans.map((plan) => (
              <Card
                key={plan.name}
                className={`relative flex flex-col border-border/60 ${
                  plan.highlight ? "border-primary/50 shadow-lg ring-1 ring-primary/20" : ""
                }`}
              >
                {plan.badge && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <Badge className="bg-primary text-primary-foreground shadow">{plan.badge}</Badge>
                  </div>
                )}
                <CardHeader className="pb-4">
                  <p className="text-sm font-medium text-muted-foreground">{plan.name}</p>
                  <div className="mt-1 flex items-end gap-1">
                    <span className="text-3xl font-semibold">
                      ${billing === "annual" && plan.price.annual > 0
                        ? Math.round(plan.price.annual / 12)
                        : plan.price.monthly}
                    </span>
                    {plan.price.monthly > 0 && (
                      <span className="mb-1 text-sm text-muted-foreground">/mo</span>
                    )}
                  </div>
                  {billing === "annual" && plan.price.annual > 0 && (
                    <p className="text-xs text-muted-foreground">${plan.price.annual}/yr · billed annually</p>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col gap-4">
                  <div className="space-y-1 rounded-lg bg-muted/50 p-3 text-xs">
                    <p><span className="font-medium">Analyses:</span> {plan.analyses}</p>
                    <p><span className="font-medium">Accounts:</span> {plan.accounts}</p>
                    <p><span className="font-medium">Seats:</span> {plan.seats}</p>
                  </div>
                  <ul className="flex-1 space-y-2">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    onClick={plan.tier === "FREE" ? handleConnect : handleConnect}
                  >
                    {plan.cta}
                    <ChevronRight className="size-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Stop shouting into the feed.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-muted-foreground">
            Connect your X account in 30 seconds. No credit card required to start.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Button size="lg" onClick={handleConnect} disabled={isConnecting} className="gap-2">
              <Twitter className="size-4" />
              {isConnecting ? "Connecting…" : "Connect X — it's free"}
            </Button>
            <Link href="/overview">
              <Button size="lg" variant="outline">
                View dashboard
              </Button>
            </Link>
          </div>
          {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <TrendingUp className="size-3.5" />
            </div>
            <span className="font-medium text-foreground">SuperGrow</span>
            <span className="ml-2">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6">
            <Link href="#features" className="hover:text-foreground">Features</Link>
            <Link href="#pricing" className="hover:text-foreground">Pricing</Link>
            <Link href="/onboarding" className="hover:text-foreground">Get started</Link>
          </div>
          <p className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-600" />
            You approve every publish
          </p>
        </div>
      </footer>
    </main>
  );
}
