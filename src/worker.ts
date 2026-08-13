/**
 * Worker pipeline (browser LAST):
 *
 *   flock → config/db → orphan recovery → pause → budget → window/jitter
 *   → sources → pick → draft → quality → DRY_RUN? log : publish → unlock
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig, ensureDataDirs, type AppConfig } from "./config.js";
import {
  openDb,
  upsertSource,
  hasPostedSource,
  recentRejectCount,
  insertPost,
  updatePost,
  insertRunLog,
  recoverOrphanPending,
  getConfigValue,
  setConfigValue,
  lastPostedAt,
  recentContentModes,
  type Db,
} from "./db.js";
import { acquireLock } from "./lock.js";
import { loadInbox } from "./sources/inbox.js";
import { loadRss } from "./sources/rss.js";
import { loadGoogleNews } from "./sources/google-news.js";
import { loadLibrary } from "./sources/library.js";
import { filterByRecency } from "./sources/recency.js";
import { pickSource } from "./sources/pick.js";
import {
  createLlmFromConfig,
  draftPost,
  loadVoiceSamples,
  type LlmClient,
} from "./draft.js";
import { scoreDraft } from "./quality.js";
import { postTweet } from "./publisher.js";
import { shouldAttemptPost, localHour } from "./schedule.js";
import { alert } from "./alerts.js";
import { downloadImage, resolveImageUrl } from "./media.js";
import {
  atDailyPostCap,
  ocrOriginalPostBlockReason,
} from "./ocr/eligibility.js";
import {
  listLocalImages,
  modeLabel,
  pickContentMode,
  sourceFromLocalImage,
  syntheticSparkSource,
} from "./persona.js";
import { runEngageOnce } from "./engage/run.js";
import type {
  ContentMode,
  PauseReason,
  RunResult,
  SourceItem,
} from "./types.js";

export type WorkerDeps = {
  cfg: AppConfig;
  db: Db;
  llm: LlmClient;
  publish: typeof postTweet;
  random?: () => number;
  now?: () => Date;
};

function isPaused(cfg: AppConfig, db: Db): {
  paused: boolean;
  reason?: PauseReason | string;
} {
  if (cfg.PAUSED) return { paused: true, reason: "paused_manual" };
  const pauseFile = path.join(path.dirname(cfg.DATABASE_PATH), "PAUSED");
  if (fs.existsSync(pauseFile)) {
    return { paused: true, reason: "paused_manual" };
  }
  const flag = getConfigValue(db, "paused");
  if (flag === "true") {
    return {
      paused: true,
      reason: (getConfigValue(db, "paused_reason") as PauseReason) || "paused_manual",
    };
  }
  return { paused: false };
}

export function setPaused(
  db: Db,
  reason: PauseReason,
  dataDir: string,
  webhookUrl?: string
): void {
  setConfigValue(db, "paused", "true");
  setConfigValue(db, "paused_reason", reason);
  const pauseFile = path.join(dataDir, "PAUSED");
  fs.writeFileSync(pauseFile, reason, "utf8");
  void alert(`Agent paused: ${reason}`, {
    dataDir,
    webhookUrl,
  });
}

async function gatherSources(cfg: AppConfig): Promise<SourceItem[]> {
  const inbox = loadInbox(cfg.INBOX_DIR);
  const news: SourceItem[] = [];
  const library = await loadLibrary();


  if (cfg.googleNewsQueries.length) {
    try {
      let g = await loadGoogleNews({
        queries: cfg.googleNewsQueries,
        when: cfg.GOOGLE_NEWS_WHEN,
      });
      // Quiet day fallback: widen window, still filtered by MAX_SOURCE_AGE_HOURS
      if (!g.length && cfg.GOOGLE_NEWS_WHEN !== "7d") {
        console.log(
          `Google News empty for when:${cfg.GOOGLE_NEWS_WHEN} — retrying when:7d`
        );
        g = await loadGoogleNews({
          queries: cfg.googleNewsQueries,
          when: "7d",
        });
      }
      news.push(...g);
      console.log(`Google News: ${g.length} items`);
    } catch (err) {
      console.warn("Google News failed:", (err as Error).message);
    }
  }

  const feedUrls = [
    ...(cfg.RSS_FEED_URL ? [cfg.RSS_FEED_URL] : []),
    ...cfg.extraRssUrls,
  ];
  for (const url of feedUrls) {
    try {
      const rss = await loadRss(url);
      news.push(...rss);
    } catch (err) {
      console.warn("RSS fetch failed:", url, (err as Error).message);
    }
  }

  const freshNews = filterByRecency(news, {
    maxAgeHours: cfg.MAX_SOURCE_AGE_HOURS,
  });
  if (news.length && freshNews.length < news.length) {
    console.log(
      `Recency filter: kept ${freshNews.length}/${news.length} (max ${cfg.MAX_SOURCE_AGE_HOURS}h)`
    );
  }

  return [...inbox, ...freshNews, ...library];
}

/**
 * Given a content mode, pick fuel (source + optional local image).
 * Falls back if a mode has no material.
 */
