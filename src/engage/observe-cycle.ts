/**
 * One observe cycle on a persistent X window:
 *   scrape network + For you timeline
 *   → optionally post (inspired by high-engagement profiles)
 *   → engage tech posts or people you follow (reply/quote)
 * Browser stays open on For you — never closed here.
 */
import type { Page } from "playwright";
import type { AppConfig } from "../config.js";
import type { Db } from "../db.js";
import {
  engagementsToday,
  getWatchedTweet,
  lastEngagedAt,
  lastPostedAt,
  markWatchedEngaged,
  upsertWatchedTweet,
  insertPost,
  updatePost,
  insertRunLog,
} from "../db.js";
import type { LlmClient } from "../draft.js";
import { loadVoiceSamples } from "../draft.js";
import { scoreDraft } from "../quality.js";
import type { AgentSession } from "../publisher.js";
import type { PublishResult, RunResult } from "../types.js";
import { draftEngage, isEngageSkip } from "./draft.js";
import { hasClearEngageableText, isFreshEnough, scoreEngageDraft } from "./quality.js";
import {
  scrapeHomeTimeline,
  scrapeFollowingFeed,
  scrapeFollowingHandles,
  scrapeNotifications,
  scrapeProfile,
  type FeedTweet,
} from "./discover.js";
import { keywordTopicHit, isJobPost, rankForEngage } from "./topics.js";
import { draftMirrorPost, pickHighEngagement } from "./mirror.js";
import type { WatchedTweet } from "./types.js";
import { isOwnPost } from "../self-post.js";
import {
  atDailyPostCap,
  ocrOriginalPostBlockReason,
} from "../ocr/eligibility.js";
import { trackPostImpressions } from "../ocr/impressions.js";

export type ObserveDeps = {
  cfg: AppConfig;
  db: Db;
  llm: LlmClient;
  session: AgentSession;
  now?: () => Date;
  /** When true, skip original mirror post this cycle */
  skipMirror?: boolean;
  /** When true, skip engage this cycle */
  skipEngage?: boolean;
};

