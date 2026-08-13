/**
 * One engagement cycle (legacy one-shot worker):
 *   discover following + notifications + timeline
 *   → draft reply|quote → publish
 *
 * Prefer `npm run observe` for the keep-open feed loop.
 * search / watchlist sources are ignored.
 */
import type { AppConfig } from "../config.js";
import type { Db } from "../db.js";
import {
  engagementsToday,
  getWatchedTweet,
  lastEngagedAt,
  markWatchedEngaged,
  upsertWatchedTweet,
  insertPost,
  updatePost,
  insertRunLog,
} from "../db.js";
import type { LlmClient } from "../draft.js";
import { loadVoiceSamples } from "../draft.js";
import {
  replyToTweet,
  quoteTweet,
  withAgentBrowser,
  type PublisherOpts,
} from "../publisher.js";
import type { PublishResult, RunResult } from "../types.js";
import { draftEngage, isEngageSkip } from "./draft.js";
import { hasClearEngageableText, isFreshEnough, scoreEngageDraft } from "./quality.js";
import { isOwnPost } from "../self-post.js";
import {
  scrapeHomeTimeline,
  scrapeFollowingFeed,
  scrapeNotifications,
  type FeedTweet,
} from "./discover.js";
import {
  keywordTopicHit,
  llmTopicConfirm,
  rankForEngage,
  isJobPost,
} from "./topics.js";
import type { WatchedTweet } from "./types.js";

export type EngageDeps = {
  cfg: AppConfig;
  db: Db;
  llm: LlmClient;
  now?: () => Date;
  scan?: () => Promise<FeedTweet[]>;
  publishReply?: typeof replyToTweet;
  publishQuote?: typeof quoteTweet;
};

function toWatched(t: FeedTweet): WatchedTweet {
  const { source: _s, query: _q, ...rest } = t;
  return rest;
}

const FEED_ONLY = new Set(["following", "notifications", "timeline"]);

