"use client";

import { useEffect, useState } from "react";
import { GATEWAY_URL } from "./gateway";

export type SessionMe = {
  signedIn: boolean;
  connected?: boolean;
  id?: string;
  email?: string;
  username?: string;
  name?: string;
  profileImageUrl?: string;
  plan?: string;
  planName?: string;
  connectedAccounts?: Array<{ id: string; platform: string; handle: string }>;
};

export function useSession() {
  const [session, setSession] = useState<SessionMe>({ signedIn: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(`${GATEWAY_URL}/session/me`, { credentials: "include" })
      .then((r) => r.json())
      .then((data: SessionMe & { handle?: string }) => {
        if (!cancelled) {
          // Gateway returns `handle` for X accounts — map to username for UI compatibility
          setSession({ ...data, username: data.handle ?? data.username });
        }
      })
      .catch(() => {
        if (!cancelled) setSession({ signedIn: false });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { session, loading };
}
