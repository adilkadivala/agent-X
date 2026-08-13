import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { openDb } from "../src/db.js";
import { runOnce, type WorkerDeps } from "../src/worker.js";
import type { AppConfig } from "../src/config.js";
import type { LlmClient } from "../src/draft.js";
import type { PublishResult } from "../src/types.js";

function baseCfg(dir: string): AppConfig {
  return {
    TZ: "UTC",
    DATABASE_PATH: path.join(dir, "agent.db"),
    DRY_RUN: true,
    PAUSED: false,
    DAILY_MAX: 2,
    HEADLESS: true,
    BROWSER_PROFILE_DIR: path.join(dir, "browser"),
    LLM_API_KEY: "test-key",
    LLM_BASE_URL: "",
    LLM_MODEL: "test",
    LLM_PROVIDER: "openai",
    RSS_FEED_URL: "",
    MY_HANDLE: "",
    VOICE_SAMPLES_PATH: path.join(dir, "voice.md"),
    INBOX_DIR: path.join(dir, "inbox"),
    LOCK_PATH: path.join(dir, "worker.lock"),
    WEBHOOK_URL: "",
    BANNED_PHRASES: "",
    VOICE_THRESHOLD: 0.5,
    POST_WINDOWS: "0-24",
    WINDOW_JITTER: 1,
    MIN_POST_GAP_MINUTES: 0,
    FORCE_RUN: true,
    INCLUDE_SOURCE_LINK: true,
    MAX_HASHTAGS: 2,
    ATTACH_IMAGES: false,
    MEDIA_CACHE_DIR: path.join(dir, "media"),
    SCREENSHOTS_DIR: path.join(dir, "shots"),
    MEMES_DIR: path.join(dir, "memes"),
    MODE_WEIGHTS:
      "ship_note=100,tech_news=0,hot_take=0,meme=0,screenshot=0,question=0",
    GOOGLE_NEWS_QUERIES: "",
    GOOGLE_NEWS_WHEN: "1d",
    MAX_SOURCE_AGE_HOURS: 48,
    PREFER_NEWS: true,
    RSS_FEED_URLS: "",
    AGENT_MODE: "post",
    WATCH_HANDLES: "",
    WATCH_TWEETS_PER_PROFILE: 4,
    MAX_TARGET_AGE_MINUTES: 180,
    DAILY_ENGAGE_MAX: 25,
    MIN_ENGAGE_GAP_MINUTES: 0,
    ENGAGE_PER_CYCLE: 6,
    ENGAGE_SKIP_RETWEETS: true,
    ENGAGE_SKIP_REPLIES: true,
    ENGAGE_ALSO_LIKE: false,
    ENGAGE_PREFER: "auto",
    ENGAGE_SOURCES: "following,notifications,timeline",
    ENGAGE_SEARCH_QUERIES: "",
    ENGAGE_TOPIC_LLM: false,
    OBSERVE_INTERVAL_SECONDS: 180,
    OBSERVE_SLEEP_MIN_SECONDS: 60,
    OBSERVE_SLEEP_MAX_SECONDS: 360,
    PDF_POST_ENABLED: false,
    PDF_DIRS: "",
    PDF_DAILY_MAX: 6,
    PDF_MIN_GAP_MINUTES: 90,
    PDF_WORD_MIN: 200,
    PDF_WORD_MAX: 250,
    PDF_COMMUNITY_ID: "1493446837214187523",
    PDF_COMMUNITY_NAME: "Build in Public",
    OCR_MODE: false,
    OCR_IGNORE_WINDOWS: true,
    OCR_DAILY_MAX: 50,
    OCR_REQUIRE_ELIGIBILITY: false,
    X_PREMIUM: false,
    MIN_FOLLOWERS: 500,
    MIN_QUALIFIED_IMPRESSIONS: 500_000,
    FOLLOWERS_COUNT: 0,
    OCR_TRACK_IMPRESSIONS: false,
    OCR_SKIP_ENGAGE: true,
    OCR_PDF_TO_TIMELINE: true,
    MIN_VIEWS: 0,
    MIN_VIEWS_IF_UNKNOWN: "allow",
    bannedPhrases: [],
    googleNewsQueries: [],
    extraRssUrls: [],
    pdfDirs: [],
    watchHandles: [],
    myHandle: "",
    engageSources: ["following", "notifications", "timeline"],
    searchQueries: [],
    modeWeights: {
      tech_news: 0,
      hot_take: 0,
      meme: 0,
      screenshot: 0,
      ship_note: 100,
      question: 0,
      pdf_deep: 0,
    },
    postWindows: [{ start: 0, end: 24 }],
    rootDir: dir,
  };
}

