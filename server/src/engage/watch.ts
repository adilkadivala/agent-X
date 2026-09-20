/**
 * Scrape recent posts from allowlisted X profiles (optional boost).
 */
import type { Page } from "playwright";
import type { WatchedTweet } from "./types.js";
import { scrapeVisibleTweets } from "./discover.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normalizeHandle(h: string): string {
  return h.replace(/^@/, "").trim().toLowerCase();
}

export async function scrapeProfileTweets(
  page: Page,
  handle: string,
  opts: { limit?: number } = {}
): Promise<WatchedTweet[]> {
  const user = normalizeHandle(handle);
  const limit = opts.limit ?? 5;

  await page.goto(`https://x.com/${user}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(1500 + Math.floor(Math.random() * 1200));
  await page.mouse.wheel(0, 1200);
  await sleep(800);

  const feed = await scrapeVisibleTweets(page, {
    limit,
    source: "watchlist",
    authorOnly: user,
  });
  return feed.map(({ source: _s, query: _q, ...tw }) => tw);
}

export function parseWatchHandles(raw: string): string[] {
  return raw
    .split(/[,:\s]+/)
    .map((h) => normalizeHandle(h))
    .filter(Boolean)
    .filter((h, i, arr) => arr.indexOf(h) === i);
}
