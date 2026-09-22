"use client";

import { GATEWAY_URL, apiFetch } from "./gateway.js";

export async function startXConnect(): Promise<void> {
  const response = await apiFetch("/auth/x/connect", { method: "POST" });
  const result = (await response.json()) as {
    authorizeUrl?: string;
    redirectTo?: string;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(result.error || "Could not start X connect");
  }
  if (result.authorizeUrl) {
    window.location.href = result.authorizeUrl;
    return;
  }
  if (result.redirectTo) {
    window.location.href = result.redirectTo;
    return;
  }
  throw new Error(result.error || "Could not start X connect");
}
