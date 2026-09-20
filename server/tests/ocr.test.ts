import { describe, expect, it } from "vitest";
import {
  atDailyPostCap,
  evaluateOcrEligibility,
  effectiveDailyMax,
} from "../src/ocr/eligibility.js";
import type { AppConfig } from "../src/config.js";
import { openDb } from "../src/db.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { shouldAttemptPost } from "../src/schedule.js";

function cfg(over: Partial<AppConfig> = {}): AppConfig {
  return {
    OCR_MODE: true,
    OCR_IGNORE_WINDOWS: true,
    OCR_DAILY_MAX: 50,
    OCR_REQUIRE_ELIGIBILITY: true,
    OCR_SKIP_ENGAGE: true,
    OCR_PDF_TO_TIMELINE: true,
    X_PREMIUM: true,
    MIN_FOLLOWERS: 500,
    MIN_QUALIFIED_IMPRESSIONS: 500_000,
    FOLLOWERS_COUNT: 600,
    DAILY_MAX: 20,
    TZ: "UTC",
    FORCE_RUN: false,
    postWindows: [{ start: 9, end: 11 }],
    WINDOW_JITTER: 0.4,
    ...over,
  } as AppConfig;
}

describe("OCR helpers", () => {
  it("uses OCR_DAILY_MAX when OCR_MODE", () => {
    expect(effectiveDailyMax(cfg())).toBe(50);
    expect(effectiveDailyMax(cfg({ OCR_MODE: false }))).toBe(20);
    expect(effectiveDailyMax(cfg({ OCR_DAILY_MAX: 0 }))).toBe(0);
  });

  it("passes eligibility with premium + followers", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-"));
    const db = openDb(path.join(dir, "t.db"));
    const el = evaluateOcrEligibility(cfg(), db);
    expect(el.ok).toBe(true);
    expect(el.missing).toEqual([]);
    db.close();
  });

  it("fails without premium", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-"));
    const db = openDb(path.join(dir, "t.db"));
    const el = evaluateOcrEligibility(cfg({ X_PREMIUM: false }), db);
    expect(el.ok).toBe(false);
    expect(el.missing.some((m) => /Premium/i.test(m))).toBe(true);
    db.close();
  });

  it("ignores windows in OCR mode", () => {
    const r = shouldAttemptPost(cfg(), new Date("2020-01-01T03:00:00Z"), () => 1);
    expect(r.ok).toBe(true);
  });

  it("unlimited daily when OCR_DAILY_MAX=0", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-"));
    const db = openDb(path.join(dir, "t.db"));
    const cap = atDailyPostCap(cfg({ OCR_DAILY_MAX: 0 }), db);
    expect(cap.capped).toBe(false);
    db.close();
  });
});

describe("OCR content policy", () => {
  it("flags engagement solicitation and monetization coaching", async () => {
    const { ocrContentViolations } = await import("../src/ocr/policy.js");
    expect(ocrContentViolations("RT if you agree with this").length).toBeGreaterThan(0);
    expect(
      ocrContentViolations("How to get monetized on X with Creator Studio").length
    ).toBeGreaterThan(0);
    expect(ocrContentViolations("Shipped the auth fix before lunch.").length).toBe(0);
  });
});