function toWatched(t: FeedTweet): WatchedTweet {
  const { source: _s, query: _q, ...rest } = t;
  return rest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Feed sources only — no search, no watchlist. */
const FEED_SOURCES = ["following", "notifications", "timeline"] as const;

async function observeFeed(
  page: Page,
  sources: string[],
  myHandle: string
): Promise<{ tweets: FeedTweet[]; followingHandles: Set<string> }> {
  const all: FeedTweet[] = [];
  const seenIds = new Set<string>();
  const followingHandles = new Set<string>();

  const pushAll = (tweets: FeedTweet[], label: string) => {
    console.log(`  observe ${label}: ${tweets.length} posts`);
    for (const t of tweets) {
      if (t.source === "following" || t.source === "notifications") {
        followingHandles.add(t.handle.toLowerCase());
      }
      if (!seenIds.has(t.tweetId)) {
        seenIds.add(t.tweetId);
        all.push(t);
      }
    }
  };

  // 1) Network sources first (builds followingHandles)
  if (sources.includes("following")) {
    try {
      pushAll(await scrapeFollowingFeed(page, { limit: 40 }), "following");
    } catch (err) {
      console.warn("  following observe failed:", (err as Error).message);
    }
  }

  if (sources.includes("notifications")) {
    try {
      pushAll(await scrapeNotifications(page, { limit: 30 }), "notifications");
    } catch (err) {
      console.warn("  notifications observe failed:", (err as Error).message);
    }
  }

  // Refresh who-you-follow list so For you posts from network qualify
  if (myHandle) {
    try {
      const handles = await scrapeFollowingHandles(page, myHandle, {
        limit: 120,
      });
      for (const h of handles) followingHandles.add(h);
      console.log(`  following list: ${handles.length} handles cached`);
    } catch (err) {
      console.warn("  following-list scrape failed:", (err as Error).message);
    }
  }

  // 2) For you LAST so the window stays on that tab
  if (sources.includes("timeline")) {
    try {
      pushAll(await scrapeHomeTimeline(page, { limit: 50 }), "timeline (For you)");
    } catch (err) {
      console.warn("  timeline observe failed:", (err as Error).message);
    }
  }

  return { tweets: all, followingHandles };
}

/** Proactively visit Alpha Handles defined in config. */
async function observeAlphaHandles(
  page: Page,
  handles: string[]
): Promise<FeedTweet[]> {
  const all: FeedTweet[] = [];
  for (const handle of handles) {
    try {
      console.log(`  observing alpha handle: @${handle}`);
      const tweets = await scrapeProfile(page, handle, { limit: 3 });
      all.push(...tweets);
    } catch (err) {
      console.warn(`  alpha observe failed for @${handle}:`, (err as Error).message);
    }
  }
  return all;
}

function filterEngageCandidates(
  scanned: FeedTweet[],
  cfg: AppConfig,
  db: Db,
  now: Date,
  followingHandles: Set<string>
): FeedTweet[] {
  const candidates: FeedTweet[] = [];

  for (const tw of scanned) {
    const existing = getWatchedTweet(db, tw.tweetId);
    if (existing) {
      const st = existing.status;
      if (
        st === "engaged" ||
        st === "skipped_old" ||
        st === "skipped_rt" ||
        st === "failed" ||
        st === "rejected"
      ) {
        continue;
      }
      if (st === "dry_run" && cfg.DRY_RUN) continue;
    }

    if (cfg.ENGAGE_SKIP_RETWEETS && tw.isRetweet) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "skipped_rt",
      });
      continue;
    }
    if (cfg.ENGAGE_SKIP_REPLIES && tw.isReply) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "skipped_rt",
      });
      continue;
    }

    // Never engage with / like our own posts (check handle AND url)
    if (isOwnPost({ handle: tw.handle, url: tw.url, myHandle: cfg.myHandle })) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "rejected",
        draft: "skip_self: own post",
      });
      continue;
    }

    // Unclear / emoji-only / media-only → keep scrolling (no like/reply/quote)
    if (!hasClearEngageableText(tw.text)) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "rejected",
        draft: "skip_unclear: keep scrolling",
      });
      continue;
    }

    if (!isFreshEnough(tw, cfg.MAX_TARGET_AGE_MINUTES, now)) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "skipped_old",
      });
      continue;
    }

    // Never engage job / hiring posts
    if (isJobPost(tw.text)) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "rejected",
        draft: "skip_job: hiring/job post",
      });
      continue;
    }

    const fromNetwork =
      tw.source === "following" ||
      tw.source === "notifications" ||
      followingHandles.has(tw.handle.toLowerCase());
    const tech = keywordTopicHit(tw.text);

    // For you / search: entertain ANY tech/AI/Solana/YC/startup/founder post
    // (not limited to people you follow). Skip unrelated For you noise.
    if (tw.source === "timeline" || tw.source === "search") {
      if (!tech.pass) {
        upsertWatchedTweet(db, {
          tweetId: tw.tweetId,
          handle: tw.handle,
          text: tw.text,
          url: tw.url,
          publishedAt: tw.publishedAt,
          status: "rejected",
          draft: `skip_topic: ${tech.reason}`,
        });
        continue;
      }
    }

    // View floor: skip for tech matches and your network (discover early)
    if (cfg.MIN_VIEWS > 0 && !fromNetwork && !tech.pass) {
      if (tw.views == null) {
        if (cfg.MIN_VIEWS_IF_UNKNOWN === "skip") {
          upsertWatchedTweet(db, {
            tweetId: tw.tweetId,
            handle: tw.handle,
            text: tw.text,
            url: tw.url,
            publishedAt: tw.publishedAt,
            status: "rejected",
            draft: "skip_views: unknown",
          });
          continue;
        }
      } else if (tw.views < cfg.MIN_VIEWS) {
        upsertWatchedTweet(db, {
          tweetId: tw.tweetId,
          handle: tw.handle,
          text: tw.text,
          url: tw.url,
          publishedAt: tw.publishedAt,
          status: "rejected",
          draft: `skip_views: ${tw.views} < ${cfg.MIN_VIEWS}`,
        });
        continue;
      }
    }

    if (!existing) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "seen",
      });
    }
    candidates.push(tw);
  }

  candidates.sort(rankForEngage);
  return candidates;
}

