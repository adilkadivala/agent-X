import Link from "next/link";
import { ArrowUpRight, CheckCircle2, ChevronRight, CircleAlert, Eye, MessageCircle, Quote, TrendingUp } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action }: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-xl border border-border bg-card p-5 shadow-sm ${className}`}>{children}</section>;
}

export function Stat({ label, value, delta, tone = "default" }: { label: string; value: string; delta?: string; tone?: "default" | "good" | "warn" }) {
  return (
    <Panel>
      <p className="text-sm text-muted-foreground">{label}</p>
      <div className="mt-3 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold">{value}</p>
        {delta && <span className={`text-xs font-medium ${tone === "good" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-muted-foreground"}`}>{delta}</span>}
      </div>
    </Panel>
  );
}

export function SignalCard({ handle, text, score, reason, href = "/analyze" }: { handle: string; text: string; score: number; reason: string; href?: string }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-sm font-medium">@{handle}</p><p className="mt-1 text-sm text-muted-foreground">{text}</p></div>
        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-700">{score} signal</span>
      </div>
      <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>{reason}</span><Link className="font-medium text-foreground hover:underline" href={href}>Review <ArrowUpRight className="ml-1 inline size-3" /></Link>
      </div>
    </div>
  );
}

export function EmptyState({ title, description, href, label }: { title: string; description: string; href?: string; label?: string }) {
  return <Panel className="flex min-h-56 flex-col items-center justify-center text-center"><CircleAlert className="size-8 text-muted-foreground" /><h2 className="mt-4 font-semibold">{title}</h2><p className="mt-2 max-w-md text-sm text-muted-foreground">{description}</p>{href && <Link className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href={href}>{label ?? "Get started"}</Link>}</Panel>;
}

export const iconMap = { eye: Eye, message: MessageCircle, quote: Quote, trend: TrendingUp, check: CheckCircle2, next: ChevronRight };
