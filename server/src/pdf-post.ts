/**
 * Independent PDF deep-post cycle:
 *   pick unused PDF → ≥2 page thumbs → scannable emoji-line draft → publish
 *
 * Format target (viral X style):
 *   short hook lines
 *   blank line between beats
 *   ✅ each point on its own line
 *   KEY WORDS in CAPS for highlight
 *   ≥2 images attached
 */
import type { AppConfig } from "./config.js";
import type { Db } from "./db.js";
import {
  hasPostedSource,
  insertPost,
  updatePost,
  insertRunLog,
  upsertSource,
  pdfPostsToday,
  lastPdfPostedAt,
} from "./db.js";
import type { LlmClient } from "./draft.js";
import { loadVoiceSamples } from "./draft.js";
import type { AgentSession } from "./publisher.js";
import type { DraftResult, QualityResult, RunResult } from "./types.js";
import { pickPdfDeep } from "./sources/pdf-deep.js";
import {
  ocrOriginalPostBlockReason,
} from "./ocr/eligibility.js";
import { ocrContentViolations } from "./ocr/policy.js";
import { trackPostImpressions } from "./ocr/impressions.js";

export type PdfPostDeps = {
  cfg: AppConfig;
  db: Db;
  llm: LlmClient;
  session?: AgentSession;
  publish?: (
    text: string,
    opts: {
      imagePaths?: string[];
      communityId?: string;
      communityName?: string;
    }
  ) => Promise<import("./types.js").PublishResult>;
  now?: () => Date;
  random?: () => number;
};

const EMOJI_BULLET_RE = /^[\s]*(✅|☑️|✔️|🔹|▪️|•|→|➜|★|📌|💡|🔥|⚡)/u;

function wordCount(text: string): number {
  return text
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function sampleBlock(samples: string[]): string {
  return samples.length > 0
    ? samples
        .slice(0, 8)
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")
    : "(direct builder voice — concrete, no corporate fluff)";
}

/** Count non-empty lines. */
export function lineCount(text: string): number {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean).length;
}

export function emojiBulletCount(text: string): number {
  return text
    .split(/\n/)
    .filter((l) => EMOJI_BULLET_RE.test(l.trim())).length;
}

/**
 * Light cleanup: normalize newlines, ensure blank line before emoji list.
 * Does not invent content.
 */
export function polishPdfFormat(text: string): string {
  let t = text.replace(/\r\n/g, "\n").trim();
  // Collapse 3+ blank lines → 1 blank
  t = t.replace(/\n{3,}/g, "\n\n");
  // Ensure emoji bullets sit on their own line (fix "foo ✅ bar" mid-line leftovers)
  t = t.replace(/([.!?])\s+(✅)/g, "$1\n\n$2");
  return t.trim();
}

