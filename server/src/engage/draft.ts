import type { LlmClient } from "../draft.js";
import { cleanChatText } from "../text-style.js";
import { hasClearEngageableText } from "./quality.js";
import { isJobPost } from "./topics.js";
import type { EngageDraft, EngageKind, WatchedTweet } from "./types.js";

export type EngageSkip = { skip: true; reason: string };
export type EngageDraftResult = EngageDraft | EngageSkip;

export type EngageTone =
  | "friendly"
  | "insightful"
  | "direct"
  | "deep"
  | "joking"
  | "curious"
  | "dry";

export function isEngageSkip(r: EngageDraftResult): r is EngageSkip {
  return (r as EngageSkip).skip === true;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM response is not JSON");
    return JSON.parse(match[0]);
  }
}

/** Pick a tone that fits the post's vibe (not always the same lecture mode). */
export function pickToneForPost(text: string, random = Math.random): EngageTone {
  const t = text || "";
  const pool: EngageTone[] = [];

  if (/[😂🤣😭💀]|lmao|lol|haha|joke|meme|shitpost/i.test(t)) {
    pool.push("joking", "dry", "friendly");
  } else if (/\?|anyone|how do|what if|thoughts|curious|wonder/i.test(t)) {
    pool.push("curious", "friendly", "direct");
  } else if (/shipped|launched|built|just dropped|v1|open.?source|demo/i.test(t)) {
    pool.push("friendly", "direct", "insightful");
  } else if (/hot take|unpopular|honestly|stop |never |always |wrong/i.test(t)) {
    pool.push("direct", "dry", "joking");
  } else if (/lesson|realized|deep|hard truth|years of|eventually/i.test(t)) {
    pool.push("deep", "insightful", "curious");
  } else if (/congrats|raised|funded|hired|milestone|proud/i.test(t)) {
    pool.push("friendly", "insightful", "direct");
  } else {
    pool.push("insightful", "friendly", "direct", "deep", "dry", "curious", "joking");
  }

  return pool[Math.floor(random() * pool.length)] || "insightful";
}

const TONE_GUIDE: Record<EngageTone, string> = {
  friendly: "Warm peer energy. Sound like a builder chatting, not a coach.",
  insightful: "One sharp non-obvious angle. Light, not a TED talk.",
  direct: "Blunt and short. No soft padding.",
  deep: "Quiet substance. One layered thought, still short.",
  joking: "Dry wit or playful jab. Never mean, never try-hard.",
  curious: "A real question or wonder. Not interview bait.",
  dry: "Deadpan understatement. Minimal words.",
};

/**
 * Draft a reply or quote for a feed tweet — intelligent, in-voice, not sycophantic.
 * Returns skip when the target is unclear (no like/reply/quote).
 */
