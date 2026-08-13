/**
 * Multi-provider LLM client.
 *
 * Set LLM_PROVIDER + LLM_API_KEY + LLM_MODEL in .env.
 * Optional LLM_BASE_URL overrides the provider default.
 *
 * Providers:
 *   openai      → https://api.openai.com/v1
 *   openrouter  → https://openrouter.ai/api/v1
 *   grok        → https://api.x.ai/v1  (xAI)
 *   anthropic   → https://api.anthropic.com/v1  (Claude Messages API)
 *   ollama      → http://127.0.0.1:11434/v1
 *   custom      → requires LLM_BASE_URL (OpenAI-compatible)
 */
export type LlmClient = {
  complete: (system: string, user: string) => Promise<string>;
};

export type LlmProvider =
  | "openai"
  | "openrouter"
  | "grok"
  | "anthropic"
  | "ollama"
  | "custom";

export type LlmOpts = {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  /** Override provider default base URL */
  baseUrl?: string;
  timeoutMs?: number;
  temperature?: number;
};

const PROVIDER_DEFAULTS: Record<
  LlmProvider,
  { baseUrl: string; style: "openai" | "anthropic" }
> = {
  openai: { baseUrl: "https://api.openai.com/v1", style: "openai" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", style: "openai" },
  grok: { baseUrl: "https://api.x.ai/v1", style: "openai" },
  anthropic: { baseUrl: "https://api.anthropic.com/v1", style: "anthropic" },
  ollama: { baseUrl: "http://127.0.0.1:11434/v1", style: "openai" },
  custom: { baseUrl: "", style: "openai" },
};

export function resolveLlmProvider(raw: string | undefined): LlmProvider {
  const v = (raw || "openai").trim().toLowerCase();
  const aliases: Record<string, LlmProvider> = {
    openai: "openai",
    chatgpt: "openai",
    gpt: "openai",
    openrouter: "openrouter",
    or: "openrouter",
    grok: "grok",
    xai: "grok",
    "x.ai": "grok",
    anthropic: "anthropic",
    claude: "anthropic",
    ollama: "ollama",
    local: "ollama",
    custom: "custom",
  };
  return aliases[v] || "custom";
}

function normalizeBase(url: string): string {
  return url.replace(/\/$/, "");
}

function providerHint(provider: LlmProvider, base: string): string {
  if (provider === "ollama") {
    return `Is Ollama running? Try: curl ${base}/models`;
  }
  if (provider === "openrouter") {
    return "Check OPENROUTER key + model id (e.g. anthropic/claude-sonnet-4)";
  }
  if (provider === "grok") {
    return "Check xAI API key at console.x.ai";
  }
  if (provider === "anthropic") {
    return "Check Anthropic API key + model (e.g. claude-sonnet-4-20250514)";
  }
  return `Check LLM_API_KEY / LLM_BASE_URL for ${provider}`;
}

async function completeOpenAiCompatible(
  opts: LlmOpts & { base: string }
): Promise<(system: string, user: string) => Promise<string>> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const temperature = opts.temperature ?? 0.85;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${opts.apiKey}`,
    "Content-Type": "application/json",
  };
  // OpenRouter optional ranking headers
  if (opts.provider === "openrouter") {
    headers["HTTP-Referer"] = "https://github.com/x-agent";
    headers["X-Title"] = "x-agent";
  }

  return async (system, user) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(`${opts.base}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            model: opts.model,
            temperature,
            messages: [
              { role: "system", content: system },
              { role: "user", content: user },
            ],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        const msg = (err as Error).message || String(err);
        throw new Error(
          `LLM unreachable at ${opts.base} (${msg}). ${providerHint(opts.provider, opts.base)}`
        );
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `LLM HTTP ${res.status} [${opts.provider}/${opts.model}]: ${body.slice(0, 280)}`
        );
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null } }>;
      };
      const content = json.choices?.[0]?.message?.content;
      if (!content) throw new Error("LLM empty content");
      return content;
    } finally {
      clearTimeout(timer);
    }
  };
}