export async function draftPdfDeepPost(
  title: string,
  excerpt: string,
  opts: { samples: string[]; llm: LlmClient; wordMin: number; wordMax: number }
): Promise<DraftResult> {
  const system = `You write HIGHLY SCANNABLE X (Twitter) posts from technical PDF notes.

VOICE (tone only — IGNORE sample length; this post uses short lines):
${sampleBlock(opts.samples)}

TARGET FORMAT (match this structure EXACTLY — this is non-negotiable):

Hook line one

Hook line two (contrast / tension)

One short context sentence why it matters

Label line (e.g. "What actually matters:" or "Inside you'll learn")

✅ Point one — short
✅ Point two — short
✅ Point three — short
✅ Point four — short
✅ Point five — short
✅ Point six — short

Closing line with the KEY takeaway

RULES:
- EVERY point starts on a NEW LINE. Never pack (1)(2)(3) into one paragraph.
- Use ✅ before each bullet. Minimum 6 bullets, maximum 10.
- Each ✅ line: 3–10 words max. Like "Python Fundamentals" / "RAG Systems" — NOT a full sentence essay.
- Put 3–6 KEY WORDS OR PHRASES in CAPS for emphasis (e.g. WRONG TOOL, DENSE REWARD, PRODUCTION).
- Blank line between hook / context / list / closing.
- NO wall-of-text paragraphs. Max ~12 words on any non-bullet line.
- Length ~${opts.wordMin}–${opts.wordMax} words total (short lines still add up).
- Teach one sharp idea from the PDF — not a TOC dump, not a book summary.
- Do NOT invent fake giveaways, "follow me", RT, or "comment X".
- No hashtag spam.
- Return ONLY JSON:
{"text":"line1\\n\\nline2\\n\\n...","tags":[],"claims":[],"score":0.85,"reasons":["scannable"]}
- Put real newlines inside the JSON string as \\n.`;

  const user = `PDF TITLE: ${title}

EXCERPT:
"""
${excerpt.slice(0, 6000)}
"""

Write a scannable emoji-line X post as JSON (newlines via \\n).`;

  const raw = await opts.llm.complete(system, user);
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("PDF deep LLM response is not JSON");
  const data = JSON.parse(m[0]) as {
    text?: string;
    tags?: string[];
    claims?: string[];
    score?: number;
    reasons?: string[];
  };
  if (!data.text || typeof data.text !== "string") {
    throw new Error("PDF deep LLM JSON missing text");
  }

  let score = typeof data.score === "number" ? data.score : 0.85;
  const polished = polishPdfFormat(data.text);
  if (polished.length > 80 && score < 0.75) score = 0.82;

  return {
    text: polished,
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    claims: Array.isArray(data.claims) ? data.claims.map(String) : [],
    score,
    reasons: Array.isArray(data.reasons)
      ? data.reasons.map(String)
      : ["pdf_deep"],
    content_mode: "pdf_deep",
  };
}

export function scorePdfDeepDraft(
  draft: DraftResult,
  opts: {
    bannedPhrases: string[];
    threshold: number;
    wordMin: number;
    wordMax: number;
  }
): QualityResult {
  const text = polishPdfFormat(draft.text);
  const reasons = [...draft.reasons, "mode:pdf_deep"];
  const words = wordCount(text);
  const lines = lineCount(text);
  const bullets = emojiBulletCount(text);

  if (words < Math.max(50, opts.wordMin - 50)) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, `too short (${words} words)`],
      text,
    };
  }
  if (words > opts.wordMax + 50) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, `too long (${words} > ${opts.wordMax} words)`],
      text,
    };
  }

  if (lines < 8) {
    return {
      pass: false,
      score: draft.score,
      reasons: [
        ...reasons,
        `not scannable — only ${lines} lines (need ≥8 short lines)`,
      ],
      text,
    };
  }

  if (bullets < 4) {
    return {
      pass: false,
      score: draft.score,
      reasons: [
        ...reasons,
        `need emoji bullets on own lines (found ${bullets}, want ≥4)`,
      ],
      text,
    };
  }

  // Reject classic wall-of-text: any single line > 140 chars without emoji
  const longPlain = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 140 && !EMOJI_BULLET_RE.test(l));
  if (longPlain.length >= 2) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, "wall-of-text lines — break into short lines"],
      text,
    };
  }

  // Emoji bullets should stay punchy (viral style), not mini-paragraphs
  const longBullets = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => EMOJI_BULLET_RE.test(l) && wordCount(l) > 14);
  if (longBullets.length >= 3) {
    return {
      pass: false,
      score: draft.score,
      reasons: [
        ...reasons,
        "emoji bullets too long — keep each ✅ line under ~10 words",
      ],
      text,
    };
  }

  // Prefer some CAPS highlights
  const capsHits = (text.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})*\b/g) || []).filter(
    (w) => !["AI", "RL", "LLM", "RAG", "API", "PDF", "ML"].includes(w)
  );
  if (capsHits.length < 2) {
    reasons.push("weak highlights (want more KEY WORDS in CAPS)");
    // soft — don't fail solely on this if format is otherwise good
  } else {
    reasons.push(`${capsHits.length} caps highlights`);
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

  if (
    /\b(rt if|follow for more|link in bio|comment\s+[\"']?\w+|first \d+ people)\b/i.test(
      text
    )
  ) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, "engagement bait / giveaway spam"],
      text,
    };
  }

  const ocrHits = ocrContentViolations(text);
  if (ocrHits.length) {
    return {
      pass: false,
      score: draft.score,
      reasons: [...reasons, ...ocrHits],
      text,
    };
  }

  const threshold = Math.min(opts.threshold, 0.72);
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
    reasons: [
      ...reasons,
      `${words} words`,
      `${lines} lines`,
      `${bullets} emoji bullets`,
    ],
    text,
  };
}