export async function runEngageOnce(deps: EngageDeps): Promise<RunResult> {
  const started = (deps.now?.() ?? new Date()).toISOString();
  const now = deps.now?.() ?? new Date();
  const { cfg, db, llm } = deps;
  const sources = cfg.engageSources.filter((s) => FEED_ONLY.has(s));

  if (!sources.length) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: "no_engage_sources",
    });
    console.log(
      "engage: ENGAGE_SOURCES empty (need following/notifications/timeline)"
    );
    return "noop";
  }

  const today = engagementsToday(db, cfg.TZ);
  if (today >= cfg.DAILY_ENGAGE_MAX && !cfg.DRY_RUN) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: `engage_budget ${today}/${cfg.DAILY_ENGAGE_MAX}`,
    });
    console.log(`engage: daily cap ${today}/${cfg.DAILY_ENGAGE_MAX}`);
    return "noop";
  }

  if (!cfg.DRY_RUN && !cfg.FORCE_RUN && cfg.MIN_ENGAGE_GAP_MINUTES > 0) {
    const last = lastEngagedAt(db);
    if (last) {
      const gapMs = cfg.MIN_ENGAGE_GAP_MINUTES * 60 * 1000;
      const elapsed = now.getTime() - new Date(last).getTime();
      if (elapsed < gapMs) {
        const wait = Math.ceil((gapMs - elapsed) / 60_000);
        console.log(`engage: min gap — wait ~${wait}m`);
        insertRunLog(db, {
          started_at: started,
          result: "noop",
          detail: `engage_gap ~${wait}m`,
        });
        return "noop";
      }
    }
  }

  const pubOpts: PublisherOpts = {
    profileDir: cfg.BROWSER_PROFILE_DIR,
    headless: cfg.HEADLESS,
  };

  let scanned: FeedTweet[] = [];
  if (deps.scan) {
    scanned = await deps.scan();
  } else {
    console.log(`engage: sources=${sources.join("+")}`);
    scanned = await withAgentBrowser(pubOpts, async (page) => {
      const all: FeedTweet[] = [];
      const seenIds = new Set<string>();

      const pushAll = (tweets: FeedTweet[], label: string) => {
        console.log(`  ${label}: ${tweets.length} tweets`);
        for (const t of tweets) {
          if (!seenIds.has(t.tweetId)) {
            seenIds.add(t.tweetId);
            all.push(t);
          }
        }
      };

      if (sources.includes("following")) {
        try {
          pushAll(await scrapeFollowingFeed(page, { limit: 30 }), "following");
        } catch (err) {
          console.warn("  following scan failed:", (err as Error).message);
        }
      }

      if (sources.includes("notifications")) {
        try {
          pushAll(
            await scrapeNotifications(page, { limit: 25 }),
            "notifications"
          );
        } catch (err) {
          console.warn("  notifications scan failed:", (err as Error).message);
        }
      }

      if (sources.includes("timeline")) {
        try {
          pushAll(await scrapeHomeTimeline(page, { limit: 20 }), "timeline");
        } catch (err) {
          console.warn("  timeline scan failed:", (err as Error).message);
        }
      }

      return all;
    });
  }

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

    const fromNetwork =
      tw.source === "following" || tw.source === "notifications";
    // View floor only for timeline/discovery — network is trusted
    if (cfg.MIN_VIEWS > 0 && !fromNetwork) {
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

    const trustedNetwork = fromNetwork;
    let topic = keywordTopicHit(tw.text);
    if (!trustedNetwork && !topic.pass) {
      upsertWatchedTweet(db, {
        tweetId: tw.tweetId,
        handle: tw.handle,
        text: tw.text,
        url: tw.url,
        publishedAt: tw.publishedAt,
        status: "rejected",
        draft: `skip_topic: ${topic.reason}`,
      });
      continue;
    }
    if (!trustedNetwork && cfg.ENGAGE_TOPIC_LLM && topic.pass) {
      topic = await llmTopicConfirm(tw, llm);
      if (!topic.pass) {
        upsertWatchedTweet(db, {
          tweetId: tw.tweetId,
          handle: tw.handle,
          text: tw.text,
          url: tw.url,
          publishedAt: tw.publishedAt,
          status: "rejected",
          draft: `skip_topic_llm: ${topic.reason}`,
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
  const target = candidates[0];
  if (!target) {
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: "no_fresh_targets",
    });
    console.log("engage: no fresh feed targets");
    return "noop";
  }

  console.log(
    `engage: [${target.source}] @${target.handle} (~${target.views?.toLocaleString() ?? "?"} views) ${target.url}\n  "${target.text.slice(0, 120)}"`
  );

  const samples = loadVoiceSamples(cfg.VOICE_SAMPLES_PATH);
  let draftResult;
  try {
    draftResult = await draftEngage(toWatched(target), {
      samples,
      llm,
      prefer:
        target.source === "following" ? "quote" : cfg.ENGAGE_PREFER,
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

  const draft = draftResult;

  const quality = scoreEngageDraft(draft, toWatched(target), {
    threshold: cfg.VOICE_THRESHOLD,
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

  const publishReply = deps.publishReply ?? replyToTweet;
  const publishQuote = deps.publishQuote ?? quoteTweet;
  const isSelf = isOwnPost({
    handle: target.handle,
    url: target.url,
    myHandle: cfg.myHandle,
  });
  const alsoLike = cfg.ENGAGE_ALSO_LIKE && !isSelf;
  let result: PublishResult;
  if (draft.kind === "quote") {
    result = await publishQuote(target.url, quality.text, {
      ...pubOpts,
      alsoLike,
      myHandle: cfg.myHandle,
    });
  } else {
    result = await publishReply(target.url, quality.text, {
      ...pubOpts,
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
    return "posted";
  }

  updatePost(db, postId, { status: "failed" });
  upsertWatchedTweet(db, {
    tweetId: target.tweetId,
    handle: target.handle,
    text: target.text,
    url: target.url,
    publishedAt: target.publishedAt,
    status: "failed",
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