async function maybeMirrorPost(
  deps: ObserveDeps,
  scanned: FeedTweet[],
  now: Date
): Promise<RunResult | null> {
  const { cfg, db, llm, session } = deps;
  const started = now.toISOString();

  if (deps.skipMirror) return null;

  const ocrBlock = ocrOriginalPostBlockReason(cfg, db);
  if (ocrBlock) {
    console.log("mirror: skip —", ocrBlock);
    return null;
  }

  const cap = atDailyPostCap(cfg, db);
  if (cap.capped && !cfg.DRY_RUN) {
    console.log(`mirror: daily post cap ${cap.today}/${cap.max}`);
    return null;
  }

  if (!cfg.DRY_RUN && !cfg.FORCE_RUN && cfg.MIN_POST_GAP_MINUTES > 0) {
    const last = lastPostedAt(db);
    if (last) {
      const gapMs = cfg.MIN_POST_GAP_MINUTES * 60 * 1000;
      const elapsed = now.getTime() - new Date(last).getTime();
      if (elapsed < gapMs) {
        const wait = Math.ceil((gapMs - elapsed) / 60_000);
        console.log(`mirror: min gap — wait ~${wait}m`);
        return null;
      }
    }
  }

  const inspiration = pickHighEngagement(scanned, {
    minViews: Math.min(cfg.MIN_VIEWS, 5_000),
    limit: 5,
  });
  if (!inspiration.length) {
    console.log("mirror: no high-engagement posts to take inspiration from");
    return null;
  }

  console.log(
    `mirror: inspired by ${inspiration
      .map((t) => `@${t.handle}(${t.views?.toLocaleString() ?? "?"})`)
      .join(", ")}`
  );

  const samples = loadVoiceSamples(cfg.VOICE_SAMPLES_PATH);
  let draft;
  try {
    draft = await draftMirrorPost(inspiration, {
      samples,
      llm,
      ocrMode: cfg.OCR_MODE,
    });
  } catch (err) {
    insertRunLog(db, {
      started_at: started,
      result: "error",
      error: (err as Error).message,
    });
    console.error("mirror draft failed:", (err as Error).message);
    return "error";
  }

  const sparkId = `mirror:${inspiration[0].tweetId}`;
  const quality = scoreDraft(
    draft,
    {
      id: sparkId,
      source_type: "spark",
      title: "feed mirror",
      url: "",
      facts: inspiration.map(
        (t) => `@${t.handle}: ${t.text.slice(0, 120)}`
      ),
      raw: { inspiration: inspiration.map((t) => t.tweetId) },
      fetched_at: now.toISOString(),
      content_mode: "hot_take",
    },
    {
      bannedPhrases: cfg.bannedPhrases,
      threshold: cfg.VOICE_THRESHOLD,
      maxHashtags: cfg.MAX_HASHTAGS,
      includeSourceLink: false,
      mode: "hot_take",
    }
  );

  if (!quality.pass) {
    insertPost(db, {
      source_id: sparkId,
      draft: quality.text,
      score: quality.score,
      score_reasons: quality.reasons,
      status: "rejected",
      content_mode: "hot_take",
    });
    insertRunLog(db, {
      started_at: started,
      result: "quality_fail",
      detail: quality.reasons.join("; "),
    });
    console.log("mirror: quality fail —", quality.reasons.join("; "));
    return "quality_fail";
  }

  const postId = insertPost(db, {
    source_id: sparkId,
    draft: quality.text,
    score: quality.score,
    score_reasons: quality.reasons,
    status: "pending",
    content_mode: "hot_take",
  });

  if (cfg.DRY_RUN) {
    updatePost(db, postId, {
      status: "rejected",
      score_reasons: [...quality.reasons, "dry_run"],
    });
    insertRunLog(db, {
      started_at: started,
      result: "dry_run",
      detail: `[mirror] ${quality.text.slice(0, 180)}`,
    });
    console.log("[DRY_RUN] mirror would post:\n", quality.text);
    return "dry_run";
  }

  const result: PublishResult = await session.post(quality.text);
  if (result.ok) {
    updatePost(db, postId, {
      status: "posted",
      tweet_id: result.tweetId ?? result.tweetUrl ?? null,
    });
    insertRunLog(db, {
      started_at: started,
      result: "posted",
      detail: `mirror ${result.tweetUrl || result.tweetId || "ok"}`,
    });
    console.log("mirror: posted", result.tweetUrl || result.tweetId || "ok");
    const idOrUrl = result.tweetUrl || result.tweetId;
    if (idOrUrl) {
      await trackPostImpressions(session.page, cfg, db, {
        postId,
        tweetIdOrUrl: idOrUrl,
      });
    }
    await sleep(2000);
    await session.goHome();
    return "posted";
  }

  updatePost(db, postId, { status: "failed" });
  insertRunLog(db, {
    started_at: started,
    result: "error",
    error: `${result.kind}: ${result.message}`,
  });
  console.error("mirror publish failed:", result.kind, result.message);
  return "error";
}

