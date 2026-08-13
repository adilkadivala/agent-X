import crypto from "node:crypto";
import Parser from "rss-parser";
import type { SourceItem, SourceType } from "../types.js";

function hashId(parts: string): string {
  return crypto.createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

export type RssFetch = (url: string) => Promise<string>;

const defaultFetch: RssFetch = async (url) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch(url, {
      headers: {
        // Google News rejects bare bots; browser-like UA is required.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        Accept: "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`RSS fetch failed ${res.status}: ${url}`);
    return res.text();
  } finally {
    clearTimeout(timer);
  }
};

function pickEnclosureImage(entry: {
  enclosure?: { url?: string; type?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}): string | undefined {
  const enc = entry.enclosure;
  if (enc?.url && (!enc.type || enc.type.startsWith("image/"))) {
    return enc.url;
  }
  const media = entry["media:content"] || entry.mediaContent;
  if (typeof media === "object" && media?.$?.url) {
    const mid = media.$;
    if (
      !mid.medium ||
      mid.medium === "image" ||
      String(mid.type || "").startsWith("image/")
    ) {
      return mid.url;
    }
  }
  const thumb = entry["media:thumbnail"] || entry.mediaThumbnail;
  if (typeof thumb === "object" && thumb?.$?.url) return thumb.$.url;
  if (typeof entry.image === "string") return entry.image;
  return undefined;
}

function toIsoDate(raw?: string): string | undefined {
  if (!raw) return undefined;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

/**
 * Load items from a single RSS feed URL.
 */
export async function loadRss(
  feedUrl: string,
  opts: {
    fetchXml?: RssFetch;
    limit?: number;
    provider?: string;
    sourceType?: SourceType;
  } = {}
): Promise<SourceItem[]> {
  if (!feedUrl) return [];
  const fetchXml = opts.fetchXml ?? defaultFetch;
  const limit = opts.limit ?? 15;
  const xml = await fetchXml(feedUrl);
  const parser = new Parser({
    customFields: {
      item: [
        ["media:content", "mediaContent"],
        ["media:thumbnail", "mediaThumbnail"],
        ["source", "source"],
      ],
    },
  });
  const feed = await parser.parseString(xml);
  const now = new Date().toISOString();
  const sourceType = opts.sourceType || "rss";
  const prefix = opts.provider || sourceType;

  const items: SourceItem[] = [];
  for (const entry of (feed.items || []).slice(0, limit)) {
    const link = entry.link || entry.guid || "";
    const title = entry.title || "Untitled";
    const summary =
      entry.contentSnippet ||
      entry.summary ||
      (typeof entry.content === "string" ? entry.content.slice(0, 400) : "") ||
      "";
    const externalId = String(entry.guid || link || title);
    const published_at = toIsoDate(entry.isoDate || entry.pubDate);
    const facts = [title, summary, link].filter(Boolean);
    const imageUrl = pickEnclosureImage(entry);

    // rss-parser may put <source url="...">Name</source> on entry.source
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const srcField = (entry as any).source;
    let sourceName: string | undefined;
    let sourceUrl: string | undefined;
    if (typeof srcField === "string") {
      sourceName = srcField;
    } else if (srcField && typeof srcField === "object") {
      sourceName = srcField._ || srcField["#"] || undefined;
      sourceUrl = srcField.$?.url;
    }

    items.push({
      id: hashId(`${prefix}:${externalId}`),
      source_type: sourceType,
      url: link || undefined,
      title,
      imageUrl,
      published_at,
      facts,
      raw: {
        feedUrl,
        guid: entry.guid,
        pubDate: entry.pubDate,
        imageUrl,
        provider: opts.provider,
        sourceName,
        sourceUrl,
      },
      fetched_at: now,
    });
  }
  return items;
}
