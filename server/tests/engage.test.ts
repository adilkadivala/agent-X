import { describe, it, expect } from "vitest";
import {
  scoreEngageDraft,
  isFreshEnough,
  hasClearEngageableText,
} from "../src/engage/quality.js";
import { parseWatchHandles } from "../src/engage/watch.js";
import { keywordTopicHit } from "../src/engage/topics.js";
import { isJobPost } from "../src/engage/topics.js";
import { pickToneForPost } from "../src/engage/draft.js";
import { parseViewCount } from "../src/engage/views.js";
import { pickHighEngagement } from "../src/engage/mirror.js";
import type { EngageDraft, WatchedTweet } from "../src/engage/types.js";
import type { FeedTweet } from "../src/engage/discover.js";

const tweet = (over: Partial<WatchedTweet> = {}): WatchedTweet => ({
  tweetId: "1",
  handle: "sama",
  text: "We just shipped a faster model for agents.",
  url: "https://x.com/sama/status/1",
  publishedAt: new Date().toISOString(),
  isRetweet: false,
  isReply: false,
  ...over,
});

const draft = (over: Partial<EngageDraft> = {}): EngageDraft => ({
  kind: "reply",
  text: "Faster is nice. But which agent workflows actually get shorter?",
  score: 0.9,
  reasons: ["ok"],
  rationale: "asks a concrete question",
  ...over,
});

describe("scoreEngageDraft", () => {
  it("passes a sharp reply", () => {
    const r = scoreEngageDraft(draft(), tweet(), {
      threshold: 0.8,
      bannedPhrases: ["great post"],
    });
    expect(r.pass).toBe(true);
  });

  it("rejects sycophancy", () => {
    const r = scoreEngageDraft(
      draft({ text: "Great post! So true about agents." }),
      tweet(),
      { threshold: 0.5, bannedPhrases: [] }
    );
    expect(r.pass).toBe(false);
  });

  it("rejects meta unable-to-view drafts", () => {
    const r = scoreEngageDraft(
      draft({
        text: "I'm unable to view the linked post, so I can't generate a quote that directly addresses its content.",
      }),
      tweet(),
      { threshold: 0.5, bannedPhrases: [] }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => x.includes("meta_refusal"))).toBe(true);
  });
});

describe("hasClearEngageableText", () => {
  it("rejects emoji-only posts", () => {
    expect(hasClearEngageableText("🤖 🥷")).toBe(false);
  });

  it("rejects empty / media placeholders", () => {
    expect(hasClearEngageableText("")).toBe(false);
    expect(hasClearEngageableText("(media/short post)")).toBe(false);
  });

  it("accepts real text", () => {
    expect(
      hasClearEngageableText("We just shipped a faster model for agents.")
    ).toBe(true);
  });
});

describe("isFreshEnough", () => {
  it("rejects old tweets", () => {
    const old = tweet({
      publishedAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    });
    expect(isFreshEnough(old, 180)).toBe(false);
  });
});

describe("parseWatchHandles", () => {
  it("normalizes handles", () => {
    expect(parseWatchHandles("@elonmusk, sama, ElonMusk")).toEqual([
      "elonmusk",
      "sama",
    ]);
  });
});

describe("keywordTopicHit", () => {
  it("passes funding posts", () => {
    const r = keywordTopicHit(
      "We raised a $12M Series A to build our AI agents"
    );
    expect(r.pass).toBe(true);
    expect(r.topics).toContain("funding");
  });

  it("passes bare AI / LLM / Solana / YC posts from anyone", () => {
    expect(keywordTopicHit("new LLM just dropped, crazy evals").pass).toBe(
      true
    );
    expect(keywordTopicHit("shipping on Solana this week").pass).toBe(true);
    expect(keywordTopicHit("got into YC W26 somehow").pass).toBe(true);
    expect(
      keywordTopicHit("founders: stop building demos, ship distribution").pass
    ).toBe(true);
  });

  it("passes tech posts like leetcode", () => {
    const r = keywordTopicHit(
      "Working from Blr. Metro is a whole another vibe! grinding leetcode Two Sum"
    );
    expect(r.pass).toBe(true);
  });

  it("rejects unrelated posts", () => {
    const r = keywordTopicHit("What a beautiful sunset today");
    expect(r.pass).toBe(false);
  });

  it("rejects job/hiring posts", () => {
    expect(isJobPost("We're hiring a senior AI engineer. Apply now.")).toBe(
      true
    );
    expect(keywordTopicHit("We're hiring Rust engineers #hiring").pass).toBe(
      false
    );
  });
});

describe("pickToneForPost", () => {
  it("prefers joking pool for meme-y posts", () => {
    const tone = pickToneForPost("lmao this AI demo is chaos 😂", () => 0);
    expect(["joking", "dry", "friendly"]).toContain(tone);
  });

  it("prefers curious pool for questions", () => {
    const tone = pickToneForPost("Anyone shipping agents in prod yet?", () => 0);
    expect(["curious", "friendly", "direct"]).toContain(tone);
  });
});

describe("parseViewCount", () => {
  it("parses K/M", () => {
    expect(parseViewCount("19.2K")).toBe(19200);
    expect(parseViewCount("20K")).toBe(20000);
    expect(parseViewCount("1.5M")).toBe(1_500_000);
    expect(parseViewCount("852")).toBe(852);
  });
});

describe("pickHighEngagement", () => {
  it("ranks by views and skips short/rt/reply", () => {
    const feed: FeedTweet[] = [
      {
        tweetId: "1",
        handle: "a",
        text: "short",
        url: "https://x.com/a/status/1",
        isRetweet: false,
        isReply: false,
        views: 100_000,
        source: "following",
      },
      {
        tweetId: "2",
        handle: "b",
        text: "This is a long enough builder take about shipping agents in production.",
        url: "https://x.com/b/status/2",
        isRetweet: false,
        isReply: false,
        views: 50_000,
        source: "timeline",
      },
      {
        tweetId: "3",
        handle: "c",
        text: "Even longer viral post about funding and product that should win ranking.",
        url: "https://x.com/c/status/3",
        isRetweet: false,
        isReply: false,
        views: 200_000,
        source: "following",
      },
      {
        tweetId: "4",
        handle: "d",
        text: "Repost of something viral that we should ignore completely here.",
        url: "https://x.com/d/status/4",
        isRetweet: true,
        isReply: false,
        views: 999_000,
        source: "timeline",
      },
    ];
    const top = pickHighEngagement(feed, { minViews: 10_000, limit: 2 });
    expect(top.map((t) => t.tweetId)).toEqual(["3", "2"]);
  });
});

describe("normalizeTweetUrl", () => {
  it("strips /analytics paths", async () => {
    const { normalizeTweetUrl } = await import("../src/engage/discover.js");
    expect(
      normalizeTweetUrl(
        "https://x.com/kapso_com/status/2067287959615709213/analytics"
      )
    ).toBe("https://x.com/kapso_com/status/2067287959615709213");
  });
});
