import type { SourceItem } from "../types.js";

/**
 * Keep only items published within maxAgeHours (falls back to fetched_at).
 * Inbox notes are always kept (they are intentional, not news).
 */
export function filterByRecency(
  items: SourceItem[],
  opts: { maxAgeHours: number; now?: Date }
): SourceItem[] {
  if (opts.maxAgeHours <= 0) return items;
  const now = opts.now ?? new Date();
  const maxMs = opts.maxAgeHours * 60 * 60 * 1000;

  return items.filter((item) => {
    if (item.source_type === "inbox") return true;
    const stamp = item.published_at || item.fetched_at;
    const t = new Date(stamp).getTime();
    if (Number.isNaN(t)) return false;
    return now.getTime() - t <= maxMs;
  });
}

export function sortByRecency(items: SourceItem[]): SourceItem[] {
  return [...items].sort((a, b) => {
    const pa = a.published_at || a.fetched_at;
    const pb = b.published_at || b.fetched_at;
    return pb.localeCompare(pa);
  });
}
