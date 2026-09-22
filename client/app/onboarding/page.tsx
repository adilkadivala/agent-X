"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, LockKeyhole } from "lucide-react";
import { Panel } from "../(dashboard-layout)/product-ui";
import { startXConnect } from "@/lib/connect-x";

function OnboardingContent() {
  const searchParams = useSearchParams();
  const [error, setError] = useState(searchParams.get("error") ?? "");

  const connectX = async () => {
    setError("");
    try {
      await startXConnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start X connect");
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-12">
      <div className="w-full space-y-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Welcome to X-agent</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Turn your X presence into a system.</h1>
          <p className="mt-3 max-w-xl text-muted-foreground">Connect your account first. Then we’ll tailor signals, analysis, and publishing recommendations to your voice and audience.</p>
        </div>
        <Panel>
          <div className="flex items-start gap-4">
            <div className="rounded-full bg-primary/10 p-3"><LockKeyhole className="size-5 text-primary" /></div>
            <div>
              <h2 className="font-semibold">1. Connect X <span className="text-xs font-normal text-primary">Required</span></h2>
              <p className="mt-1 text-sm text-muted-foreground">Authorize this app with X. We never ask for your password and never publish without approval.</p>
              <button onClick={connectX} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Connect X securely</button>
              {error ? <p className="mt-3 text-sm text-destructive">{error}</p> : null}
            </div>
          </div>
        </Panel>
        <Panel>
          <h2 className="font-semibold">2. Personalize your signal feed <span className="text-xs font-normal text-muted-foreground">Optional</span></h2>
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            {["Followed creators to watch", "Topics you care about", "Infer topics from your profile and engagement"].map((item) => (
              <p key={item} className="flex items-center gap-2"><Check className="size-4 text-emerald-600" />{item}</p>
            ))}
          </div>
          <Link href="/overview" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary">Skip for now <ArrowRight className="size-4" /></Link>
        </Panel>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-3xl items-center px-6">Loading…</main>}>
      <OnboardingContent />
    </Suspense>
  );
}
