"use client";

/**
 * Base URL of the Express gateway.
 * The client calls this directly — CORS is enabled on the server for DASHBOARD_ORIGIN.
 */
export const GATEWAY_URL =
  process.env["NEXT_PUBLIC_GATEWAY_URL"] ?? "http://localhost:4000";

/**
 * Fetch wrapper that always sends credentials (session cookie) and hits the gateway directly.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
}
