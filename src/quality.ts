import type {
  ContentMode,
  DraftResult,
  QualityResult,
  SourceItem,
} from "./types.js";
import {
  finalizePostText,
  weightedLength,
  MAX_POST_WEIGHTED,
  extractHashtags,
  stripTrailingHashtagsAndUrls,
} from "./format.js";
import { ocrContentViolations } from "./ocr/policy.js";

export type QualityOpts = {
  bannedPhrases: string[];
  threshold: number;
  maxHashtags?: number;
  includeSourceLink?: boolean;
  mode?: ContentMode;
};

function wantsSourceLink(
  mode: ContentMode | undefined,
  includeSourceLink: boolean,
  source: SourceItem
): boolean {
  if (!includeSourceLink || !source.url) return false;
  // Opinion / humor / questions / screenshots usually post WITHOUT a news link
  if (
    mode === "hot_take" ||
    mode === "meme" ||
    mode === "question" ||
    mode === "screenshot" ||
    mode === "ship_note"
  ) {
    return false;
  }
  return source.source_type === "rss" || source.source_type === "google_news";
}

/**
 * Fail-fast quality gate:
 * 1) body sanity (empty / pure URL)
 * 2) finalize tags + source link
 * 3) length / banned / hashtag spam
 * 4) grounding for news/work claims
 * 5) voice self-score threshold
 */
export function scoreDraft(
  draft: DraftResult,
  source: SourceItem,
  opts: QualityOpts
): QualityResult {
  const reasons: string[] = [...draft.reasons];
  const maxHashtags = opts.maxHashtags ?? 3;
  const mode = opts.mode || draft.content_mode || source.content_mode;
  const attachLink = wantsSourceLink(
    mode,
    opts.includeSourceLink ?? true,
    source
  );

  const bodyOnly = stripTrailingHashtagsAndUrls(draft.text).trim();
  if (!bodyOnly) {
    return {
      pass: false,
      score: 0,
      reasons: ["empty text"],
      text: "",
    };
  }

  if (/^https?:\/\/\S+$/i.test(bodyOnly)) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, "pure URL with no commentary"],
      text: bodyOnly,
    };
  }

  const finalized = finalizePostText(draft.text, {
    maxHashtags,
    includeSourceLink: attachLink,
    sourceUrl: source.url,
    tags: draft.tags,
  });
  reasons.push(...finalized.reasons);
  if (mode) reasons.push(`mode:${mode}`);
  const text = finalized.text
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .trim();

  const wlen = weightedLength(text);
  if (wlen > MAX_POST_WEIGHTED) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, `too long (weighted ${wlen} > ${MAX_POST_WEIGHTED})`],
      text,
    };
  }

  // Opinion/meme/question: penalize mini-essays (still human-ish short)
  if (
    (mode === "hot_take" || mode === "meme" || mode === "question") &&
    bodyOnly.length > 220
  ) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, "too long for opinion/meme mode"],
      text,
    };
  }

  const tagCount = extractHashtags(text).length;
  if (tagCount > maxHashtags) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, `too many hashtags (${tagCount} > ${maxHashtags})`],
      text,
    };
  }

  const lower = text.toLowerCase();
  for (const phrase of opts.bannedPhrases) {
    if (phrase && lower.includes(phrase.toLowerCase())) {
      return {
        pass: false,
        score: draft.score,
        reasons: [...reasons, `banned phrase: ${phrase}`],
        text,
      };
    }
  }

  const ocrViolations = ocrContentViolations(text);
  if (ocrViolations.length) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, ...ocrViolations],
      text,
    };
  }

  if (attachLink && source.url && !text.includes(source.url)) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, "missing source link"],
      text,
    };
  }

  // Grounding only when claims present AND mode is factual
  const factsBlob = source.facts.join("\n").toLowerCase();
  const skipStrictGrounding =
    mode === "hot_take" || mode === "meme" || mode === "question";
  if (draft.claims.length > 0 && !skipStrictGrounding) {
    for (const claim of draft.claims) {
      const c = claim.toLowerCase().trim();
      if (!c) continue;
      const tokens = c.split(/\s+/).filter((t) => t.length > 3);
      const hit =
        factsBlob.includes(c) || tokens.some((t) => factsBlob.includes(t));
      if (!hit) {
        return {
          pass: false,
          score: draft.score,
          reasons: [...reasons, `ungrounded claim: ${claim}`],
          text,
        };
      }
    }
  }

  if (
    (source.source_type === "rss" || source.source_type === "google_news") &&
    mode === "tech_news"
  ) {
    const shipy =
      /\b(i |we )?(just )?(shipped|built|launched|released)\b/i.test(text) &&
      !/\bper\b|\bvia\b|\baccording to\b/i.test(text);
    const personalInFacts = /\b(i|we)\b/i.test(factsBlob);
    if (shipy && !personalInFacts) {
      return {
        pass: false,
        score: draft.score,
        reasons: [
          ...reasons,
          "first-person ship claim on news without attribution",
        ],
        text,
      };
    }
  }

  // Slightly lower bar for memes (humor ≠ essay voice score)
  const threshold =
    mode === "meme"
      ? Math.min(opts.threshold, 0.65)
      : mode === "hot_take" || mode === "question"
        ? Math.min(opts.threshold, 0.72)
        : opts.threshold;

  if (draft.score < threshold) {
    return {
      pass: false,
      score: draft.score,
      reasons: [
        ...reasons,
        `voice score ${draft.score} < threshold ${threshold}`,
      ],
      text,
    };
  }

  return {
    pass: true,
    score: draft.score,
    reasons: reasons.length ? reasons : ["ok"],
    text,
  };
}
