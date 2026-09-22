"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import Link from "next/link";
import FullLogo from "@/app/(dashboard-layout)/layout/shared/logo/full-logo";
import { Button } from "@/components/ui/button";
import { startXConnect } from "@/lib/connect-x";

const BoxedLogin = () => {
  const [error, setError] = useState("");

  const handleConnect = async () => {
    setError("");
    try {
      await startXConnect();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start X connect");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-accent px-4">
      <Card className="w-full max-w-md border-none p-6 shadow-lg">
        <div className="mx-auto w-fit">
          <FullLogo />
        </div>
        <div className="space-y-3 text-center">
          <h1 className="text-xl font-semibold">Sign in with X</h1>
          <p className="text-sm text-muted-foreground">Connect the account you want x-agent to analyze. Nothing is posted without your approval.</p>
        </div>
        <Button size="lg" className="mt-6 w-full rounded-lg" onClick={handleConnect}>
          Connect X
        </Button>
        {error ? <p className="mt-3 text-center text-sm text-destructive">{error}</p> : null}
        <p className="mt-4 text-center text-sm text-muted-foreground">
          New here? <Link href="/onboarding" className="font-medium text-primary">Start onboarding</Link>
        </p>
      </Card>
    </div>
  );
};

export default BoxedLogin;
