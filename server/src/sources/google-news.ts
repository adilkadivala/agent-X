/**
 * Google News RSS — latest headlines via news.google.com (personal feed use).
 * Prefer this over a single publisher feed for freshness.
 */
import type { SourceItem } from "../types.js";
import { loadRss, type RssFetch } from "./rss.js";

export type GoogleNewsOpts = {
  queries: string[];
  /** Google News when: window, e.g. 1d, 7d */
  when?: string;
  hl?: string;
  gl?: string;
  limitPerQuery?: number;
  fetchXml?: RssFetch;
  /** Soft-resolve publisher article URL when possible */
  resolveUrls?: boolean;
};

export function buildGoogleNewsRssUrl(
  query: string,
  opts: { when?: string; hl?: string; gl?: string } = {}
): string {
  const when = opts.when || "1d";
  const hl = opts.hl || "en-US";
  const gl = opts.gl || "US";
  const q = /\bwhen:\d+[dwmy]\b/i.test(query)
    ? query
    : `${query} when:${when}`;
  const params = new URLSearchParams({
    q,
    hl,
    gl,
    ceid: `${gl}:en`,
  });
  return `https://news.google.com/rss/search?${params.toString()}`;
}

function parsePublisher(title: string): { headline: string; publisher?: string } {
  // Google titles: "Headline - Publisher"
  const m = title.match(/^(.*)\s+-\s+(.+)$/);
  if (!m) return { headline: title };
  return { headline: m[1].trim(), publisher: m[2].trim() };
}

/**
 * Load + normalize Google News items for multiple queries.
 */
export async function loadGoogleNews(
  opts: GoogleNewsOpts
): Promise<SourceItem[]> {
  const queries = opts.queries.map((q) => q.trim()).filter(Boolean);
  if (!queries.length) return [];

  const when = opts.when || "1d";
  const limit = opts.limitPerQuery ?? 10;
  const seen = new Set<string>();
  const out: SourceItem[] = [];

  for (const query of queries) {
    const feedUrl = buildGoogleNewsRssUrl(query, {
      when,
      hl: opts.hl,
      gl: opts.gl,
    });
    let items: SourceItem[] = [];
    try {
      items = await loadRss(feedUrl, {
        fetchXml: opts.fetchXml,
        limit,
        provider: "google_news",
        sourceType: "google_news",
      });
    } catch (err) {
      console.warn(
        `Google News query failed (${query.slice(0, 40)}):`,
        (err as Error).message
      );
      continue;
    }

    for (const item of items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);

      const { headline, publisher } = parsePublisher(item.title || "");
      const sourceName =
        (item.raw as { sourceName?: string })?.sourceName || publisher;
      const sourceHome =
        (item.raw as { sourceUrl?: string })?.sourceUrl || undefined;

      const facts = [
        headline || item.title || "",
        sourceName ? `Publisher: ${sourceName}` : "",
        item.published_at ? `Published: ${item.published_at}` : "",
        `Google News query: ${query}`,
        item.url ? `Article: ${item.url}` : "",
        sourceHome ? `Publisher site: ${sourceHome}` : "",
        ...(item.facts || []).slice(0, 2),
      ].filter(Boolean);

      out.push({
        ...item,
        source_type: "google_news",
        title: headline || item.title,
        facts,
        raw: {
          ...(typeof item.raw === "object" && item.raw ? item.raw : {}),
          query,
          publisher: sourceName,
          googleNews: true,
        },
      });
    }
  }

  // Newest first
  out.sort((a, b) => {
    const pa = a.published_at || a.fetched_at;
    const pb = b.published_at || b.fetched_at;
    return pb.localeCompare(pa);
  });

  return out;
}

/** Parse comma-separated queries; allow `|` inside a query for OR groups already in string. */
export function parseNewsQueries(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