export async function runPdfPostOnce(deps: PdfPostDeps): Promise<RunResult> {
  const now = deps.now?.() ?? new Date();
  const started = now.toISOString();
  const { cfg, db, llm } = deps;
  const random = deps.random ?? Math.random;

  if (!cfg.PDF_POST_ENABLED) {
    return "noop";
  }
  if (!cfg.pdfDirs.length) {
    console.log("pdf-deep: PDF_DIRS empty");
    return "noop";
  }

  const ocrBlock = ocrOriginalPostBlockReason(cfg, db);
  if (ocrBlock) {
    console.log("pdf-deep: skip —", ocrBlock);
    return "noop";
  }

  const today = pdfPostsToday(db, cfg.TZ);
  if (today >= cfg.PDF_DAILY_MAX && !cfg.DRY_RUN) {
    console.log(`pdf-deep: daily cap ${today}/${cfg.PDF_DAILY_MAX}`);
    return "noop";
  }

  if (!cfg.DRY_RUN && !cfg.FORCE_RUN && cfg.PDF_MIN_GAP_MINUTES > 0) {
    const last = lastPdfPostedAt(db);
    if (last) {
      const gapMs = cfg.PDF_MIN_GAP_MINUTES * 60 * 1000;
      const elapsed = now.getTime() - new Date(last).getTime();
      if (elapsed < gapMs) {
        const wait = Math.ceil((gapMs - elapsed) / 60_000);
        console.log(`pdf-deep: min gap — wait ~${wait}m`);
        return "noop";
      }
    }
  }

  let picked;
  try {
    picked = await pickPdfDeep({
      dirs: cfg.pdfDirs,
      cacheDir: cfg.MEDIA_CACHE_DIR,
      hasPosted: (id) => hasPostedSource(db, id),
      random,
      imageCount: 2,
    });
  } catch (err) {
    insertRunLog(db, {
      started_at: started,
      result: "error",
      error: (err as Error).message,
    });
    console.error("pdf-deep pick failed:", (err as Error).message);
    return "error";
  }

  if (!picked) {
    console.log("pdf-deep: no unused PDFs left in configured dirs");
    insertRunLog(db, {
      started_at: started,
      result: "noop",
      detail: "no_unused_pdfs",
    });
    return "noop";
  }

  upsertSource(db, picked.source);
  console.log(
    `pdf-deep: ${picked.source.title} → ${picked.imagePaths.length} images`
  );

  const samples = loadVoiceSamples(cfg.VOICE_SAMPLES_PATH);
  const excerpt =
    picked.source.facts.find((f) => f.startsWith("Excerpt:")) || "";
  let draft: DraftResult;
  let quality: QualityResult | null = null;
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      draft = await draftPdfDeepPost(picked.source.title || "PDF", excerpt, {
        samples,
        llm,
        wordMin: cfg.PDF_WORD_MIN,
        wordMax: cfg.PDF_WORD_MAX,
      });
      quality = scorePdfDeepDraft(draft, {
        bannedPhrases: cfg.bannedPhrases,
        threshold: cfg.VOICE_THRESHOLD,
        wordMin: cfg.PDF_WORD_MIN,
        wordMax: cfg.PDF_WORD_MAX,
      });
      if (quality.pass) break;
      console.log(
        `pdf-deep: draft attempt ${attempt} failed —`,
        quality.reasons.join("; ")
      );
    }
  } catch (err) {
    insertRunLog(db, {
      started_at: started,
      result: "error",
      error: (err as Error).message,
    });
    return "error";
  }

  if (!quality || !quality.pass) {
    insertPost(db, {
      source_id: picked.source.id,
      draft: quality?.text || draft!.text,
      score: quality?.score ?? draft!.score,
      score_reasons: quality?.reasons || draft!.reasons,
      status: "rejected",
      content_mode: "pdf_deep",
    });
    insertRunLog(db, {
      started_at: started,
      result: "quality_fail",
      detail: (quality?.reasons || []).join("; "),
    });
    console.log(
      "pdf-deep: quality fail —",
      (quality?.reasons || []).join("; ")
    );
    return "quality_fail";
  }

  const postId = insertPost(db, {
    source_id: picked.source.id,
    draft: quality.text,
    score: quality.score,
    score_reasons: quality.reasons,
    status: "pending",
    content_mode: "pdf_deep",
  });

  const images = picked.imagePaths.slice(0, 4);
  if (images.length < 2) {
    console.warn("pdf-deep: fewer than 2 images — posting with what we have");
  }

  if (cfg.DRY_RUN) {
    updatePost(db, postId, {
      status: "rejected",
      score_reasons: [...quality.reasons, "dry_run"],
    });
    insertRunLog(db, {
      started_at: started,
      result: "dry_run",
      detail: `[pdf_deep] ${quality.text.slice(0, 180)}`,
    });
    const audienceLabel =
      cfg.OCR_MODE && cfg.OCR_PDF_TO_TIMELINE
        ? "timeline (OCR)"
        : `community "${cfg.PDF_COMMUNITY_NAME || cfg.PDF_COMMUNITY_ID || "public"}"`;
    console.log(
      `[DRY_RUN] pdf_deep → ${audienceLabel} (${wordCount(quality.text)} words, ${lineCount(quality.text)} lines, ${emojiBulletCount(quality.text)} bullets):\n\n${quality.text}\n\n… with ${images.length} images:\n${images.map((p) => `  - ${p}`).join("\n")}`
    );
    return "dry_run";
  }

  const publish =
    deps.publish ??
    (deps.session
      ? (
          text: string,
          o: {
            imagePaths?: string[];
            communityId?: string;
            communityName?: string;
          }
        ) => deps.session!.post(text, o)
      : null);

  if (!publish) {
    updatePost(db, postId, { status: "failed" });
    insertRunLog(db, {
      started_at: started,
      result: "error",
      error: "no publisher/session",
    });
    return "error";
  }

  const communityId = (cfg.PDF_COMMUNITY_ID || "").trim();
  const communityName = (cfg.PDF_COMMUNITY_NAME || "").trim() || "Build in Public";
  // OCR qualified impressions are Home Timeline only — community posts won't earn them.
  const useCommunity =
    Boolean(communityId || communityName) &&
    !(cfg.OCR_MODE && cfg.OCR_PDF_TO_TIMELINE);

  if (cfg.OCR_MODE && cfg.OCR_PDF_TO_TIMELINE) {
    console.log(
      "pdf-deep: OCR_PDF_TO_TIMELINE — posting to main timeline (Everyone), not community"
    );
  } else if (useCommunity) {
    console.log(
      `pdf-deep: posting to community "${communityName}"${communityId ? ` (${communityId})` : ""}`
    );
  }

  const result = await publish(quality.text, {
    imagePaths: images,
    communityId: useCommunity ? communityId || undefined : undefined,
    communityName: useCommunity ? communityName || undefined : undefined,
  });

  if (result.ok) {
    updatePost(db, postId, {
      status: "posted",
      tweet_id: result.tweetId ?? result.tweetUrl ?? null,
    });
    const audience = useCommunity
      ? `community=${communityName || communityId}`
      : "timeline";
    insertRunLog(db, {
      started_at: started,
      result: "posted",
      detail: `pdf_deep ${audience} ${picked.source.title} (${images.length} imgs)`,
    });
    console.log(
      "pdf-deep: posted to",
      useCommunity ? communityName : "timeline",
      result.tweetUrl || result.tweetId || "ok",
      `(${wordCount(quality.text)} words, ${images.length} images)`
    );
    if (deps.session) {
      const idOrUrl = result.tweetUrl || result.tweetId;
      if (idOrUrl) {
        await trackPostImpressions(deps.session.page, cfg, db, {
          postId,
          tweetIdOrUrl: idOrUrl,
        });
      }
      await deps.session.goHome().catch(() => undefined);
    }
    return "posted";
  }

  updatePost(db, postId, { status: "failed" });
  insertRunLog(db, {
    started_at: started,
    result: "error",
    error: `${result.kind}: ${result.message}`,
  });
  console.error("pdf-deep publish failed:", result.kind, result.message);
  return "error";
}
