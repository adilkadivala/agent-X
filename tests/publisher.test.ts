import { describe, it, expect } from "vitest";
import { SELECTORS, detectLoginWall, detectChallenge } from "../src/publisher.js";

describe("publisher selectors", () => {
  it("exports stable selector names", () => {
    expect(SELECTORS.composer).toBeTruthy();
    expect(SELECTORS.postButton).toBeTruthy();
    expect(SELECTORS.loginHint).toBeTruthy();
    expect(SELECTORS.fileInput).toBeTruthy();
  });
});

describe("detectLoginWall / detectChallenge", () => {
  it("detects login URL", async () => {
    const page = {
      url: () => "https://x.com/i/flow/login",
      locator: () => ({
        first: () => ({
          isVisible: async () => false,
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await detectLoginWall(page as any)).toBe(true);
  });

  it("no challenge when locator invisible", async () => {
    const page = {
      locator: () => ({
        first: () => ({
          isVisible: async () => false,
        }),
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(await detectChallenge(page as any)).toBe(false);
  });
});
