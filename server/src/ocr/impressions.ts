/**
 * After publishing original posts, optionally scrape analytics impressions.
 */
import type { Page } from "playwright";
import type { AppConfig } from "../config.js";
import type { Db } from "../db.js";
import { upsertPostMetrics } from "../db.js";
import { scrapeTweetImpressions } from "./eligibility.js";

export async function trackPostImpressions(
  page: Page,
  cfg: AppConfig,
  db: Db,
  input: { postId: number; tweetIdOrUrl: string }
): Promise<number | null> {
  if (!cfg.OCR_MODE || !cfg.OCR_TRACK_IMPRESSIONS) return null;
  if (!cfg.myHandle) return null;
  try {
    const n = await scrapeTweetImpressions(
      page,
      input.tweetIdOrUrl,
      cfg.myHandle
    );
    if (n == null) {
      console.log("ocr: impressions not readable yet for", input.tweetIdOrUrl);
      return null;
    }
    upsertPostMetrics(db, {
      post_id: input.postId,
      tweet_id: input.tweetIdOrUrl.match(/\d{10,}/)?.[0] ?? input.tweetIdOrUrl,
      tweet_url: input.tweetIdOrUrl.startsWith("http")
        ? input.tweetIdOrUrl
        : `https://x.com/${cfg.myHandle}/status/${input.tweetIdOrUrl}`,
      impressions: n,
    });
    console.log(`ocr: post ${input.postId} impressions ≈ ${n.toLocaleString()}`);
    return n;
  } catch (err) {
    console.warn("ocr: impression scrape failed:", (err as Error).message);
    return null;
  }
}
