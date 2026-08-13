import { config as loadDotenv } from "dotenv";
import { z } from "zod";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { parseModeWeights } from "./persona.js";
import { parseWatchHandles } from "./engage/watch.js";
import {
  parseEngageSources,
  parseSearchQueries,
} from "./engage/discover.js";

loadDotenv();

const boolFromEnv = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === "boolean") return v;
    return ["1", "true", "yes", "on"].includes(v.toLowerCase());
  });

const ConfigSchema = z.object({
  TZ: z.string().min(1, "TZ is required (e.g. Asia/Kolkata)"),
  DATABASE_PATH: z.string().default("./data/agent.db"),
  DRY_RUN: boolFromEnv.default(true),
  PAUSED: boolFromEnv.default(false),
  // Soft profile safety: high caps are allowed but X risk grows with volume.
  DAILY_MAX: z.coerce.number().int().min(1).max(100).default(20),
  HEADLESS: boolFromEnv.default(false),
  BROWSER_PROFILE_DIR: z.string().default("./data/browser-profile"),
  /**
   * LLM provider: openai | openrouter | grok | anthropic | ollama | custom
   * Aliases: chatgpt→openai, claude→anthropic, xai→grok
   */
  LLM_PROVIDER: z.string().optional().default("ollama"),
  LLM_API_KEY: z.string().min(1, "LLM_API_KEY is required"),
  /** Optional — overrides provider default base URL */
  LLM_BASE_URL: z.string().optional().default(""),
  LLM_MODEL: z.string().default("gpt-4o-mini"),
  RSS_FEED_URL: z.string().url().optional().or(z.literal("")).default(""),
  /** Extra comma-separated RSS URLs (optional) */
  RSS_FEED_URLS: z.string().optional().default(""),
  /** Comma-separated Google News queries (primary freshness source) */
  GOOGLE_NEWS_QUERIES: z
    .string()
    .optional()
    .default(
      'OpenAI OR Anthropic OR "AI agent" OR LLM,AI pricing OR "model release" OR GPT OR Claude,Google DeepMind OR "Meta AI" OR Mistral'
    ),
  /** Google News when: window — 1d keeps it fresh */
  GOOGLE_NEWS_WHEN: z.string().default("1d"),
  /** Drop news older than this many hours (0 = disable) */
  MAX_SOURCE_AGE_HOURS: z.coerce.number().int().min(0).max(168).default(48),
  /** Prefer Google/RSS news over inbox notes */
  PREFER_NEWS: boolFromEnv.default(true),
  VOICE_SAMPLES_PATH: z.string().default("./voice-samples.md"),
  INBOX_DIR: z.string().default("./inbox"),
  LOCK_PATH: z.string().default("./data/worker.lock"),
  WEBHOOK_URL: z.string().optional().default(""),
  BANNED_PHRASES: z.string().optional().default(""),
  VOICE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
  POST_WINDOWS: z.string().default("9-11,14-16,19-21"),
  WINDOW_JITTER: z.coerce.number().min(0).max(1).default(0.4),
  /** Minimum minutes between successful live posts (spreads volume) */
  MIN_POST_GAP_MINUTES: z.coerce.number().int().min(0).max(720).default(30),
  /** Skip window/jitter checks (for tests and forced runs) */
  FORCE_RUN: boolFromEnv.default(false),
  /** Append article URL on news posts */
  INCLUDE_SOURCE_LINK: boolFromEnv.default(true),
  /** Max hashtags appended (1–3 recommended) */
  MAX_HASHTAGS: z.coerce.number().int().min(0).max(3).default(2),
  /** Download og:image / enclosure and attach */
  ATTACH_IMAGES: boolFromEnv.default(true),
  MEDIA_CACHE_DIR: z.string().default("./data/media"),
  /** Local screenshots to caption+post (drop PNGs here) */
  SCREENSHOTS_DIR: z.string().default("./media/screenshots"),
  /** Optional meme templates / reaction images */
  MEMES_DIR: z.string().default("./media/memes"),
  /**
   * Human mix weights, e.g.
   * tech_news=35,hot_take=25,meme=15,screenshot=10,ship_note=10,question=5
   */
  MODE_WEIGHTS: z
    .string()
    .optional()
    .default(
      "tech_news=35,hot_take=25,meme=15,screenshot=10,ship_note=10,question=5"
    ),
  /**
   * engage = only reply/quote watchlist (recommended for growth)
   * post = original posts only (news/takes)
   * both = try engage first, else post
   */
  AGENT_MODE: z.enum(["engage", "post", "both"]).default("engage"),
  /**
   * Legacy VIP handles — unused by `npm run observe`.
   * One-shot worker still supports watchlist if ENGAGE_SOURCES includes it.
   */
  WATCH_HANDLES: z.string().optional().default("elonmusk,samA,karpathy,yleCun,Meta,Google,Anthropic,OpenAI,MistralAI,solana,Polymarket,VitalikButerin,a16zcrypto,X"),
  WATCH_TWEETS_PER_PROFILE: z.coerce.number().int().min(1).max(10).default(4),
  /** Only engage tweets newer than this (minutes). Be early. */
  MAX_TARGET_AGE_MINUTES: z.coerce.number().int().min(0).max(1440).default(15),
  DAILY_ENGAGE_MAX: z.coerce.number().int().min(1).max(200).default(80),
  MIN_ENGAGE_GAP_MINUTES: z.coerce.number().int().min(0).max(360).default(5),
  /**
   * How many Following posts to quote in one observe cycle.
   * When many people post at once, raise this so we entertain them all.
   */
  ENGAGE_PER_CYCLE: z.coerce.number().int().min(1).max(20).default(6),
  ENGAGE_SKIP_RETWEETS: boolFromEnv.default(true),
  ENGAGE_SKIP_REPLIES: boolFromEnv.default(true),
  ENGAGE_ALSO_LIKE: boolFromEnv.default(true),
  /**
   * Your X handle (no @). Never engage/like your own posts.
   * Example: adil_kadival
   */
  MY_HANDLE: z.string().optional().default(""),
  ENGAGE_PREFER: z.enum(["auto", "reply", "quote"]).default("auto"),
  /** Skip posts with fewer impressions than this (0 = disable) */
  MIN_VIEWS: z.coerce.number().int().min(0).max(10_000_000).default(20_000),
  /**
   * If views can't be read from the DOM:
   * skip = don't engage (safe default when MIN_VIEWS > 0)
   * allow = engage anyway
   */
  MIN_VIEWS_IF_UNKNOWN: z.enum(["skip", "allow"]).default("skip"),
  /**
   * Feed sources: timeline (= For you), following, notifications.
   * Observe ends on For you. search / watchlist ignored by `npm run observe`.
   */
  ENGAGE_SOURCES: z
    .string()
    .default("timeline,following,notifications"),
  /**
   * Legacy — unused by observe loop. Kept so old .env files still parse.
   */
  ENGAGE_SEARCH_QUERIES: z.string().optional().default(""),
  /** Extra LLM confirm after keyword topic match (slower, more precise) */
  ENGAGE_TOPIC_LLM: boolFromEnv.default(false),
  /**
   * Random sleep between observe cycles (seconds).
   * Each loop picks a fresh value in [MIN, MAX] so timing looks human, not cron-like.
   * Max hard-capped at 360 (6 minutes).
   */
  OBSERVE_SLEEP_MIN_SECONDS: z.coerce
    .number()
    .int()
    .min(30)
    .max(360)
    .default(60),
  OBSERVE_SLEEP_MAX_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(360)
    .default(360),
  /**
   * Legacy fixed interval — ignored when min/max sleep are set (always preferred).
   * Kept so old .env files still parse.
   */
  OBSERVE_INTERVAL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(180),
  /**
   * Independent PDF deep-posts (200–250 words + page thumbnail).
   * Runs beside observe/engage — own daily budget.
   */
  PDF_POST_ENABLED: boolFromEnv.default(true),
  /** Comma-separated dirs of PDFs (defaults: learn + go through). */
  PDF_DIRS: z
    .string()
    .optional()
    .default(
      "/home/k-adi/school/ai-stuff/learn,/home/k-adi/school/ai-stuff/go through"
    ),
  PDF_DAILY_MAX: z.coerce.number().int().min(0).max(20).default(6),
  /** Minutes between successful PDF deep posts. */
  PDF_MIN_GAP_MINUTES: z.coerce.number().int().min(0).max(720).default(90),
  PDF_WORD_MIN: z.coerce.number().int().min(60).max(400).default(120),
  PDF_WORD_MAX: z.coerce.number().int().min(80).max(500).default(200),
  /**
   * Post PDF deep-posts into this X Community (not the main timeline).
   * Default: Build in Public — https://x.com/i/communities/1493446837214187523
   */
  PDF_COMMUNITY_ID: z.string().optional().default("1493446837214187523"),
  PDF_COMMUNITY_NAME: z.string().optional().default("Build in Public"),

  /**
   * Original Content Rewards (OCR) mode.
   * Relaxes human cadence limits and enables eligibility / impression tracking.
   * Uses Playwright scrapes + config flags (no X API required).
   */
  OCR_MODE: boolFromEnv.default(false),
  /** When OCR_MODE: ignore POST_WINDOWS / WINDOW_JITTER for original posts */
  OCR_IGNORE_WINDOWS: boolFromEnv.default(true),
  /** When OCR_MODE: daily original-post budget (0 = unlimited) */
  OCR_DAILY_MAX: z.coerce.number().int().min(0).max(200).default(50),
  /** Gate original posts if eligibility checks fail */
  OCR_REQUIRE_ELIGIBILITY: boolFromEnv.default(true),
  /** You confirm Premium is active (OCR requires Premium) */
  X_PREMIUM: boolFromEnv.default(false),
  /** Min followers (OCR: ≥500 verified followers; scrape prefers /verified_followers) */
  MIN_FOLLOWERS: z.coerce.number().int().min(0).max(10_000_000).default(500),
  /** Rolling 90d impression target for OCR qualification */
  MIN_QUALIFIED_IMPRESSIONS: z.coerce
    .number()
    .int()
    .min(0)
    .max(100_000_000)
    .default(500_000),
  /** Optional manual override of last-known follower count (0 = use scrape/db) */
  FOLLOWERS_COUNT: z.coerce.number().int().min(0).max(10_000_000).default(0),
  /** After posting, scrape analytics impressions (own posts only) */
  OCR_TRACK_IMPRESSIONS: boolFromEnv.default(true),
  /**
   * When OCR_MODE: skip quote/reply engage.
   * OCR pays on original content + Home Timeline Premium impressions;
   * quote spam / thin commentary is weak or ineligible.
   */
  OCR_SKIP_ENGAGE: boolFromEnv.default(true),
  /**
   * When OCR_MODE: post PDF deep-posts to main timeline (Everyone),
   * not a Community — qualified impressions are Home Timeline only.
   */
  OCR_PDF_TO_TIMELINE: boolFromEnv.default(true),
});

