/**
 * Human-like content mix: pick WHAT kind of post to make, then gather fuel.
 *
 * Modes (weights configurable via MODE_WEIGHTS):
 *   tech_news   — react to AI/tech headlines (+ optional article image)
 *   hot_take    — pure opinion, no link required
 *   meme        — short joke / relatable humor (+ optional meme image)
 *   screenshot  — caption a local screenshot/build photo
 *   ship_note   — first-person inbox / build note
 *   question    — genuine builder question (not engagement bait)
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ContentMode, SourceItem } from "./types.js";

export type ModeWeights = Record<ContentMode, number>;

export const DEFAULT_MODE_WEIGHTS: ModeWeights = {
  tech_news: 35,
  hot_take: 25,
  meme: 15,
  screenshot: 10,
  ship_note: 10,
  question: 5,
  pdf_deep: 0,
};

export function parseModeWeights(raw: string | undefined): ModeWeights {
  const base = { ...DEFAULT_MODE_WEIGHTS };
  if (!raw?.trim()) return base;
  for (const part of raw.split(",")) {
    const [k, v] = part.split("=").map((s) => s.trim());
    if (!k || v === undefined) continue;
    if (k in base) {
      const n = Number(v);
      if (Number.isFinite(n) && n >= 0) {
        (base as Record<string, number>)[k] = n;
      }
    }
  }
  return base;
}

const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export function listLocalImages(dir: string): string[] {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()))
    .map((f) => path.join(dir, f))
    .sort();
}

function hashId(s: string): string {
  return crypto.createHash("sha256").update(s).digest("hex").slice(0, 32);
}

/** Build a source item for a local image (screenshot / meme asset). */
export function sourceFromLocalImage(
  filePath: string,
  kind: "screenshot" | "meme"
): SourceItem {
  const base = path.basename(filePath);
  const name = base.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ");
  return {
    id: hashId(`localimg:${filePath}`),
    source_type: "local_media",
    title: name || base,
    imageUrl: undefined,
    localImagePath: filePath,
    facts: [
      kind === "screenshot"
        ? `Local screenshot/build image: ${base}`
        : `Local meme/image asset: ${base}`,
      name ? `Subject hint: ${name}` : "No filename hint",
    ],
    raw: { filePath, kind },
    fetched_at: new Date().toISOString(),
  };
}

/** Synthetic spark for opinion modes (optional news title). */
export function syntheticSparkSource(
  mode: ContentMode,
  spark?: { title?: string; url?: string; facts?: string[] }
): SourceItem {
  const title = spark?.title || "general AI / building software";
  return {
    id: hashId(`spark:${mode}:${title}:${Date.now().toString().slice(0, -5)}`),
    source_type: "spark",
    title,
    url: spark?.url,
    facts: spark?.facts?.length
      ? spark.facts
      : [
          `Mode: ${mode}`,
          `Topic spark: ${title}`,
          "Write in the author's own voice — no news blurb.",
        ],
    raw: { mode, spark },
    fetched_at: new Date().toISOString(),
  };
}

export type PickModeInput = {
  weights: ModeWeights;
  /** Last modes used (most recent first) — avoid repeats */
  recentModes: ContentMode[];
  available: {
    hasNews: boolean;
    hasInbox: boolean;
    hasScreenshots: boolean;
    hasMemeImages: boolean;
  };
  /** Local hour 0–23 */
  hour: number;
  random?: () => number;
};

/**
 * Weighted mode pick with human constraints:
 * - never same mode as last post
 * - drop modes with no fuel
 * - light time-of-day bias
 */
export function pickContentMode(input: PickModeInput): ContentMode {
  const rnd = input.random ?? Math.random;
  const w = { ...input.weights };

  if (!input.available.hasNews) w.tech_news = 0;
  if (!input.available.hasInbox) w.ship_note = 0;
  if (!input.available.hasScreenshots) w.screenshot = 0;
  // meme works as text even without images
  if (!input.available.hasMemeImages) {
    // keep meme, but don't require image
  }
  // pdf_deep is a separate loop — never pick via normal mode mix
  w.pdf_deep = 0;

  // Time-of-day nudges (still random overall)
  if (input.hour >= 9 && input.hour < 12) {
    w.tech_news *= 1.3;
    w.hot_take *= 1.1;
  } else if (input.hour >= 18 && input.hour < 23) {
    w.meme *= 1.4;
    w.question *= 1.2;
    w.hot_take *= 1.2;
  } else if (input.hour >= 12 && input.hour < 18) {
    w.ship_note *= 1.2;
    w.screenshot *= 1.2;
  }

  // Avoid last 1–2 modes
  const banned = new Set(input.recentModes.slice(0, 2));
  for (const m of banned) {
    if (w[m] !== undefined) w[m] *= 0.08;
  }

  const entries = (Object.entries(w) as [ContentMode, number][]).filter(
    ([, n]) => n > 0
  );
  if (!entries.length) {
    // Absolute fallback
    if (input.available.hasNews) return "tech_news";
    return "hot_take";
  }

  const total = entries.reduce((s, [, n]) => s + n, 0);
  let r = rnd() * total;
  for (const [mode, weight] of entries) {
    r -= weight;
    if (r <= 0) return mode;
  }
  return entries[entries.length - 1][0];
}

export function modeLabel(mode: ContentMode): string {
  const map: Record<ContentMode, string> = {
    tech_news: "tech news reaction",
    hot_take: "hot take (no link)",
    meme: "meme / humor",
    screenshot: "screenshot + caption",
    ship_note: "ship / build note",
    question: "genuine question",
    pdf_deep: "PDF deep post (long + thumbnail)",
  };
  return map[mode] || mode;
}
