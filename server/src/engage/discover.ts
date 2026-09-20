/**
 * Discover tweets: Following feed, Notifications, home, search, watchlist.
 * NOTE: do NOT nest named `function` decls inside page.evaluate — tsx injects
 * `__name` which breaks in the browser. Keep evaluate bodies flat.
 */
import type { Page } from "playwright";
import type { WatchedTweet } from "./types.js";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type EngageSource =
  | "following"
  | "notifications"
  | "timeline"
  | "search"
  | "watchlist";

export type FeedTweet = WatchedTweet & {
  source: EngageSource;
  query?: string;
};

type RawTweet = {
  tweetId: string;
  handle: string;
  text: string;
  url: string;
  time?: string;
  isRetweet: boolean;
  isReply: boolean;
  views?: number;
};

/** Canonical tweet URL — never /analytics or query junk. */
export function normalizeTweetUrl(raw: string): string {
  const m = raw.match(/\/([^/?#]+)\/status\/(\d+)/);
  if (!m) return raw.split("?")[0].replace(/\/analytics\/?$/, "");
  return `https://x.com/${m[1]}/status/${m[2]}`;
}

/**
 * Extract tweets visible on the current page.
 * Flat evaluate body — no nested named functions (tsx/__name safe).
 */
export async function scrapeVisibleTweets(
  page: Page,
  opts: {
    limit?: number;
    source: EngageSource;
    query?: string;
    authorOnly?: string;
  }
): Promise<FeedTweet[]> {
  const limit = opts.limit ?? 20;
  const authorOnly = opts.authorOnly?.replace(/^@/, "").toLowerCase() || "";

  const raw = await page.evaluate(
    ({ limit, authorOnly }: { limit: number; authorOnly: string }) => {
      const out: RawTweet[] = [];
      const articles = Array.from(
        document.querySelectorAll('article[data-testid="tweet"]')
      );
      for (const art of articles) {
        if (out.length >= limit) break;
        const social = art.querySelector('[data-testid="socialContext"]');
        const socialText = (social?.textContent || "").toLowerCase();
        const isRetweet =
          socialText.includes("reposted") || socialText.includes("retweeted");

        // PRIMARY tweet = status URL on the article's <time> link.
        // Never take nested quote-card status links first (those can be OUR own
        // post inside someone else's quote-tweet).
        let statusHref = "";
        let handle = "";
        const timeEl = art.querySelector("time");
        const timeAnchor = timeEl
          ? timeEl.closest('a[href*="/status/"]')
          : null;
        if (timeAnchor) {
          const href = timeAnchor.getAttribute("href") || "";
          const m = href.match(/\/([^/?#]+)\/status\/(\d+)/);
          if (m && !["i", "search"].includes(m[1].toLowerCase())) {
            handle = m[1];
            statusHref = `/${m[1]}/status/${m[2]}`;
          }
        }
        if (!statusHref) {
          const links = Array.from(art.querySelectorAll('a[href*="/status/"]'));
          for (const a of links) {
            const href = a.getAttribute("href") || "";
            const m = href.match(
              /\/([^/?#]+)\/status\/(\d+)(?:\/(analytics|photo|video|media))?/
            );
            if (!m) continue;
            if (m[3] === "analytics") continue;
            if (["i", "search"].includes(m[1].toLowerCase())) continue;
            // Skip links that live inside a nested quoted article
            const nestArt = a.closest('article[data-testid="tweet"]');
            if (nestArt && nestArt !== art) continue;
            handle = m[1];
            statusHref = `/${m[1]}/status/${m[2]}`;
            break;
          }
        }
        if (!statusHref || !handle) continue;
        if (authorOnly && handle.toLowerCase() !== authorOnly) continue;

        const idMatch = statusHref.match(/status\/(\d+)/);
        if (!idMatch) continue;
        const tweetId = idMatch[1];
        if (out.some((t) => t.tweetId === tweetId)) continue;

        // Primary text only — skip tweetText nodes inside nested quote cards
        let text = "";
        const textNodes = Array.from(
          art.querySelectorAll('[data-testid="tweetText"]')
        );
        for (const el of textNodes) {
          const nestArt = el.closest('article[data-testid="tweet"]');
          if (nestArt && nestArt !== art) continue;
          text = (el.textContent || "").trim();
          break;
        }
        const time = timeEl?.getAttribute("datetime") || undefined;
        const isReply = /replying to/i.test(art.textContent || "");

        let views: number | undefined;
        const analytics = art.querySelector('a[href*="/analytics"]');
        const viewLabel =
          (analytics &&
            (analytics.getAttribute("aria-label") ||
              analytics.textContent ||
              "")) ||
          "";
        let labelToParse = viewLabel;
        if (!/views?/i.test(labelToParse)) {
          const els = Array.from(art.querySelectorAll("[aria-label]"));
          for (const el of els) {
            const lab = el.getAttribute("aria-label") || "";
            if (/views?/i.test(lab)) {
              labelToParse = lab;
              break;
            }
          }
        }
        const vm = labelToParse.match(/([\d,.]+)\s*([KMB])?\s*views?/i);
        if (vm) {
          const n = Number(vm[1].replace(/,/g, ""));
          if (Number.isFinite(n)) {
            const suf = (vm[2] || "").toUpperCase();
            if (suf === "K") views = Math.round(n * 1_000);
            else if (suf === "M") views = Math.round(n * 1_000_000);
            else if (suf === "B") views = Math.round(n * 1_000_000_000);
            else views = Math.round(n);
          }
        }

        out.push({
          tweetId,
          handle,
          text,
          url: "https://x.com" + statusHref,
          time,
          isRetweet,
          isReply,
          views,
        });
      }
      return out;
    },
    { limit, authorOnly }
  );

  return raw.map((t) => ({
    tweetId: t.tweetId,
    handle: t.handle.toLowerCase(),
    text: t.text,
    url: normalizeTweetUrl(t.url),
    publishedAt: t.time,
    isRetweet: t.isRetweet,
    isReply: t.isReply,
    views: t.views,
    source: opts.source,
    query: opts.query,
  }));
}

/** Scrape a specific user's profile for their latest posts. */
export async function scrapeProfile(
  page: Page,
  handle: string,
  opts: { limit?: number } = {}
): Promise<FeedTweet[]> {
  const limit = opts.limit ?? 10;
  const cleanHandle = handle.replace(/^@/, "").toLowerCase();
  await page.goto(`https://x.com/${cleanHandle}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(1800 + Math.floor(Math.random() * 800));
  await page.mouse.wheel(0, 1400);
  await sleep(700);
  return scrapeVisibleTweets(page, {
    limit,
    source: "watchlist",
    authorOnly: cleanHandle,
  });
}

/** Click the For you tab on home (algorithmic feed). */
async function clickForYouTab(page: Page): Promise<boolean> {
  const tab = page.getByRole("tab", { name: /^For you$/i });
  if (await tab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await tab.click();
    await sleep(1500);
    return true;
  }
  const link = page
    .locator('a, div[role="tab"]')
    .filter({ hasText: /^For you$/i })
    .first();
  if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
    await link.click();
    await sleep(1500);
    return true;
  }
  return false;
}

/** Click the Following tab on home if present. */
async function clickFollowingTab(page: Page): Promise<boolean> {
  const tab = page.getByRole("tab", { name: /^Following$/i });
  if (await tab.isVisible({ timeout: 4000 }).catch(() => false)) {
    await tab.click();
    await sleep(1500);
    return true;
  }
  // Fallback: link/button text
  const link = page.locator('a, div[role="tab"]').filter({ hasText: /^Following$/i }).first();
  if (await link.isVisible({ timeout: 2000 }).catch(() => false)) {
    await link.click();
    await sleep(1500);
    return true;
  }
  return false;
}

/** Home → Following tab (people you follow). */
export async function scrapeFollowingFeed(
  page: Page,
  opts: { limit?: number } = {}
): Promise<FeedTweet[]> {
  await page.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(1600);
  await clickFollowingTab(page);
  await page.mouse.wheel(0, 1800);
  await sleep(900);
  await page.mouse.wheel(0, 1400);
  await sleep(700);
  return scrapeVisibleTweets(page, {
    limit: opts.limit ?? 30,
    source: "following",
  });
}

/**
 * Collect handles from your Following list page (who you follow).
 * Used so For you posts from network can be entertained even without tech keywords.
 */
export async function scrapeFollowingHandles(
  page: Page,
  myHandle: string,
  opts: { limit?: number } = {}
): Promise<string[]> {
  const me = myHandle.replace(/^@/, "").trim().toLowerCase();
  if (!me) return [];
  const limit = opts.limit ?? 100;
  await page.goto(`https://x.com/${me}/following`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(1800);
  await page.mouse.wheel(0, 2200);
  await sleep(900);
  await page.mouse.wheel(0, 2200);
  await sleep(700);

  return page.evaluate(({ limit, me }: { limit: number; me: string }) => {
    const out: string[] = [];
    const seen = new Set<string>();
    const cells = Array.from(
      document.querySelectorAll(
        '[data-testid="UserCell"], [data-testid="cellInnerDiv"]'
      )
    );
    for (const cell of cells) {
      if (out.length >= limit) break;
      const links = Array.from(cell.querySelectorAll("a[href^='/']"));
      for (const a of links) {
        const href = a.getAttribute("href") || "";
        const m = href.match(/^\/([A-Za-z0-9_]+)\/?$/);
        if (!m) continue;
        const h = m[1].toLowerCase();
        if (
          !h ||
          h === me ||
          ["home", "explore", "notifications", "messages", "i", "settings", "compose", "search"].includes(
            h
          )
        ) {
          continue;
        }
        if (seen.has(h)) continue;
        seen.add(h);
        out.push(h);
        break;
      }
    }
    return out;
  }, { limit, me });
}

/** For You tab — primary home feed. */
export async function scrapeHomeTimeline(
  page: Page,
  opts: { limit?: number } = {}
): Promise<FeedTweet[]> {
  await page.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(1600);
  await clickForYouTab(page);
  await page.mouse.wheel(0, 1800);
  await sleep(900);
  await page.mouse.wheel(0, 1400);
  await sleep(700);
  return scrapeVisibleTweets(page, {
    limit: opts.limit ?? 40,
    source: "timeline",
  });
}

/**
 * Notifications tab — posts from people you follow ("X posted").
 * Pulls status links out of notification cells.
 */
export async function scrapeNotifications(
  page: Page,
  opts: { limit?: number } = {}
): Promise<FeedTweet[]> {
  const limit = opts.limit ?? 20;
  await page.goto("https://x.com/notifications", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(2000);
  // Prefer "All" tab
  const allTab = page.getByRole("tab", { name: /^All$/i });
  if (await allTab.isVisible({ timeout: 2500 }).catch(() => false)) {
    await allTab.click().catch(() => undefined);
    await sleep(800);
  }
  await page.mouse.wheel(0, 1600);
  await sleep(900);

  const raw = await page.evaluate(({ limit }: { limit: number }) => {
    const out: RawTweet[] = [];
    const cells = Array.from(
      document.querySelectorAll(
        'article, div[data-testid="notification"], div[data-testid="cellInnerDiv"]'
      )
    );
    for (const cell of cells) {
      if (out.length >= limit) break;
      const textBlob = (cell.textContent || "").toLowerCase();
      // Focus on "posted" / new post style notifs; still allow others with status links
      const looksLikePost =
        textBlob.includes("posted") ||
        textBlob.includes("was posting") ||
        textBlob.includes("repost") ||
        !!cell.querySelector('a[href*="/status/"]');

      if (!looksLikePost) continue;

      const links = Array.from(cell.querySelectorAll('a[href*="/status/"]'));
      let statusHref = "";
      let handle = "";
      const timeEl = cell.querySelector("time");
      const timeAnchor = timeEl
        ? timeEl.closest('a[href*="/status/"]')
        : null;
      if (timeAnchor) {
        const href = timeAnchor.getAttribute("href") || "";
        const m = href.match(/\/([^/?#]+)\/status\/(\d+)/);
        if (m && !["i", "search"].includes(m[1].toLowerCase())) {
          handle = m[1];
          statusHref = `/${m[1]}/status/${m[2]}`;
        }
      }
      if (!statusHref) {
        for (const a of links) {
          const href = a.getAttribute("href") || "";
          const m = href.match(
            /\/([^/?#]+)\/status\/(\d+)(?:\/(analytics|photo|video|media))?/
          );
          if (!m) continue;
          if (["i", "search"].includes(m[1].toLowerCase())) continue;
          if (m[3] === "analytics") continue;
          const nestArt = a.closest('article[data-testid="tweet"]');
          if (nestArt && nestArt !== cell) continue;
          handle = m[1];
          statusHref = `/${m[1]}/status/${m[2]}`;
          break;
        }
      }
      if (!statusHref) {
        for (const a of links) {
          const href = a.getAttribute("href") || "";
          const m = href.match(/\/([^/?#]+)\/status\/(\d+)/);
          if (m && !["i", "search"].includes(m[1].toLowerCase())) {
            handle = m[1];
            statusHref = `/${m[1]}/status/${m[2]}`;
            break;
          }
        }
      }
      if (!statusHref || !handle) continue;
      const idMatch = statusHref.match(/status\/(\d+)/);
      if (!idMatch) continue;
      const tweetId = idMatch[1];
      if (out.some((t) => t.tweetId === tweetId)) continue;

      const textEl = cell.querySelector('[data-testid="tweetText"]');
      const text = (textEl?.textContent || "").trim() ||
        (cell.textContent || "").replace(/\s+/g, " ").trim().slice(0, 280);
      const time = timeEl?.getAttribute("datetime") || undefined;

      out.push({
        tweetId,
        handle,
        text,
        url: "https://x.com" + statusHref,
        time,
        isRetweet: /reposted|retweeted/i.test(textBlob),
        isReply: /replied|replying/i.test(textBlob),
      });
    }
    return out;
  }, { limit });

  return raw.map((t) => ({
    tweetId: t.tweetId,
    handle: t.handle.toLowerCase(),
    text: t.text,
    url: normalizeTweetUrl(t.url),
    publishedAt: t.time,
    isRetweet: t.isRetweet,
    isReply: t.isReply,
    views: t.views,
    source: "notifications" as const,
  }));
}

/** Live + Top search. */
export async function scrapeSearchLive(
  page: Page,
  query: string,
  opts: { limit?: number } = {}
): Promise<FeedTweet[]> {
  const limit = opts.limit ?? 15;
  const out: FeedTweet[] = [];
  const seen = new Set<string>();

  for (const tab of ["live", "top"] as const) {
    const url = `https://x.com/search?q=${encodeURIComponent(query)}&f=${tab}&src=typed_query`;
    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(1600 + Math.floor(Math.random() * 800));
    await page.mouse.wheel(0, 1400);
    await sleep(700);
    const hits = await scrapeVisibleTweets(page, {
      limit: Math.ceil(limit / 2) + 2,
      source: "search",
      query: `${query} [${tab}]`,
    });
    for (const t of hits) {
      if (seen.has(t.tweetId)) continue;
      seen.add(t.tweetId);
      out.push(t);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function parseEngageSources(raw: string): EngageSource[] {
  const allowed = new Set<EngageSource>([
    "following",
    "notifications",
    "timeline",
    "search",
    "watchlist",
  ]);
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is EngageSource => allowed.has(s as EngageSource));
}

export function parseSearchQueries(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