function resolveModeSource(
  mode: ContentMode,
  items: SourceItem[],
  cfg: AppConfig,
  deps: {
    hasPosted: (id: string) => boolean;
    rejectCount24h: (id: string) => number;
  }
): { mode: ContentMode; source: SourceItem } | null {
  const news = items.filter(
    (i) => i.source_type === "rss" || i.source_type === "google_news" || i.source_type === "library"
  );
  const inbox = items.filter((i) => i.source_type === "inbox");
  const screenshots = listLocalImages(cfg.SCREENSHOTS_DIR)
    .map((p) => sourceFromLocalImage(p, "screenshot"))
    .filter((s) => !deps.hasPosted(s.id));
  const memeImgs = listLocalImages(cfg.MEMES_DIR)
    .map((p) => sourceFromLocalImage(p, "meme"))
    .filter((s) => !deps.hasPosted(s.id));

  const pickNews = () =>
    pickSource(news, {
      hasPosted: deps.hasPosted,
      rejectCount24h: deps.rejectCount24h,
      preferNews: true,
    });
  const pickInbox = () =>
    pickSource(inbox, {
      hasPosted: deps.hasPosted,
      rejectCount24h: deps.rejectCount24h,
      preferNews: false,
    });

  if (mode === "tech_news") {
    const s = pickNews();
    if (s) return { mode, source: { ...s, content_mode: mode } };
    // fall through to hot take
    mode = "hot_take";
  }

  if (mode === "ship_note") {
    const s = pickInbox();
    if (s) return { mode, source: { ...s, content_mode: mode } };
    mode = "hot_take";
  }

  if (mode === "screenshot") {
    const s = screenshots[0];
    if (s) return { mode, source: { ...s, content_mode: mode } };
    mode = "meme";
  }

  if (mode === "meme") {
    const sparkNews = pickNews();
    if (memeImgs[0]) {
      const img = { ...memeImgs[0], content_mode: mode as ContentMode };
      if (sparkNews?.title) {
        img.facts = [
          ...img.facts,
          `Optional topic spark: ${sparkNews.title}`,
        ];
      }
      return { mode, source: img };
    }
    // text-only meme with optional news spark
    const spark = syntheticSparkSource("meme", {
      title: sparkNews?.title,
      facts: sparkNews?.facts?.slice(0, 2),
    });
    spark.content_mode = "meme";
    return { mode: "meme", source: spark };
  }

  if (mode === "question" || mode === "hot_take") {
    const sparkNews = pickNews();
    const spark = syntheticSparkSource(mode, {
      title: sparkNews?.title,
      url: undefined, // no forced link for opinion modes
      facts: sparkNews
        ? [
            `Optional spark only (do not summarize as news): ${sparkNews.title}`,
            ...(sparkNews.facts || []).slice(0, 2),
          ]
        : undefined,
    });
    spark.content_mode = mode;
    return { mode, source: spark };
  }

  // last resort
  const any = pickNews() || pickInbox();
  if (any) return { mode: "tech_news", source: { ...any, content_mode: "tech_news" } };
  const spark = syntheticSparkSource("hot_take");
  spark.content_mode = "hot_take";
  return { mode: "hot_take", source: spark };
}

