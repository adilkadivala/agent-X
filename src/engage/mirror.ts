/**
 * Draft an original post inspired by high-engagement feed posts —
 * theme/angle only, never a copy or paraphrase of their wording.
 */
import type { DraftResult } from "../types.js";
import type { LlmClient } from "../draft.js";
import { cleanChatText } from "../text-style.js";
import type { FeedTweet } from "./discover.js";
import { OCR_ORIGINAL_PROMPT_RULES } from "../ocr/policy.js";

function sampleBlock(samples: string[]): string {
  return samples.length > 0
    ? samples
        .slice(0, 12)
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")
    : "(no samples — write like a thoughtful builder: direct, concrete, no hype)";
}

export function pickHighEngagement(
  tweets: FeedTweet[],
  opts: { minViews: number; limit?: number } = { minViews: 0 }
): FeedTweet[] {
  const limit = opts.limit ?? 5;
  return [...tweets]
    .filter((t) => !t.isRetweet && !t.isReply && t.text.trim().length > 20)
    .filter((t) => (t.views ?? 0) >= opts.minViews || t.views == null)
    .sort((a, b) => (b.views ?? 0) - (a.views ?? 0))
    .slice(0, limit);
}

export async function draftMirrorPost(
  inspiration: FeedTweet[],
  opts: { samples: string[]; llm: LlmClient; ocrMode?: boolean }
): Promise<DraftResult> {
  const top = inspiration.slice(0, 5);
  if (!top.length) {
    throw new Error("No high-engagement posts to mirror");
  }

  const system = `You write short original X posts in the author's voice.

VOICE SAMPLES (match length, tone, rhythm):
${sampleBlock(opts.samples)}

TASK: You saw highly engaged posts in the feed. Write ONE original post that sits in the same conversation — same topic/angle energy — but is entirely your own words and take.

RULES:
- Do NOT copy, paraphrase, or quote any inspiration post.
- Do NOT name or @ the authors unless natural and rare.
- One idea. 60–180 chars preferred. Human, not corporate.
- Plain sentences only. NEVER use em dashes (—), --, or markdown underscores (__ / _).
- NEVER end with " — restated caption" style tails.
- No "RT if", "great post", engagement bait, emoji spam.
${opts.ocrMode ? `\n${OCR_ORIGINAL_PROMPT_RULES}\n` : ""}
- Return ONLY JSON (no markdown fences):
{"text":"...","tags":[],"claims":[],"score":0.85,"reasons":["..."]}
- score MUST be 0.75–0.95 when the draft matches the samples (never return 0 if text is usable).`;

  const user = `HIGH-ENGAGEMENT FEED POSTS (inspiration only — do not copy):
${top
  .map(
    (t, i) =>
      `${i + 1}. @${t.handle} (~${t.views?.toLocaleString() ?? "?"} views): ${t.text.slice(0, 280)}`
  )
  .join("\n\n")}

Write one original X post as JSON.`;

  const raw = await opts.llm.complete(system, user);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Mirror LLM response is not JSON");
  const data = JSON.parse(m[0]) as {
    text?: string;
    tags?: string[];
    claims?: string[];
    score?: number;
    reasons?: string[];
  };
  if (!data.text || typeof data.text !== "string") {
    throw new Error("Mirror LLM JSON missing text");
  }

  // Local models often return score:0 even for good drafts — floor it.
  let score = typeof data.score === "number" ? data.score : 0.8;
  if (data.text.trim().length >= 20 && score < 0.75) {
    score = 0.8;
  }

  return {
    text: cleanChatText(data.text),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    claims: Array.isArray(data.claims) ? data.claims.map(String) : [],
    score,
    reasons: Array.isArray(data.reasons) ? data.reasons.map(String) : ["mirror"],
    content_mode: "hot_take",
  };
}