describe("runOnce", () => {
  let dir: string;
  let publishCalls: string[];

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "xagent-w-"));
    fs.mkdirSync(path.join(dir, "inbox"));
    fs.writeFileSync(
      path.join(dir, "voice.md"),
      "I ship small tools and skip the hype.\n"
    );
    publishCalls = [];
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  function deps(over: Partial<WorkerDeps> = {}): WorkerDeps {
    const cfg = baseCfg(dir);
    const db = openDb(cfg.DATABASE_PATH);
    const llm: LlmClient = {
      complete: async () =>
        JSON.stringify({
          text: "Shipped a dry-run path for the agent — small tools, no hype.",
          tags: ["BuildInPublic"],
          claims: ["dry-run path"],
          score: 0.9,
          reasons: ["matches samples"],
        }),
    };
    const publish = async (text: string): Promise<PublishResult> => {
      publishCalls.push(text);
      return { ok: true, tweetId: "1" };
    };
    return { cfg, db, llm, publish, random: () => 0, now: () => new Date(), ...over };
  }

  it("falls back to hot_take when no news/inbox", async () => {
    const d = deps();
    // force hot_take path when ship_note has no inbox
    d.cfg.modeWeights = {
      tech_news: 0,
      hot_take: 100,
      meme: 0,
      screenshot: 0,
      ship_note: 0,
      question: 0,
      pdf_deep: 0,
    };
    const result = await runOnce(d);
    expect(result).toBe("dry_run");
    expect(publishCalls).toHaveLength(0);
    d.db.close();
  });

  it("dry_run does not call publisher", async () => {
    fs.writeFileSync(
      path.join(dir, "inbox", "note.txt"),
      "Shipped dry-run path for x-agent today\n"
    );
    const d = deps();
    const result = await runOnce(d);
    expect(result).toBe("dry_run");
    expect(publishCalls).toHaveLength(0);
    d.db.close();
  });

  it("paused exits without publishing", async () => {
    fs.writeFileSync(path.join(dir, "inbox", "note.txt"), "hello world note\n");
    const d = deps();
    d.cfg.PAUSED = true;
    const result = await runOnce(d);
    expect(result).toBe("paused");
    expect(publishCalls).toHaveLength(0);
    d.db.close();
  });

  it("live path calls publisher once", async () => {
    fs.writeFileSync(
      path.join(dir, "inbox", "note.txt"),
      "Shipped dry-run path for x-agent today\n"
    );
    const d = deps();
    d.cfg.DRY_RUN = false;
    d.llm = {
      complete: async () =>
        JSON.stringify({
          text: "Shipped dry-run path for x-agent today — small tools, no hype.",
          tags: [],
          claims: ["Shipped dry-run path for x-agent today"],
          score: 0.95,
          reasons: ["ok"],
        }),
    };
    const result = await runOnce(d);
    expect(result).toBe("posted");
    expect(publishCalls).toHaveLength(1);
    d.db.close();
  });

  it("quality_fail does not publish", async () => {
    fs.writeFileSync(path.join(dir, "inbox", "note.txt"), "something\n");
    const d = deps();
    d.llm = {
      complete: async () =>
        JSON.stringify({
          text: "x".repeat(300),
          claims: [],
          score: 0.9,
          reasons: [],
        }),
    };
    const result = await runOnce(d);
    expect(result).toBe("quality_fail");
    expect(publishCalls).toHaveLength(0);
    d.db.close();
  });
});
