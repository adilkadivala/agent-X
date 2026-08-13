import { describe, expect, it } from "vitest";
import { nextObserveSleepSeconds } from "../src/observe-sleep.js";
import type { AppConfig } from "../src/config.js";

describe("nextObserveSleepSeconds", () => {
  it("stays within min/max and never above 3600", () => {
    const cfg = {
      OBSERVE_SLEEP_MIN_SECONDS: 60,
      OBSERVE_SLEEP_MAX_SECONDS: 240,
    } as AppConfig;
    for (let i = 0; i < 40; i++) {
      const s = nextObserveSleepSeconds(cfg);
      expect(s).toBeGreaterThanOrEqual(60);
      expect(s).toBeLessThanOrEqual(240);
    }
  });

  it("caps at 360", () => {
    const cfg = {
      OBSERVE_SLEEP_MIN_SECONDS: 300,
      OBSERVE_SLEEP_MAX_SECONDS: 99999,
    } as AppConfig;
    const s = nextObserveSleepSeconds(cfg);
    expect(s).toBeLessThanOrEqual(360);
  });
});
