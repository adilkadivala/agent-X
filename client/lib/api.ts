"use client";

import { GATEWAY_URL } from "./gateway";

// ─── Generic fetch helper ─────────────────────────────────────────────────────

async function gw<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init.headers as Record<string, string> | undefined),
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = (body as { error?: string }).error ?? `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SessionUser {
  signedIn: boolean;
  id?: string;
  email?: string;
  name?: string;
  username?: string; // mapped from handle on client
  handle?: string;
  plan?: string;
  planName?: string;
  connectedAccounts?: ConnectedAccount[];
}

export interface ConnectedAccount {
  id: string;
  platform: string;
  handle: string;
  status: string;
  connectedAt: string;
}

export interface PostScore {
  hookScore: number;
  structureScore: number;
  sentimentScore: number;
  shareabilityScore: number;
  aiSlopScore: number;
  overallScore: number;
  computedAt: string;
}

export interface Post {
  id: string;
  platformPostId: string;
  type: string;
  text: string;
  publishedAt: string;
  metrics: Record<string, unknown>;
  score?: PostScore;
}

export interface Report {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  periodStart: string;
  periodEnd: string;
  createdAt: string;
}

export interface ComplianceFlag {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  explanation: string;
  status: "OPEN" | "DISMISSED" | "RESOLVED";
  flaggedAt: string;
  resolvedAt?: string;
  rule: { ruleId: string; category: string; description: string; severity: string; sourceUrl: string };
  post?: { platformPostId: string; text: string; publishedAt: string };
}

export interface Suggestion {
  id: string;
  category: "CONTENT" | "TIMING" | "COMPLIANCE";
  title: string;
  body: string;
  evidence: Record<string, unknown>;
  status: "NEW" | "ACCEPTED" | "DISMISSED";
  createdAt: string;
}

export interface Draft {
  id: string;
  kind: "ORIGINAL" | "REPLY" | "QUOTE";
  body: string;
  guardrailResults: Record<string, unknown>;
  status: "DRAFT" | "SCHEDULED" | "PUBLISHED" | "FAILED";
  scheduledAt?: string;
  approvedAt?: string;
  createdAt: string;
  opportunity?: { sourceHandle: string; sourceText: string } | null;
}

export interface PlanInfo {
  id: string;
  tier: string;
  name: string;
  monthlyPriceCents: number;
  annualPriceCents?: number;
  analysisLimitPerMonth?: number;
  connectedAccountLimit: number;
  seatLimit: number;
}

export interface BillingData {
  plan: PlanInfo | null;
  subscription: {
    status: string;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    cancelAtPeriodEnd: boolean;
  } | null;
  usage: { analysesUsed: number; period: string; resetAt: string } | null;
}

export interface FollowerBreakdown {
  breakdown: { type: string; count: number; percentage: number }[];
  total: number;
  topFollowers: { platformFollowerId: string; handle: string; classifiedType: string; engagementCount: number; lastActiveAt?: string }[];
}

export interface ActiveTimesData {
  dayActivity: { day: string; postCount: number }[];
  bestWindow: string;
  totalPostsAnalyzed: number;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  me: () => gw<SessionUser>("/session/me"),
  logout: () => gw<{ ok: boolean }>("/auth/logout", { method: "POST" }),
};

// ─── Accounts ─────────────────────────────────────────────────────────────────

export const accountsApi = {
  list: () => gw<{ accounts: ConnectedAccount[] }>("/accounts"),
  disconnect: (id: string) => gw<{ ok: boolean }>(`/accounts/${id}`, { method: "DELETE" }),
};

// ─── Posts ────────────────────────────────────────────────────────────────────

export const postsApi = {
  analyze: (url: string, accountId: string) =>
    gw<{ postId: string; url: string; scores: PostScore | null; message: string }>(
      "/posts/analyze",
      { method: "POST", body: JSON.stringify({ url, accountId }) }
    ),
  history: (accountId: string) =>
    gw<{ posts: Post[] }>(`/posts/${accountId}/history`),
};

// ─── Reports ─────────────────────────────────────────────────────────────────

export const reportsApi = {
  latest: (accountId: string) =>
    gw<{ report: Report }>(`/reports/${accountId}/latest`),
  history: (accountId: string, page = 1) =>
    gw<{ reports: Report[]; total: number; page: number }>(`/reports/${accountId}/history?page=${page}`),
  refresh: (accountId: string) =>
    gw<{ report: Report; message: string }>(`/reports/${accountId}/refresh`, { method: "POST" }),
};

// ─── Audience ─────────────────────────────────────────────────────────────────

export const audienceApi = {
  breakdown: (accountId: string) =>
    gw<FollowerBreakdown>(`/audience/${accountId}`),
  activeTimes: (accountId: string) =>
    gw<ActiveTimesData>(`/active-times/${accountId}`),
};

// ─── Compliance ───────────────────────────────────────────────────────────────

export const complianceApi = {
  data: (accountId: string) =>
    gw<{ score: number; flags: ComplianceFlag[]; openFlagCount: number; totalPostsChecked: number }>(
      `/compliance/${accountId}`
    ),
  dismissFlag: (flagId: string) =>
    gw<{ ok: boolean }>(`/compliance/flags/${flagId}/dismiss`, { method: "POST" }),
};

// ─── Suggestions ──────────────────────────────────────────────────────────────

export const suggestionsApi = {
  list: (accountId: string, category?: string) =>
    gw<{ suggestions: Suggestion[] }>(
      `/suggestions/${accountId}${category ? `?category=${category}` : ""}`
    ),
  accept: (id: string) => gw<{ suggestion: Suggestion }>(`/suggestions/${id}/accept`, { method: "POST" }),
  dismiss: (id: string) => gw<{ suggestion: Suggestion }>(`/suggestions/${id}/dismiss`, { method: "POST" }),
};

// ─── Drafts ───────────────────────────────────────────────────────────────────

export const draftsApi = {
  queue: (accountId: string) =>
    gw<{ drafts: Draft[] }>(`/drafts/${accountId}/queue`),
  create: (accountId: string, body: string, kind: "ORIGINAL" | "REPLY" | "QUOTE", scheduledAt?: string) =>
    gw<{ draft: Draft }>(`/drafts/${accountId}`, {
      method: "POST",
      body: JSON.stringify({ body, kind, scheduledAt }),
    }),
  approve: (id: string) =>
    gw<{ draft: Draft }>(`/drafts/${id}/approve`, { method: "POST" }),
  publish: (id: string) =>
    gw<{ draft: Draft }>(`/drafts/${id}/publish`, { method: "POST" }),
};

// ─── Billing ──────────────────────────────────────────────────────────────────

export const billingApi = {
  plan: () => gw<BillingData>("/billing/plan"),
  checkout: (tier: string, interval: "month" | "year") =>
    gw<{ url: string }>("/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ tier, interval }),
    }),
  portal: () =>
    gw<{ url: string }>("/billing/portal", { method: "POST" }),
};
