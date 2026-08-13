import { describe, it, expect } from "vitest";
import {
  pickContentMode,
  parseModeWeights,
  DEFAULT_MODE_WEIGHTS,
} from "../src/persona.js";

describe("parseModeWeights", () => {
  it("parses overrides", () => {
    const w = parseModeWeights("tech_news=10,meme=90");
    expect(w.tech_news).toBe(10);
    expect(w.meme).toBe(90);
    expect(w.hot_take).toBe(DEFAULT_MODE_WEIGHTS.hot_take);
  });
});

describe("pickContentMode", () => {
  it("never returns screenshot when none available", () => {
    for (let i = 0; i < 40; i++) {
      const mode = pickContentMode({
        weights: {
          tech_news: 0,
          hot_take: 0,
          meme: 0,
          screenshot: 100,
          ship_note: 0,
          question: 0,
          pdf_deep: 0,
        },
        recentModes: [],
        available: {
          hasNews: true,
          hasInbox: false,
          hasScreenshots: false,
          hasMemeImages: false,
        },
        hour: 15,
        random: () => 0.5,
      });
      expect(mode).not.toBe("screenshot");
    }
  });

  it("prefers available modes", () => {
    const mode = pickContentMode({
      weights: {
        tech_news: 100,
        hot_take: 0,
        meme: 0,
        screenshot: 0,
        ship_note: 0,
        question: 0,
        pdf_deep: 0,
      },
      recentModes: [],
      available: {
        hasNews: true,
        hasInbox: false,
        hasScreenshots: false,
        hasMemeImages: false,
      },
      hour: 10,
      random: () => 0.01,
    });
    expect(mode).toBe("tech_news");
  });

  it("downweights recent mode", () => {
    // With only hot_take and meme equal, and hot_take recent, meme should win often
    let meme = 0;
    for (let i = 0; i < 50; i++) {
      const mode = pickContentMode({
        weights: {
          tech_news: 0,
          hot_take: 50,
          meme: 50,
          screenshot: 0,
          ship_note: 0,
          question: 0,
          pdf_deep: 0,
        },
        recentModes: ["hot_take", "hot_take"],
        available: {
          hasNews: false,
          hasInbox: false,
          hasScreenshots: false,
          hasMemeImages: false,
        },
        hour: 20,
        random: () => i / 50,
      });
      if (mode === "meme") meme += 1;
    }
    expect(meme).toBeGreaterThan(20);
  });
});