/**
 * Pick up to `limit` targets.
 * Prefer For you tech/AI/startup posts first, then network, one per handle.
 */
function pickEngageBatch(
  candidates: FeedTweet[],
  limit: number
): FeedTweet[] {
  const techTimeline = candidates.filter(
    (c) =>
      (c.source === "timeline" || c.source === "search") &&
      keywordTopicHit(c.text).pass
  );
  const following = candidates.filter((c) => c.source === "following");
  const notifs = candidates.filter((c) => c.source === "notifications");
  const rest = candidates.filter(
    (c) =>
      c.source !== "following" &&
      c.source !== "notifications" &&
      c.source !== "timeline" &&
      c.source !== "search"
  );
  const ordered = [...techTimeline, ...following, ...notifs, ...rest];

  const out: FeedTweet[] = [];
  const seenHandles = new Set<string>();
  // Pass 1: one post per handle
  for (const tw of ordered) {
    if (out.length >= limit) break;
    const h = tw.handle.toLowerCase();
    if (seenHandles.has(h)) continue;
    seenHandles.add(h);
    out.push(tw);
  }
  // Pass 2: fill remaining slots
  if (out.length < limit) {
    const taken = new Set(out.map((t) => t.tweetId));
    for (const tw of ordered) {
      if (out.length >= limit) break;
      if (taken.has(tw.tweetId)) continue;
      out.push(tw);
      taken.add(tw.tweetId);
    }
  }
  return out;
}