async function completeAnthropic(
  opts: LlmOpts & { base: string }
): Promise<(system: string, user: string) => Promise<string>> {
  const timeoutMs = opts.timeoutMs ?? 90_000;
  const temperature = opts.temperature ?? 0.85;

  return async (system, user) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      let res: Response;
      try {
        res = await fetch(`${opts.base}/messages`, {
          method: "POST",
          headers: {
            "x-api-key": opts.apiKey,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: opts.model,
            max_tokens: 4096,
            temperature,
            system,
            messages: [{ role: "user", content: user }],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        const msg = (err as Error).message || String(err);
        throw new Error(
          `LLM unreachable at ${opts.base} (${msg}). ${providerHint(opts.provider, opts.base)}`
        );
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(
          `LLM HTTP ${res.status} [${opts.provider}/${opts.model}]: ${body.slice(0, 280)}`
        );
      }
      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const text = (json.content || [])
        .filter((b) => b.type === "text" && b.text)
        .map((b) => b.text!)
        .join("\n")
        .trim();
      if (!text) throw new Error("LLM empty content (anthropic)");
      return text;
    } finally {
      clearTimeout(timer);
    }
  };
}

/** Build a provider-aware LLM client. */
export function createLlmClient(opts: LlmOpts): LlmClient {
  const defaults = PROVIDER_DEFAULTS[opts.provider];
  const base = normalizeBase(opts.baseUrl || defaults.baseUrl);
  if (!base) {
    throw new Error(
      `LLM_BASE_URL is required for provider=${opts.provider} (or pick openai/openrouter/grok/anthropic/ollama)`
    );
  }
  if (!opts.apiKey?.trim()) {
    throw new Error(`LLM_API_KEY is required for provider=${opts.provider}`);
  }
  if (!opts.model?.trim()) {
    throw new Error("LLM_MODEL is required");
  }

  const style = defaults.style;
  let completeFn: ((system: string, user: string) => Promise<string>) | null =
    null;

  return {
    async complete(system, user) {
      if (!completeFn) {
        completeFn =
          style === "anthropic"
            ? await completeAnthropic({ ...opts, base })
            : await completeOpenAiCompatible({ ...opts, base });
      }
      return completeFn(system, user);
    },
  };
}

/** Convenience from AppConfig-shaped fields. */
export function createLlmFromConfig(cfg: {
  LLM_PROVIDER?: string;
  LLM_API_KEY: string;
  LLM_BASE_URL?: string;
  LLM_MODEL: string;
  timeoutMs?: number;
}): LlmClient {
  const provider = resolveLlmProvider(cfg.LLM_PROVIDER);
  return createLlmClient({
    provider,
    apiKey: cfg.LLM_API_KEY,
    model: cfg.LLM_MODEL,
    baseUrl: cfg.LLM_BASE_URL || undefined,
    timeoutMs: cfg.timeoutMs,
  });
}

/** @deprecated Prefer createLlmClient / createLlmFromConfig */
export function createOpenAiClient(opts: {
  apiKey: string;
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
}): LlmClient {
  // Infer provider from base URL when possible
  const base = (opts.baseUrl || "").toLowerCase();
  let provider: LlmProvider = "openai";
  if (!opts.baseUrl) provider = "openai";
  else if (base.includes("openrouter")) provider = "openrouter";
  else if (base.includes("x.ai")) provider = "grok";
  else if (base.includes("anthropic")) provider = "anthropic";
  else if (base.includes("11434") || base.includes("ollama")) provider = "ollama";
  else provider = "custom";

  return createLlmClient({
    provider,
    apiKey: opts.apiKey,
    model: opts.model,
    baseUrl: opts.baseUrl,
    timeoutMs: opts.timeoutMs,
  });
}
