import { createHash, createHmac, randomBytes } from "node:crypto";
import OAuth from "oauth-1.0a";
import { env } from "../config/env.js";

// ─── In-memory pending OAuth sessions (single-process; replace with Redis for multi-instance) ───

type PendingOauth1 = { kind: "oauth1"; token: string; tokenSecret: string };
type PendingOauth2 = { kind: "oauth2"; state: string; verifier: string };

const pending = new Map<string, PendingOauth1 | PendingOauth2>();

// ─── OAuth 1.0a helpers ───────────────────────────────────────────────────────

function oauth1Client(): OAuth {
  return new OAuth({
    consumer: { key: env.apiKey, secret: env.apiSecret },
    signature_method: "HMAC-SHA1",
    hash_function(baseString, key) {
      return createHmac("sha1", key).update(baseString).digest("base64");
    },
  });
}

async function signedRequest(
  url: string,
  method: "GET" | "POST",
  token?: { key: string; secret: string },
  body?: URLSearchParams
): Promise<string> {
  const client = oauth1Client();
  const requestData: { url: string; method: string; data?: Record<string, string> } = { url, method };
  if (body) requestData.data = Object.fromEntries(body);
  const headers = client.toHeader(client.authorize(requestData, token));
  const response = await fetch(url, {
    method,
    headers: {
      ...headers,
      ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: body?.toString(),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`X API ${method} ${url} failed (${response.status}): ${text.slice(0, 400)}`);
  }
  return text;
}

// ─── OAuth 1.0a flow ─────────────────────────────────────────────────────────

export async function startOauth1(callbackUrl: string): Promise<{ authorizeUrl: string }> {
  const body = new URLSearchParams({ oauth_callback: callbackUrl });
  const text = await signedRequest("https://api.twitter.com/oauth/request_token", "POST", undefined, body);
  const params = new URLSearchParams(text);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  const confirmed = params.get("oauth_callback_confirmed");
  if (!token || !tokenSecret || confirmed !== "true") {
    throw new Error("X did not confirm the OAuth callback. Add the callback URL in the X developer portal.");
  }
  pending.set(token, { kind: "oauth1", token, tokenSecret });
  return { authorizeUrl: `https://api.twitter.com/oauth/authorize?oauth_token=${encodeURIComponent(token)}` };
}

export async function finishOauth1(
  oauthToken: string,
  oauthVerifier: string
): Promise<XProfile & { token: string; tokenSecret: string }> {
  const stored = pending.get(oauthToken);
  pending.delete(oauthToken);
  if (!stored || stored.kind !== "oauth1") {
    throw new Error("OAuth session expired. Start connect again.");
  }
  const body = new URLSearchParams({ oauth_verifier: oauthVerifier });
  const text = await signedRequest(
    "https://api.twitter.com/oauth/access_token",
    "POST",
    { key: stored.token, secret: stored.tokenSecret },
    body
  );
  const params = new URLSearchParams(text);
  const token = params.get("oauth_token");
  const tokenSecret = params.get("oauth_token_secret");
  const userId = params.get("user_id");
  const screenName = params.get("screen_name");
  if (!token || !tokenSecret) throw new Error("X did not return user access tokens.");
  const profile = await fetchXUser(token, tokenSecret);
  return {
    token,
    tokenSecret,
    platformUserId: profile.platformUserId ?? userId ?? "",
    handle: profile.handle ?? screenName ?? "",
    name: profile.name ?? screenName ?? "",
    profileImageUrl: profile.profileImageUrl,
  };
}

// ─── OAuth 2.0 PKCE flow ─────────────────────────────────────────────────────

export function startOauth2(callbackUrl: string): { authorizeUrl: string } {
  if (!env.clientId) throw new Error("Missing X_CLIENT_ID in .env");
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  pending.set(state, { kind: "oauth2", state, verifier });
  const url = new URL("https://x.com/i/oauth2/authorize");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("redirect_uri", callbackUrl);
  url.searchParams.set("scope", "tweet.read tweet.write users.read offline.access");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return { authorizeUrl: url.toString().replace(/\+/g, "%20") };
}

export async function finishOauth2(
  code: string,
  state: string,
  callbackUrl: string
): Promise<XProfile & { token: string; tokenSecret: string }> {
  const stored = pending.get(state);
  pending.delete(state);
  if (!stored || stored.kind !== "oauth2") throw new Error("OAuth session expired. Start connect again.");
  if (!env.clientId || !env.clientSecret) throw new Error("Missing X_CLIENT_ID or X_CLIENT_SECRET in .env");
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const response = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      client_id: env.clientId,
      redirect_uri: callbackUrl,
      code_verifier: stored.verifier,
    }),
  });
  const payload = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "OAuth 2 token exchange failed");
  }
  const me = await fetch("https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username", {
    headers: { Authorization: `Bearer ${payload.access_token}` },
  });
  const body = (await me.json()) as {
    data?: { id: string; name: string; username: string; profile_image_url?: string };
    title?: string;
    detail?: string;
  };
  if (!me.ok || !body.data) throw new Error(body.detail || body.title || "Could not load connected X user");
  return {
    token: payload.access_token,
    tokenSecret: payload.refresh_token ?? "",
    platformUserId: body.data.id,
    handle: body.data.username,
    name: body.data.name,
    profileImageUrl: body.data.profile_image_url,
  };
}

// ─── Fetch X user profile ─────────────────────────────────────────────────────

export interface XProfile {
  platformUserId: string;
  handle: string;
  name: string;
  profileImageUrl?: string;
}

export async function fetchXUser(token: string, tokenSecret: string): Promise<XProfile> {
  const text = await signedRequest(
    "https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,username",
    "GET",
    { key: token, secret: tokenSecret }
  );
  const body = JSON.parse(text) as {
    data?: { id: string; name: string; username: string; profile_image_url?: string };
    title?: string;
    detail?: string;
  };
  if (!body.data) throw new Error(body.detail || body.title || "Could not load X user");
  return {
    platformUserId: body.data.id,
    handle: body.data.username,
    name: body.data.name,
    profileImageUrl: body.data.profile_image_url,
  };
}
