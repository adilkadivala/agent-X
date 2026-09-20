/**
 * Original Content Rewards (OCR) helpers.
 * No X API — config flags + Playwright scrapes + local SQLite metrics.
 */
import type { Page } from "playwright";
import type { AppConfig } from "../config.js";
import type { Db } from "../db.js";
import {
  impressionsLastDays,
  insertOcrSnapshot,
  latestOcrSnapshot,
  postsToday,
} from "../db.js";

export type OcrEligibility = {
  ok: boolean;
  premium: boolean;
  followers: number | null;
  impressions90d: number;
  reasons: string[];
  missing: string[];
};

export function effectiveDailyMax(cfg: AppConfig): number {
  if (cfg.OCR_MODE) {
    // 0 = unlimited
    return cfg.OCR_DAILY_MAX;
  }
  return cfg.DAILY_MAX;
}

export function atDailyPostCap(
  cfg: AppConfig,
  db: Db
): { capped: boolean; today: number; max: number } {
  const today = postsToday(db, cfg.TZ);
  const max = effectiveDailyMax(cfg);
  if (max <= 0) return { capped: false, today, max: 0 };
  return { capped: today >= max, today, max };
}

/** Resolve follower count: env override → latest snapshot → null. */
export function resolveFollowers(cfg: AppConfig, db: Db): number | null {
  if (cfg.FOLLOWERS_COUNT > 0) return cfg.FOLLOWERS_COUNT;
  const snap = latestOcrSnapshot(db);
  return snap?.followers ?? null;
}

export function evaluateOcrEligibility(
  cfg: AppConfig,
  db: Db,
  scraped?: { followers?: number | null; premiumLikely?: boolean }
): OcrEligibility {
  const premium = Boolean(cfg.X_PREMIUM || scraped?.premiumLikely);
  const followers =
    scraped?.followers != null && scraped.followers >= 0
      ? scraped.followers
      : resolveFollowers(cfg, db);
  const impressions90d = impressionsLastDays(db, 90);

  const missing: string[] = [];
  const reasons: string[] = [];

  if (!premium) {
    missing.push(
      "X Premium / Premium+ / Premium Business (set X_PREMIUM=true when active; Premium Basic alone is not enough to enroll)"
    );
  } else {
    reasons.push("premium ok (Premium / Premium+ / Premium Business)");
  }

  if (followers == null) {
    reasons.push(
      `verified followers unknown — set FOLLOWERS_COUNT or run: OCR_REFRESH=true npm run ocr:status`
    );
  } else if (followers < cfg.MIN_FOLLOWERS) {
    missing.push(
      `verified followers ${followers} < ${cfg.MIN_FOLLOWERS} (OCR requires ≥500 verified followers)`
    );
  } else {
    reasons.push(
      `followers ${followers} ≥ ${cfg.MIN_FOLLOWERS} (prefer verified_followers scrape)`
    );
  }

  // Local analytics impressions are a PROXY only — official OCR counts
  // Premium users viewing ≥50% of the post on Home Timeline (replies excluded).
  if (impressions90d >= cfg.MIN_QUALIFIED_IMPRESSIONS) {
    reasons.push(
      `tracked impressions_90d ${impressions90d.toLocaleString()} ≥ ${cfg.MIN_QUALIFIED_IMPRESSIONS.toLocaleString()} (proxy — check Creator Studio for official Premium HT qualified impressions)`
    );
  } else {
    reasons.push(
      `tracked impressions_90d ${impressions90d.toLocaleString()} / ${cfg.MIN_QUALIFIED_IMPRESSIONS.toLocaleString()} (proxy toward 500k Premium HT / verified-user HT quota; replies excluded)`
    );
  }

  const ok =
    premium &&
    (followers == null || followers >= cfg.MIN_FOLLOWERS);

  return {
    ok,
    premium,
    followers,
    impressions90d,
    reasons,
    missing,
  };
}

/**
 * Soft gate for original posts when OCR_MODE + OCR_REQUIRE_ELIGIBILITY.
 * Returns null if posting is allowed, else a skip reason.
 */
export function ocrOriginalPostBlockReason(
  cfg: AppConfig,
  db: Db
): string | null {
  if (!cfg.OCR_MODE || !cfg.OCR_REQUIRE_ELIGIBILITY) return null;
  const el = evaluateOcrEligibility(cfg, db);
  if (el.ok) return null;
  return `OCR eligibility incomplete: ${el.missing.join("; ")}`;
}

