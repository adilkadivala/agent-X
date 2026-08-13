import { describe, it, expect } from "vitest";
import { scoreDraft } from "../src/quality.js";
import type { DraftResult, SourceItem } from "../src/types.js";

const baseSource = (over: Partial<SourceItem> = {}): SourceItem => ({
  id: "s1",
  source_type: "rss",
  title: "OpenAI launches model",
  url: "https://example.com/a",
  facts: ["OpenAI launches model", "New API pricing", "https://example.com/a"],
  raw: {},
  fetched_at: new Date().toISOString(),
  ...over,
});

const draft = (over: Partial<DraftResult> = {}): DraftResult => ({
  text: "Per example.com, OpenAI launches a new model — pricing will decide adoption.",
  tags: ["AI"],
  claims: ["OpenAI launches model"],
  score: 0.9,
  reasons: ["voice ok"],
  ...over,
});

describe("scoreDraft", () => {
  it("passes a grounded, scored, attributed RSS post", () => {
    const r = scoreDraft(draft(), baseSource(), {
      bannedPhrases: ["buy now"],
      threshold: 0.8,
      includeSourceLink: true,
      maxHashtags: 2,
      mode: "tech_news",
    });
    expect(r.pass).toBe(true);
    expect(r.text).toContain("https://example.com/a");
    expect(r.text).toMatch(/#AI/);
  });

  it("hot_take does not require source link", () => {
    const r = scoreDraft(
      draft({
        text: "Most people don't need a better model. They need a clearer problem.",
        tags: [],
        claims: [],
        score: 0.9,
      }),
      baseSource({ source_type: "spark", url: "https://example.com/a" }),
      {
        bannedPhrases: [],
        threshold: 0.7,
        includeSourceLink: true,
        mode: "hot_take",
      }
    );
    expect(r.pass).toBe(true);
    expect(r.text).not.toContain("https://example.com/a");
  });

  it("rejects engagement bait", () => {
    const r = scoreDraft(
      draft({ text: "RT if you use AI tools daily", tags: [] }),
      baseSource(),
      { bannedPhrases: [], threshold: 0.5, includeSourceLink: true }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/bait/i);
  });

  it("rejects empty text", () => {
    const r = scoreDraft(draft({ text: "   " }), baseSource(), {
      bannedPhrases: [],
      threshold: 0.8,
    });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/empty/i);
  });

  it("rejects over 280 chars", () => {
    const r = scoreDraft(draft({ text: "x".repeat(281), tags: [] }), baseSource(), {
      bannedPhrases: [],
      threshold: 0.5,
      includeSourceLink: false,
    });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/too long/i);
  });

  it("rejects banned phrases", () => {
    const r = scoreDraft(
      draft({ text: "This is a buy now scam post about AI" }),
      baseSource(),
      { bannedPhrases: ["buy now"], threshold: 0.5 }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/banned/i);
  });

  it("rejects pure URL", () => {
    const r = scoreDraft(
      draft({ text: "https://example.com/only" }),
      baseSource(),
      { bannedPhrases: [], threshold: 0.5 }
    );
    expect(r.pass).toBe(false);
  });

  it("rejects low voice score", () => {
    const r = scoreDraft(draft({ score: 0.4 }), baseSource(), {
      bannedPhrases: [],
      threshold: 0.8,
    });
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/threshold/i);
  });

  it("rejects first-person ship claims on RSS", () => {
    const r = scoreDraft(
      draft({
        text: "I just shipped this OpenAI model today, so hyped",
        score: 0.95,
        tags: [],
      }),
      baseSource(),
      { bannedPhrases: [], threshold: 0.8, mode: "tech_news", includeSourceLink: false }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.join(" ")).toMatch(/first-person|ship/i);
  });

  it("allows inbox first-person when facts support claims", () => {
    const src = baseSource({
      source_type: "inbox",
      facts: ["Shipped x-agent dry-run today", "Playwright posts work"],
    });
    const r = scoreDraft(
      draft({
        text: "Shipped x-agent dry-run today — Playwright posts work.",
        claims: ["Shipped x-agent dry-run today"],
        score: 0.9,
      }),
      src,
      { bannedPhrases: [], threshold: 0.8 }
    );
    expect(r.pass).toBe(true);
  });
});