export type AppConfig = z.infer<typeof ConfigSchema> & {
  bannedPhrases: string[];
  postWindows: Array<{ start: number; end: number }>;
  rootDir: string;
  googleNewsQueries: string[];
  extraRssUrls: string[];
  modeWeights: import("./persona.js").ModeWeights;
  watchHandles: string[];
  engageSources: import("./engage/discover.js").EngageSource[];
  searchQueries: string[];
  pdfDirs: string[];
  /** Normalized lowercase handle without @ */
  myHandle: string;
};

function parseWindows(raw: string): Array<{ start: number; end: number }> {
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [a, b] = part.split("-").map((n) => Number(n));
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        throw new Error(`Invalid POST_WINDOWS segment: ${part}`);
      }
      return { start: a, end: b };
    });
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const msg = parsed.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config:\n${msg}`);
  }

  const data = parsed.data;
  const rootDir = process.cwd();
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.join(rootDir, p));

  const bannedPhrases = data.BANNED_PHRASES
    ? data.BANNED_PHRASES.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const googleNewsQueries = data.GOOGLE_NEWS_QUERIES
    ? data.GOOGLE_NEWS_QUERIES.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const extraRssUrls = data.RSS_FEED_URLS
    ? data.RSS_FEED_URLS.split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  const pdfDirs = (data.PDF_DIRS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (path.isAbsolute(p) ? p : path.join(rootDir, p)));

  const myHandle = (data.MY_HANDLE || "")
    .replace(/^@/, "")
    .trim()
    .toLowerCase();

  return {
    ...data,
    DATABASE_PATH: resolve(data.DATABASE_PATH),
    BROWSER_PROFILE_DIR: resolve(data.BROWSER_PROFILE_DIR),
    VOICE_SAMPLES_PATH: resolve(data.VOICE_SAMPLES_PATH),
    INBOX_DIR: resolve(data.INBOX_DIR),
    LOCK_PATH: resolve(data.LOCK_PATH),
    MEDIA_CACHE_DIR: resolve(data.MEDIA_CACHE_DIR),
    SCREENSHOTS_DIR: resolve(data.SCREENSHOTS_DIR),
    MEMES_DIR: resolve(data.MEMES_DIR),
    bannedPhrases,
    googleNewsQueries,
    extraRssUrls,
    pdfDirs,
    myHandle,
    modeWeights: parseModeWeights(data.MODE_WEIGHTS),
    watchHandles: parseWatchHandles(data.WATCH_HANDLES || ""),
    engageSources: parseEngageSources(
      data.ENGAGE_SOURCES || "timeline,following,notifications"
    ),
    searchQueries: parseSearchQueries(data.ENGAGE_SEARCH_QUERIES || ""),
    postWindows: parseWindows(data.POST_WINDOWS),
    rootDir,
  };
}

/** Soft load for CLIs that don't need LLM (login/smoke). */
export function loadBrowserConfig(env: NodeJS.ProcessEnv = process.env): {
  BROWSER_PROFILE_DIR: string;
  HEADLESS: boolean;
  rootDir: string;
} {
  const rootDir = process.cwd();
  const profile =
    env.BROWSER_PROFILE_DIR || "./data/browser-profile";
  const resolve = (p: string) => (path.isAbsolute(p) ? p : path.join(rootDir, p));
  const headless = ["1", "true", "yes", "on"].includes(
    (env.HEADLESS || "false").toLowerCase()
  );
  return {
    BROWSER_PROFILE_DIR: resolve(profile),
    HEADLESS: headless,
    rootDir,
  };
}

export function ensureDataDirs(cfg: AppConfig): void {
  for (const dir of [
    path.dirname(cfg.DATABASE_PATH),
    path.dirname(cfg.LOCK_PATH),
    cfg.INBOX_DIR,
    cfg.BROWSER_PROFILE_DIR,
    cfg.MEDIA_CACHE_DIR,
    cfg.SCREENSHOTS_DIR,
    cfg.MEMES_DIR,
  ]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }
}
