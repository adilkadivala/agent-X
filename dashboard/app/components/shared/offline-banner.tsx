"use client";

import { useOffline } from "next/offline";

/**
 * Next.js 16.3 network resilience: reports offline state while soft navigations
 * and fetches stay pending and retry on reconnect (`experimental.useOffline`).
 */
export function OfflineBanner() {
  const isOffline = useOffline();

  if (!isOffline) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-amber-500/95 px-4 py-2 text-center text-sm font-medium text-amber-950 shadow-lg"
    >
      You&apos;re offline. Retrying when you reconnect.
    </div>
  );
}