async function engageOneTarget(
  deps: ObserveDeps,
  target: FeedTweet,
  now: Date
): Promise<RunResult> {
  const { cfg, db, llm, session } = deps;
  const started = now.toISOString();

  console.log(
    `engage: [${target.source}] @${target.handle} (~${target.views?.toLocaleString() ?? "?"} views) ${target.url}\n  "${target.text.slice(0, 120)}"`
  );

  // Belt-and-suspenders: never quote/reply own posts
  if (isOwnPost({ handle: target.handle, url: target.url, myHandle: cfg.myHandle })) {
    upsertWatchedTweet(db, {
      tweetId: target.tweetId,
      handle: target.handle,
      text: target.text,
      url: target.url,
      publishedAt: target.publishedAt,
      status: "rejected",
      draft: "skip_self: own post",
    });
    console.log(`engage: skip @${target.handle} — own post (no like/reply/quote)`);
    return "noop";
  }

  const prefer =
    target.source === "following" ||
    target.source === "notifications" ||
    target.source === "timeline"
      ? "quote"
      : cfg.ENGAGE_PREFER;

  const samples = loadVoiceSamples(cfg.VOICE_SAMPLES_PATH);
  let draftResult;
  try {
    draftResult = await draftEngage(toWatched(target), {
      samples,
      llm,
      prefer,
      source: target.source,
    });
  } catch (err) {
    insertRunLog(db, {
      started_at: started,
      result: "error",
      error: (err as Error).message,
    });
    return "error";
  }

  if (isEngageSkip(draftResult)) {
    upsertWatchedTweet(db, {
      tweetId: target.tweetId,
      handle: target.handle,
      text: target.text,
      url: target.url,
      publishedAt: target.publishedAt,
      status: "rejected",
      draft: `skip: ${draftResult.reason}`,
    });
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: `skip @${target.handle}: ${draftResult.reason}`,
    });
    console.log(
      `engage: skip @${target.handle} — ${draftResult.reason} (no like/reply/quote)`
    );
    return "noop";
  }

  let draft = draftResult;

  // Soft length trim — LLM sometimes overshoots
  if (draft.text.length > 260) {
    draft = { ...draft, text: draft.text.slice(0, 257).trim() + "…" };
  }

  const quality = scoreEngageDraft(draft, toWatched(target), {
    threshold: Math.min(cfg.VOICE_THRESHOLD, 0.72),
    bannedPhrases: cfg.bannedPhrases,
  });

  if (!quality.pass) {
    upsertWatchedTweet(db, {
      tweetId: target.tweetId,
      handle: target.handle,
      text: target.text,
      url: target.url,
      publishedAt: target.publishedAt,
      status: "rejected",
      action: draft.kind,
      draft: quality.text,
    });
    insertRunLog(db, {
      started_at: started,
      result: "quality_fail",
      detail: quality.reasons.join("; "),
    });
    console.log("engage: quality fail —", quality.reasons.join("; "));
    return "quality_fail";
  }

  const postId = insertPost(db, {
    source_id: `watch:${target.tweetId}`,
    draft: `[${draft.kind} @${target.handle} via ${target.source}] ${quality.text}`,
    score: quality.score,
    score_reasons: [...quality.reasons, draft.rationale],
    status: "pending",
    content_mode: `engage_${draft.kind}`,
  });

  if (cfg.DRY_RUN) {
    updatePost(db, postId, {
      status: "rejected",
      score_reasons: [...quality.reasons, "dry_run"],
    });
    upsertWatchedTweet(db, {
      tweetId: target.tweetId,
      handle: target.handle,
      text: target.text,
      url: target.url,
      publishedAt: target.publishedAt,
      status: "dry_run",
      action: draft.kind,
      draft: quality.text,
    });
    insertRunLog(db, {
      started_at: started,
      result: "dry_run",
      detail: `${draft.kind} @${target.handle}: ${quality.text.slice(0, 160)}`,
    });
    console.log(
      `[DRY_RUN] would ${draft.kind} @${target.handle}:\n`,
      quality.text
    );
    return "dry_run";
  }

  const isSelf = isOwnPost({
    handle: target.handle,
    url: target.url,
    myHandle: cfg.myHandle,
  });
  const alsoLike = cfg.ENGAGE_ALSO_LIKE && !isSelf;
  let result: PublishResult;
  if (draft.kind === "quote") {
    result = await session.quote(target.url, quality.text, {
      alsoLike,
      myHandle: cfg.myHandle,
    });
  } else {
    result = await session.reply(target.url, quality.text, {
      alsoLike,
      myHandle: cfg.myHandle,
    });
  }

  if (result.ok) {
    markWatchedEngaged(db, target.tweetId, draft.kind, quality.text);
    updatePost(db, postId, {
      status: "posted",
      tweet_id: result.tweetId ?? result.tweetUrl ?? null,
    });
    insertRunLog(db, {
      started_at: started,
      result: "posted",
      detail: `${draft.kind} @${target.handle} via ${target.source}`,
    });
    console.log(
      `engage: ${draft.kind} posted on @${target.handle} (${target.source})`
    );
    await sleep(1200);
    await session.goHome();
    return "posted";
  }

  updatePost(db, postId, { status: "failed" });
  const permanent =
    result.kind === "login_required" || result.kind === "browser_challenge";
  upsertWatchedTweet(db, {
    tweetId: target.tweetId,
    handle: target.handle,
    text: target.text,
    url: target.url,
    publishedAt: target.publishedAt,
    status: permanent ? "failed" : "seen",
    action: draft.kind,
    draft: quality.text,
  });
  insertRunLog(db, {
    started_at: started,
    result: "error",
    error: `${result.kind}: ${result.message}`,
  });
  console.error("engage publish failed:", result.kind, result.message);
  return "error";
}