export async function runOnce(deps: WorkerDeps): Promise<RunResult> {
  const started = (deps.now?.() ?? new Date()).toISOString();
  const { cfg, db, llm } = deps;
  const publish = deps.publish;
  const random = deps.random ?? Math.random;
  const now = deps.now?.() ?? new Date();
  const dataDir = path.dirname(cfg.DATABASE_PATH);

  // orphan recovery
  recoverOrphanPending(db, 10 * 60 * 1000);

  const pause = isPaused(cfg, db);
  if (pause.paused) {
    insertRunLog(db, {
      started_at: started,
      result: "paused",
      detail: String(pause.reason),
    });
    console.log("skip: paused —", pause.reason);
    return "paused";
  }

  // --- Engagement-first (CEOs / founders reply+quote) ---
  if (cfg.AGENT_MODE === "engage" || cfg.AGENT_MODE === "both") {
    const engageAttempt = shouldAttemptPost(cfg, now, random);
    if (!engageAttempt.ok && !cfg.FORCE_RUN) {
      if (cfg.AGENT_MODE === "engage") {
        insertRunLog(db, {
          started_at: started,
          result: "noop",
          detail: engageAttempt.reason,
        });
        console.log("engage skip:", engageAttempt.reason);
        return "noop";
      }
      // both: fall through to original posts if engage window/jitter says no
    } else {
      console.log(`mode=${cfg.AGENT_MODE} → engagement scan`);
      const eng = await runEngageOnce({ cfg, db, llm, now: () => now });
      if (cfg.AGENT_MODE === "engage") return eng;
      if (eng !== "noop") return eng;
      console.log("engage: noop — falling back to original posts");
    }
  }

  const ocrBlock = ocrOriginalPostBlockReason(cfg, db);
  if (ocrBlock) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: ocrBlock,
    });
    console.log("skip:", ocrBlock);
    return "noop";
  }

  const cap = atDailyPostCap(cfg, db);
  if (cap.capped && !cfg.DRY_RUN) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: `budget ${cap.today}/${cap.max}`,
    });
    console.log(
      `skip: daily budget hit (${cap.today}/${cap.max}). Wait until tomorrow or raise DAILY_MAX / OCR_DAILY_MAX.`
    );
    return "noop";
  }
  if (cap.capped && cfg.DRY_RUN) {
    console.log(
      `note: daily budget already ${cap.today}/${cap.max} — continuing because DRY_RUN=true`
    );
  }

  // Spread posts: enforce min gap after last successful post (live only)
  if (!cfg.DRY_RUN && !cfg.FORCE_RUN && cfg.MIN_POST_GAP_MINUTES > 0) {
    const last = lastPostedAt(db);
    if (last) {
      const gapMs = cfg.MIN_POST_GAP_MINUTES * 60 * 1000;
      const elapsed = now.getTime() - new Date(last).getTime();
      if (elapsed < gapMs) {
        const waitMin = Math.ceil((gapMs - elapsed) / 60_000);
        insertRunLog(db, {
          started_at: started,
          result: "noop",
          detail: `min_gap wait ~${waitMin}m`,
        });
        console.log(
          `skip: min gap ${cfg.MIN_POST_GAP_MINUTES}m (next attempt in ~${waitMin}m)`
        );
        return "noop";
      }
    }
  }

  const attempt = shouldAttemptPost(cfg, now, random);
  if (!attempt.ok) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: attempt.reason,
    });
    if (attempt.reason === "outside_window") {
      console.log(
        "skip: outside post windows (POST_WINDOWS). For a test run: FORCE_RUN=true npm run worker"
      );
    } else if (attempt.reason === "jitter_skip") {
      console.log(
        "skip: random jitter (WINDOW_JITTER). Normal for cron. For a test run: FORCE_RUN=true npm run worker"
      );
    } else {
      console.log("skip:", attempt.reason);
    }
    return "noop";
  }

  const items = await gatherSources(cfg);
  for (const item of items) upsertSource(db, item);

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const hasPosted = (id: string) => hasPostedSource(db, id);
  const rejectCount24h = (id: string) => recentRejectCount(db, id, since24h);

  const hasNews = items.some(
    (i) =>
      (i.source_type === "rss" || i.source_type === "google_news") &&
      !hasPosted(i.id)
  );
  const hasInbox = items.some(
    (i) => i.source_type === "inbox" && !hasPosted(i.id)
  );
  const shotFiles = listLocalImages(cfg.SCREENSHOTS_DIR);
  const memeFiles = listLocalImages(cfg.MEMES_DIR);

  const mode = pickContentMode({
    weights: cfg.modeWeights,
    recentModes: recentContentModes(db, 8),
    available: {
      hasNews,
      hasInbox,
      hasScreenshots: shotFiles.some(
        (p) => !hasPosted(sourceFromLocalImage(p, "screenshot").id)
      ),
      hasMemeImages: memeFiles.some(
        (p) => !hasPosted(sourceFromLocalImage(p, "meme").id)
      ),
    },
    hour: localHour(cfg.TZ, now),
    random,
  });

  const resolved = resolveModeSource(mode, items, cfg, {
    hasPosted,
    rejectCount24h,
  });

  if (!resolved) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: "no_candidates",
    });
    console.log(
      "skip: no candidates for any mode. Add news feeds, inbox notes, or media/screenshots."
    );
    const last = lastPostedAt(db);
    if (last) {
      const age = Date.now() - new Date(last).getTime();
      if (age > 48 * 60 * 60 * 1000) {
        await alert("No posts in 48h while not paused", {
          dataDir,
          webhookUrl: cfg.WEBHOOK_URL || undefined,
        });
      }
    }
    return "noop";
  }

  const { mode: chosenMode, source: picked } = resolved;
  upsertSource(db, picked);
  console.log(`content mode: ${chosenMode} (${modeLabel(chosenMode)})`);

  const samples = loadVoiceSamples(cfg.VOICE_SAMPLES_PATH);

  let draft;
  try {
    draft = await draftPost(picked, {
      samples,
      llm,
      maxHashtags: cfg.MAX_HASHTAGS,
      mode: chosenMode,
    });
  } catch (err) {
    insertRunLog(db, {
      started_at: started,
      result: "error",
      error: (err as Error).message,
    });
    return "error";
  }

  const quality = scoreDraft(draft, picked, {
    bannedPhrases: cfg.bannedPhrases,
    threshold: cfg.VOICE_THRESHOLD,
    maxHashtags: cfg.MAX_HASHTAGS,
    includeSourceLink: cfg.INCLUDE_SOURCE_LINK,
    mode: chosenMode,
  });

  if (!quality.pass) {
    insertPost(db, {
      source_id: picked.id,
      draft: quality.text,
      score: quality.score,
      score_reasons: quality.reasons,
      status: "rejected",
      content_mode: chosenMode,
    });
    insertRunLog(db, {
      started_at: started,
      result: "quality_fail",
      detail: quality.reasons.join("; "),
    });
    return "quality_fail";
  }

  let imagePaths: string[] = [];
  if (picked.localImagePath && fs.existsSync(picked.localImagePath)) {
    imagePaths = [picked.localImagePath];
  } else if (cfg.ATTACH_IMAGES) {
    // 1. Try a direct filename match (e.g. PDF name -> PNG/JPG)
    const baseName = path.basename(picked.title || "").replace(/\.pdf$/i, "");
    const directMatches = [
      path.join(cfg.SCREENSHOTS_DIR, `${baseName}.png`),
      path.join(cfg.SCREENSHOTS_DIR, `${baseName}.jpg`),
      path.join(cfg.SCREENSHOTS_DIR, `${baseName}.jpeg`),
    ].filter(p => fs.existsSync(p));

    if (directMatches.length) {
      imagePaths = [directMatches[0]];
    } else {
      // 2. Keyword-based search in screenshots folder
      const allScreenshots = listLocalImages(cfg.SCREENSHOTS_DIR);
      const keywords = [
        ...picked.facts.map(f => f.split(' ').slice(0, 3).join(' ')), // Use first few words of facts
        ...(picked.title || "").split(' '),
      ].filter(k => k && k.length > 3);

      for (const keyword of keywords) {
        const found = allScreenshots.find(p =>
          path.basename(p).toLowerCase().includes(keyword.toLowerCase())
        );
        if (found) {
          imagePaths = [found];
          break;
        }
      }
    }

    // 3. Fallback: If still no image, use a random high-quality screenshot for "hook"
    if (imagePaths.length === 0 && chosenMode !== "meme") {
      const allScreenshots = listLocalImages(cfg.SCREENSHOTS_DIR);
      if (allScreenshots.length && random() < 0.7) { // 70% chance to add a hook image
        imagePaths = [allScreenshots[Math.floor(random() * allScreenshots.length)]];
      }
    }
  }

  if (chosenMode === "meme" && imagePaths.length === 0) {
    const memeFiles = listLocalImages(cfg.MEMES_DIR);
    if (memeFiles.length) {
      imagePaths = [memeFiles[Math.floor(random() * memeFiles.length)]];
    }
  }

  const postId = insertPost(db, {
    source_id: picked.id,
    draft: quality.text,
    score: quality.score,
    score_reasons: quality.reasons,
    status: "pending",
    content_mode: chosenMode,
  });

  if (cfg.DRY_RUN) {
    updatePost(db, postId, {
      status: "rejected",
      score_reasons: [...quality.reasons, "dry_run"],
    });
    insertRunLog(db, {
      started_at: started,
      result: "dry_run",
      detail: `[${chosenMode}] ${quality.text.slice(0, 180)}`,
    });
    console.log(`[DRY_RUN] mode=${chosenMode} would post:\n`, quality.text);
    if (imagePaths.length) {
      console.log("[DRY_RUN] with image:", imagePaths[0]);
    }
    return "dry_run";
  }

  // Browser LAST — only when live posting
  const result = await publish(quality.text, {
    profileDir: cfg.BROWSER_PROFILE_DIR,
    headless: cfg.HEADLESS,
    imagePaths,
  });

  if (result.ok) {
    updatePost(db, postId, {
      status: "posted",
      tweet_id: result.tweetId ?? result.tweetUrl ?? null,
    });
    insertRunLog(db, {
      started_at: started,
      result: "posted",
      detail: result.tweetUrl || result.tweetId || "ok",
    });
    console.log("Posted:", result.tweetUrl || result.tweetId || "ok");
    return "posted";
  }

  if (result.kind === "login_required" || result.kind === "browser_challenge") {
    updatePost(db, postId, { status: "failed" });
    setPaused(db, result.kind, dataDir, cfg.WEBHOOK_URL || undefined);
    insertRunLog(db, {
      started_at: started,
      result: "paused",
      detail: result.message,
    });
    return "paused";
  }

  // selector_break / error — do not auto-pause
  updatePost(db, postId, { status: "failed" });
  insertRunLog(db, {
    started_at: started,
    result: "error",
    error: `${result.kind}: ${result.message}`,
  });
  await alert(`Publish error (${result.kind}): ${result.message}`, {
    dataDir,
    webhookUrl: cfg.WEBHOOK_URL || undefined,
  });
  return "error";
}

async function main(): Promise<void> {
  let cfg: AppConfig;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  ensureDataDirs(cfg);

  const lock = acquireLock(cfg.LOCK_PATH);
  if (!lock) {
    console.log("Another worker holds the lock — exiting.");
    process.exit(0);
  }

  const db = openDb(cfg.DATABASE_PATH);
  try {
    const llm = createLlmFromConfig(cfg);
    const result = await runOnce({ cfg, db, llm, publish: postTweet });
    console.log("run result:", result);
  } finally {
    db.close();
    lock.release();
  }
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith("worker.ts") ||
    process.argv[1].endsWith("worker.js"));

if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