export async function draftEngage(
  tweet: WatchedTweet,
  opts: {
    samples: string[];
    llm: LlmClient;
    prefer?: EngageKind | "auto";
    /** Extra context: following | notifications | timeline */
    source?: string;
    random?: () => number;
  }
): Promise<EngageDraftResult> {
  if (isJobPost(tweet.text)) {
    return { skip: true, reason: "job_post: skip engage" };
  }

  // Hard skip before spending tokens: empty / emoji-only / media placeholders
  if (!hasClearEngageableText(tweet.text)) {
    return {
      skip: true,
      reason: "unclear_or_media_only: keep scrolling",
    };
  }

  const samples =
    opts.samples.length > 0
      ? opts.samples
          .slice(0, 10)
          .map((s, i) => `${i + 1}. ${s}`)
          .join("\n")
      : "(short, punchy builder voice)";

  const prefer = opts.prefer || "auto";
  const fromFollowing = opts.source === "following";
  const forcedKind: EngageKind | null =
    fromFollowing || prefer === "quote"
      ? "quote"
      : prefer === "reply"
        ? "reply"
        : null;

  const tone = pickToneForPost(tweet.text, opts.random || Math.random);

  const system = `You engage on X as a real builder in the feed — not a lecturer, not a fan account.

VOICE SAMPLES (rhythm/personality only):
${samples}

GOAL: ${forcedKind === "quote" ? "QUOTE their post with a take that matches their intention." : "Reply or quote matching their intention."}

POST INTENT → match it. Do not lecture over a joke. Do not joke over a serious ship note.
TONES YOU MAY USE (pick ONE that fits; this cycle prefers: ${tone}):
- friendly: ${TONE_GUIDE.friendly}
- insightful: ${TONE_GUIDE.insightful}
- direct: ${TONE_GUIDE.direct}
- deep: ${TONE_GUIDE.deep}
- joking: ${TONE_GUIDE.joking}
- curious: ${TONE_GUIDE.curious}
- dry: ${TONE_GUIDE.dry}

Rules:
- Read THEIR post carefully. Your text must specifically address what they said.
- Prefer tone "${tone}" unless another tone clearly fits better; say which tone you used.
- NEVER lecture, preach, mansplain, or write "the real lesson is…". Talk like a peer.
- Vary style across posts. Do not always sound like a LinkedIn insight.
- If unclear, empty, emoji-only, media-only, job/hiring, or you cannot address it: return SKIP.
- Length: 60–180 characters MAX. One clear idea.
- Write plain sentences. Use periods or commas only.
- NEVER use em dashes (—), en dashes (–), double hyphens (--), or markdown underscores (__bold__ / _italic_).
- NEVER append a caption after a dash.
- NEVER: "Great post!", "So true!", "Amazing!", "Congrats!", "This!", follow-begs, product plugs, hashtag spam, emoji spam.
- NEVER solicit likes, follows, RTs, bookmarks, or replies.
- NEVER invent facts they didn't say.
- NEVER write meta text like "I'm unable to view…".
${forcedKind === "quote" ? '- Action MUST be "quote", OR skip.' : forcedKind === "reply" ? '- Action MUST be "reply", OR skip.' : '- Pick "reply" or "quote", OR skip.'}
- Return ONLY JSON (no markdown fences). Either:
{"skip":true,"reason":"unclear"}
OR
{"kind":"reply"|"quote","tone":"${tone}","text":"...","score":0.85,"reasons":["..."],"rationale":"intent + why this tone"}
- score MUST be 0.75–0.95 when the take is usable.`;

  const user = `SOURCE: ${opts.source || "feed"}
TARGET @${tweet.handle}
PREFERRED TONE: ${tone}
THEIR POST:
"""
${tweet.text}
"""
URL: ${tweet.url}

Match their intention. Write a ${forcedKind || "reply/quote"} as JSON (or skip).`;

  const raw = await opts.llm.complete(system, user);
  const data = extractJson(raw) as {
    skip?: boolean;
    reason?: string;
    kind?: string;
    tone?: string;
    text?: string;
    score?: number;
    reasons?: string[];
    rationale?: string;
  };

  if (data.skip === true) {
    return {
      skip: true,
      reason: String(data.reason || "llm_skip_unclear"),
    };
  }

  let kind: EngageKind =
    data.kind === "quote" || data.kind === "reply"
      ? data.kind
      : forcedKind || "quote";

  if (fromFollowing || prefer === "quote") {
    kind = "quote";
  }

  if (!data.text || typeof data.text !== "string") {
    return { skip: true, reason: "draft_missing_text" };
  }

  const text = cleanChatText(data.text);
  if (
    /\b(unable to|can'?t (view|see|generate)|cannot (view|see|generate)|i'?m unable)\b/i.test(
      text
    )
  ) {
    return { skip: true, reason: "meta_refusal_draft" };
  }
  if (
    /\b(the real (lesson|truth|point) is|what you('?re| are) missing|you need to understand|let me explain|pro tip:|here'?s why you'?re wrong)\b/i.test(
      text
    )
  ) {
    return { skip: true, reason: "lecture_tone" };
  }

  let score = typeof data.score === "number" ? data.score : 0.8;
  if (text.length >= 20 && score < 0.75) score = 0.82;

  const usedTone = String(data.tone || tone);
  return {
    kind,
    text,
    score,
    reasons: Array.isArray(data.reasons)
      ? data.reasons.map(String)
      : [`tone:${usedTone}`],
    rationale: String(data.rationale || `tone=${usedTone}`),
  };
}
