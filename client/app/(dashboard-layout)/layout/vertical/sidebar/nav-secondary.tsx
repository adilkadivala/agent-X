"use client";

import Link from "next/link";
import { useSession } from "@/lib/use-session";

export function NavSecondary() {
  const { session } = useSession();

  return (
    <div className="-mx-4 border-t border-border px-5 py-5">
      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">{session.username ? `@${session.username}` : "Not connected"}</p>
        <p className="text-xs text-muted-foreground">{session.plan ? `${session.plan} plan` : "Connect X to start analysis."}</p>
        <Link
          href={session.username ? "/settings" : "/onboarding"}
          className="flex h-9 w-full items-center justify-center rounded-lg bg-foreground text-sm font-medium text-background hover:bg-foreground/90"
        >
          {session.username ? "Manage account" : "Connect X"}
        </Link>
      </div>
    </div>
  );
}