export function formatOcrStatus(
  cfg: AppConfig,
  db: Db,
  el?: OcrEligibility
): string {
  const e = el || evaluateOcrEligibility(cfg, db);
  const cap = atDailyPostCap(cfg, db);
  const maxLabel = cap.max <= 0 ? "∞" : String(cap.max);
  const lines = [
    `OCR_MODE: ${cfg.OCR_MODE ? "on" : "off"}`,
    `Premium: ${e.premium ? "✅" : "❌"} (X_PREMIUM=${cfg.X_PREMIUM}; enroll needs Premium/+/Business)`,
    `Verified followers (proxy): ${e.followers ?? "?"} / ${cfg.MIN_FOLLOWERS}`,
    `Impressions 90d (local analytics proxy): ${e.impressions90d.toLocaleString()} / ${cfg.MIN_QUALIFIED_IMPRESSIONS.toLocaleString()}`,
    `  Official: ≥500k Home Timeline impressions from verified users (replies excluded)`,
    `  Payouts: Premium-user HT views with ≥50% of post visible`,
    `Daily original posts today: ${cap.today} / ${maxLabel}`,
    `Skip quote engage: ${cfg.OCR_MODE && cfg.OCR_SKIP_ENGAGE ? "yes" : "no"}`,
    `PDF → timeline (not community): ${cfg.OCR_MODE && cfg.OCR_PDF_TO_TIMELINE ? "yes" : "no"}`,
    `Windows ignored: ${cfg.OCR_MODE && cfg.OCR_IGNORE_WINDOWS ? "yes" : "no"}`,
    e.ok ? "Eligibility gate: PASS" : `Eligibility gate: FAIL — ${e.missing.join("; ")}`,
    "Note: X may treat fully automated posting as ineligible — prefer original, human-edited posts.",
    "Source: https://help.x.com/en/using-x/original-content-rewards",
    ...e.reasons.map((r) => `  · ${r}`),
  ];
  return lines.join("\n");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Scrape own profile for follower count + Premium-ish signals. */
export async function scrapeProfileEligibility(
  page: Page,
  myHandle: string
): Promise<{ followers: number | null; premiumLikely: boolean }> {
  const me = myHandle.replace(/^@/, "").trim().toLowerCase();
  if (!me) return { followers: null, premiumLikely: false };

  await page.goto(`https://x.com/${me}`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(2000);

  const data = await page.evaluate(() => {
    let followers: number | null = null;
    let verifiedFollowers: number | null = null;

    const parseFollowerLabel = (label: string): number | null => {
      const m = label.match(/([\d,.]+)\s*([KMB])?\s*(Verified\s+)?Followers/i);
      if (m) {
        let n = Number(m[1].replace(/,/g, ""));
        const suf = (m[2] || "").toUpperCase();
        if (suf === "K") n *= 1_000;
        if (suf === "M") n *= 1_000_000;
        if (suf === "B") n *= 1_000_000_000;
        if (Number.isFinite(n)) return Math.round(n);
      }
      return null;
    };

    const links = Array.from(
      document.querySelectorAll(
        "a[href$='/verified_followers'], a[href$='/followers']"
      )
    );
    for (const a of links) {
      const href = a.getAttribute("href") || "";
      const label = (a.getAttribute("aria-label") || a.textContent || "").replace(
        /\s+/g,
        " "
      );
      let n = parseFollowerLabel(label);
      if (n == null) {
        const bold = a.querySelector("span span");
        const raw = (bold?.textContent || "").trim();
        const nm = raw.match(/^([\d,.]+)\s*([KMB])?$/i);
        if (nm) {
          let v = Number(nm[1].replace(/,/g, ""));
          const suf = (nm[2] || "").toUpperCase();
          if (suf === "K") v *= 1_000;
          if (suf === "M") v *= 1_000_000;
          if (Number.isFinite(v)) n = Math.round(v);
        }
      }
      if (n == null) continue;
      if (/verified_followers/i.test(href)) {
        verifiedFollowers = n;
      } else if (followers == null) {
        followers = n;
      }
    }

    // OCR requires ≥500 verified followers — prefer that number when available.
    const effective = verifiedFollowers ?? followers;
    const body = document.body?.innerText || "";
    const premiumLikely =
      /Premium/i.test(body.slice(0, 2000)) ||
      !!document.querySelector('[data-testid="icon-verified"]');
    return {
      followers: effective,
      verifiedFollowers,
      totalFollowers: followers,
      premiumLikely,
    };
  });

  return {
    followers: data.followers,
    premiumLikely: data.premiumLikely,
  };
}

/** Read impressions from a tweet analytics page (own posts). */
export async function scrapeTweetImpressions(
  page: Page,
  tweetUrlOrId: string,
  myHandle: string
): Promise<number | null> {
  const me = myHandle.replace(/^@/, "").trim().toLowerCase();
  let url = tweetUrlOrId;
  const idOnly = /^(\d+)$/.test(tweetUrlOrId);
  if (idOnly && me) {
    url = `https://x.com/${me}/status/${tweetUrlOrId}/analytics`;
  } else if (/\/status\/(\d+)/.test(tweetUrlOrId)) {
    const id = tweetUrlOrId.match(/\/status\/(\d+)/)![1];
    url = me
      ? `https://x.com/${me}/status/${id}/analytics`
      : tweetUrlOrId.replace(/\?.*$/, "").replace(/\/?$/, "") + "/analytics";
  }

  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(2500);

  const impressions = await page.evaluate(() => {
    const text = document.body?.innerText || "";
    // Common patterns: "Impressions\n12.3K" or "1,234 Impressions"
    const patterns = [
      /Impressions\s*\n?\s*([\d,.]+)\s*([KMB])?/i,
      /([\d,.]+)\s*([KMB])?\s*Impressions/i,
      /Post impressions\s*\n?\s*([\d,.]+)\s*([KMB])?/i,
    ];
    for (const re of patterns) {
      const m = text.match(re);
      if (!m) continue;
      let n = Number(m[1].replace(/,/g, ""));
      const suf = (m[2] || "").toUpperCase();
      if (suf === "K") n *= 1_000;
      if (suf === "M") n *= 1_000_000;
      if (suf === "B") n *= 1_000_000_000;
      if (Number.isFinite(n)) return Math.round(n);
    }
    return null;
  });

  return impressions;
}

export async function refreshOcrSnapshot(
  page: Page,
  cfg: AppConfig,
  db: Db
): Promise<OcrEligibility> {
  const scraped = cfg.myHandle
    ? await scrapeProfileEligibility(page, cfg.myHandle)
    : { followers: null, premiumLikely: false };

  const el = evaluateOcrEligibility(cfg, db, {
    followers: scraped.followers,
    premiumLikely: scraped.premiumLikely,
  });

  insertOcrSnapshot(db, {
    premium: el.premium,
    followers: el.followers,
    impressions_90d: el.impressions90d,
    notes: el.ok ? "eligible" : el.missing.join("; "),
  });

  return el;
}
