import type { EngageDraft, WatchedTweet } from "./types.js";
import { cleanChatText } from "../text-style.js";
import { ocrContentViolations } from "../ocr/policy.js";

export type EngageQuality = {
  pass: boolean;
  text: string;
  reasons: string[];
  score: number;
};

const BAIT =
  /\b(great post|so true|amazing|congrats|love this|following you|check (out )?my|link in bio|dm me|guaranteed)\b/i;

const LECTURE =
  /\b(the real (lesson|truth|point) is|what you('?re| are) missing|you need to understand|let me explain|pro tip:|here'?s why you'?re wrong)\b/i;

/** LLM meta-refuse / "I can't see the post" — never ship this. */
const META_REFUSAL =
  /\b(unable to (view|see|access|read|generate)|can'?t (view|see|access|read|generate|quote)|cannot (view|see|access|read|generate|quote)|don'?t (have|see) (enough|the|any)|no (visible |clear )?content|linked post|as an ai|i'?m unable|i am unable|without (seeing|viewing|access)|media[- ]only|can'?t tell what)\b/i;

/**
 * True only when the scraped post has enough clear text to quote/reply on.
 * Emoji-only, empty, or media-placeholder posts → skip (no like/reply/quote).
 */
export function hasClearEngageableText(text: string): boolean {
  const raw = (text || "").trim();
  if (!raw) return false;
  if (/^\(media/i.test(raw)) return false;
  if (META_REFUSAL.test(raw)) return false;

  const withoutEmoji = raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/@\w+/g, " ")
    .replace(/#\w+/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/[\u200d\ufe0f]/g, " ");

  const words = withoutEmoji
    .replace(/[^\p{L}\p{N}\s'.!?,-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (words.length < 3) return false;
  if (words.join(" ").length < 12) return false;
  return true;
}

/**
 * Hard gate for reply/quote drafts.
 */
export function scoreEngageDraft(
  draft: EngageDraft,
  tweet: WatchedTweet,
  opts: { threshold: number; bannedPhrases: string[] }
): EngageQuality {
  const reasons = [...draft.reasons];
  let text = cleanChatText(draft.text);

  if (!text) {
    return { pass: false, text: "", reasons: ["empty"], score: 0 };
  }
  if (META_REFUSAL.test(text)) {
    return {
      pass: false,
      text,
      reasons: [...reasons, "meta_refusal: unclear target — do not ship"],
      score: 0,
    };
  }
  if (!hasClearEngageableText(tweet.text)) {
    return {
      pass: false,
      text,
      reasons: [...reasons, "target_unclear: skip engage"],
      score: 0,
    };
  }
  if (text.length > 280) {
    return {
      pass: false,
      text,
      reasons: [...reasons, `too long (${text.length})`],
      score: draft.score,
    };
  }
  if (text.length < 12) {
    return {
      pass: false,
      text,
      reasons: [...reasons, "too short"],
      score: draft.score,
    };
  }
  if (BAIT.test(text)) {
    return {
      pass: false,
      text,
      reasons: [...reasons, "sycophantic/bait phrase"],
      score: draft.score,
    };
  }
  const ocrViolations = ocrContentViolations(text);
  if (ocrViolations.length) {
    return {
      pass: false,
      text,
      reasons: [...reasons, ...ocrViolations],
      score: draft.score,
    };
  }
  if (LECTURE.test(text)) {
    return {
      pass: false,
      text,
      reasons: [...reasons, "lecture_tone"],
      score: draft.score,
    };
  }
  const lower = text.toLowerCase();
  for (const p of opts.bannedPhrases) {
    if (p && lower.includes(p.toLowerCase())) {
      return {
        pass: false,
        text,
        reasons: [...reasons, `banned: ${p}`],
        score: draft.score,
      };
    }
  }
  // Must not be a pure copy of their tweet
  if (tweet.text && text.toLowerCase() === tweet.text.toLowerCase().trim()) {
    return {
      pass: false,
      text,
      reasons: [...reasons, "copies target tweet"],
      score: draft.score,
    };
  }
  if (draft.score < opts.threshold) {
    return {
      pass: false,
      text,
      reasons: [
        ...reasons,
        `score ${draft.score} < ${opts.threshold}`,
      ],
      score: draft.score,
    };
  }
  return {
    pass: true,
    text,
    reasons: reasons.length ? reasons : ["ok"],
    score: draft.score,
  };
}

/** Only engage fresh tweets (minutes). */
export function isFreshEnough(
  tweet: WatchedTweet,
  maxAgeMinutes: number,
  now = new Date()
): boolean {
  if (maxAgeMinutes <= 0) return true;
  if (!tweet.publishedAt) {
    // Unknown age — allow but rank lower elsewhere; treat as fresh for first pass
    return true;
  }
  const t = new Date(tweet.publishedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t <= maxAgeMinutes * 60_000;
}
