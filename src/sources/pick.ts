import type { SourceItem } from "../types.js";
import { sortByRecency } from "./recency.js";

export type PickDeps = {
  hasPosted: (sourceId: string) => boolean;
  rejectCount24h: (sourceId: string) => number;
  /** After 3 rejects, exhaust for 48h — we approximate with rejectCount24h >= 3 */
  isExhausted?: (sourceId: string) => boolean;
  /**
   * Prefer fresh news over inbox when true (default).
   * Set false to keep classic inbox-first behavior.
   */
  preferNews?: boolean;
};

/**
 * Pick next source.
 * Default: prefer google_news/rss by publish time; inbox only if no fresh news
 * (or preferNews=false → classic inbox-first).
 */
export function pickSource(
  items: SourceItem[],
  deps: PickDeps
): SourceItem | null {
  const preferNews = deps.preferNews !== false;

  const eligible = items.filter((item) => {
    if (deps.hasPosted(item.id)) return false;
    if (deps.isExhausted?.(item.id)) return false;
    const rejects = deps.rejectCount24h(item.id);
    if (item.source_type === "inbox") {
      if (rejects >= 3) return false;
      return true;
    }
    if (rejects >= 1) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const inbox = eligible.filter((i) => i.source_type === "inbox");
  const news = eligible.filter((i) => i.source_type !== "inbox");

  let pool: SourceItem[];
  if (preferNews) {
    pool = news.length > 0 ? news : inbox;
  } else {
    pool = inbox.length > 0 ? inbox : news;
  }

  const ranked = sortByRecency(pool);
  return ranked[0] ?? null;
}
