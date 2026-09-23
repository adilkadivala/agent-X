import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const values: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function pick(file: Record<string, string>, names: string[], fallback = ""): string {
  for (const name of names) {
    const fromFile = file[name]?.trim();
    if (fromFile) return fromFile;
    const fromProcess = process.env[name]?.trim();
    if (fromProcess) return fromProcess;
  }
  return fallback;
}

const file = parseEnvFile(resolve(process.cwd(), ".env"));

export const env = {
  port: Number(pick(file, ["PORT"], "4000")),
  nodeEnv: pick(file, ["NODE_ENV"], "development"),

  // Dashboard
  dashboardOrigin: pick(file, ["DASHBOARD_ORIGIN"], "http://localhost:3000").replace(/\/$/, ""),

  // X OAuth
  callbackUrl: pick(file, ["X_OAUTH_CALLBACK_URL"], "http://localhost:4000/auth/x/callback"),
  apiKey: pick(file, ["X_API_KEY", "Consumer_Key"]),
  apiSecret: pick(file, ["X_API_SECRET", "Secret_Key"]),
  bearerToken: pick(file, ["X_BEARER_TOKEN", "Bearer_Token"]),
  accessToken: pick(file, ["X_ACCESS_TOKEN", "Access_Token"]),
  accessTokenSecret: pick(file, ["X_ACCESS_TOKEN_SECRET", "Access_Token_Secret"]),
  clientId: pick(file, ["X_CLIENT_ID", "Client_ID"]),
  clientSecret: pick(file, ["X_CLIENT_SECRET", "Client_Secret"]),

  // Session
  sessionSecret: pick(file, ["SESSION_SECRET"], "dev-session-secret-change-me-in-prod"),

  // Encryption (32-byte hex key for AES-256-GCM token storage)
  encryptionKey: pick(file, ["ENCRYPTION_KEY"], "0".repeat(64)),

  // Database
  databaseUrl: pick(file, ["DATABASE_URL"], "postgresql://supergrow:supergrow@localhost:5433/supergrow"),

  // Stripe
  stripeSecretKey: pick(file, ["STRIPE_SECRET_KEY"]),
  stripeWebhookSecret: pick(file, ["STRIPE_TEST_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET"]),
  stripeApiVersion: pick(file, ["ATRIPE_API_VERSION"], "2025-02-24.acacia"),

  // Agents API (Python internal service)
  agentsApiUrl: pick(file, ["AGENTS_API_URL"], "http://127.0.0.1:8000").replace(/\/$/, ""),
  serviceToken: pick(file, ["SERVICE_TOKEN"], "supergrow-internal-token-change-in-prod"),
};

export function assertAuthConfig(): void {
  if (env.clientId && env.clientSecret) return;
  if (env.apiKey && env.apiSecret) return;
  throw new Error(
    "Missing X credentials. Set X_CLIENT_ID + X_CLIENT_SECRET for OAuth 2.0, or X_API_KEY + X_API_SECRET for OAuth 1.0a."
  );
}

export function oauthMode(): "oauth1" | "oauth2" {
  return env.clientId ? "oauth2" : "oauth1";
}