async function maybeEngage(
  deps: ObserveDeps,
  candidates: FeedTweet[],
  now: Date
): Promise<RunResult | null> {
  const { cfg, db } = deps;

  if (deps.skipEngage) return null;

  // OCR pays on original HT content; thin quotes/replies are weak or ineligible.
  if (cfg.OCR_MODE && cfg.OCR_SKIP_ENGAGE) {
    console.log(
      "engage: skipped (OCR_MODE + OCR_SKIP_ENGAGE — prioritize original posts)"
    );
    return null;
  }

  const today = engagementsToday(db, cfg.TZ);
  if (today >= cfg.DAILY_ENGAGE_MAX && !cfg.DRY_RUN) {
    console.log(`engage: daily cap ${today}/${cfg.DAILY_ENGAGE_MAX}`);
    return null;
  }

  // Gap only gates starting a batch — within the batch we quote several people
  if (!cfg.DRY_RUN && !cfg.FORCE_RUN && cfg.MIN_ENGAGE_GAP_MINUTES > 0) {
    const last = lastEngagedAt(db);
    if (last) {
      const gapMs = cfg.MIN_ENGAGE_GAP_MINUTES * 60 * 1000;
      const elapsed = now.getTime() - new Date(last).getTime();
      if (elapsed < gapMs) {
        const wait = Math.ceil((gapMs - elapsed) / 60_000);
        console.log(`engage: min gap — wait ~${wait}m`);
        return null;
      }
    }
  }

  const remaining = Math.max(0, cfg.DAILY_ENGAGE_MAX - today);
  const batchSize = Math.min(cfg.ENGAGE_PER_CYCLE || 6, remaining || 6);
  const batch = pickEngageBatch(candidates, batchSize);

  if (!batch.length) {
    console.log(
      "engage: no fresh targets in feed (all filtered — RT/reply/old/self/already handled)"
    );
    return null;
  }

  console.log(
    `engage: quoting up to ${batch.length} posts this cycle → ${batch.map((t) => `@${t.handle}`).join(", ")}`
  );

  let posted = 0;
  let lastResult: RunResult | null = null;
  for (let i = 0; i < batch.length; i++) {
    const target = batch[i];
    // Re-check daily cap mid-batch
    if (!cfg.DRY_RUN && engagementsToday(db, cfg.TZ) >= cfg.DAILY_ENGAGE_MAX) {
      console.log("engage: hit daily cap mid-batch");
      break;
    }
    lastResult = await engageOneTarget(deps, target, now);
    if (lastResult === "posted" || lastResult === "dry_run") posted += 1;
    // Brief pause between quotes so it doesn't look robotic
    if (i < batch.length - 1 && lastResult === "posted") {
      await sleep(8000 + Math.floor(Math.random() * 7000));
    }
    // Hard stop on login/challenge
    if (lastResult === "error") {
      // continue to next target unless browser is broken — engageOneTarget already logged
    }
  }

  if (posted > 0) return "posted";
  return lastResult;
}

/**
 * Observe feed → mirror high-engagement → engage.
 * Keeps the X window open.
 */
export async function runObserveCycle(deps: ObserveDeps): Promise<RunResult> {
  const now = deps.now?.() ?? new Date();
  const started = now.toISOString();
  const { cfg, db, session } = deps;

  // Prefer feed sources only; ignore search/watchlist even if still in env
  const configured = cfg.engageSources.filter((s) =>
    (FEED_SOURCES as readonly string[]).includes(s)
  );
  const sources = configured.length
    ? configured
    : [...FEED_SOURCES];

  console.log(`observe: sources=${sources.join("+")} (window stays open)`);
  const { tweets: feedTweets, followingHandles } = await observeFeed(
    session.page,
    sources,
    cfg.myHandle
  );

  // Proactively mine the Alpha Handles for a "first-response" advantage
  const alphaTweets = await observeAlphaHandles(session.page, cfg.watchHandles);

  const scanned = [...alphaTweets, ...feedTweets];
  console.log(
    `observe: ${scanned.length} unique posts seen (${followingHandles.size} following handles known)`
  );

  if (!scanned.length) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: "empty_feed",
    });
    await session.goHome();
    return "noop";
  }

  // 1) Post inspired by highly engaged profiles
  const mirrorResult = await maybeMirrorPost(deps, scanned, now);

  // 2) Engage: For you tech posts + network posts
  const candidates = filterEngageCandidates(
    scanned,
    cfg,
    db,
    now,
    followingHandles
  );
  const engageResult = await maybeEngage(deps, candidates, now);

  await session.goHome();

  if (mirrorResult === "error" || engageResult === "error") return "error";
  if (mirrorResult === "posted" || engageResult === "posted") return "posted";
  if (mirrorResult === "dry_run" || engageResult === "dry_run") return "dry_run";
  if (mirrorResult === "quality_fail" || engageResult === "quality_fail") {
    return "quality_fail";
  }

  insertRunLog(db, {
    started_at: started,
    result: "noop",
    detail: "observe_idle",
  });
  return "noop";
}
