import { describe, expect, it } from "vitest";
import { handleFromTweetUrl, isOwnPost } from "../src/self-post.js";

describe("isOwnPost", () => {
  it("matches handle", () => {
    expect(
      isOwnPost({
        handle: "adil_kadival",
        url: "https://x.com/someone/status/1",
        myHandle: "adil_kadival",
      })
    ).toBe(true);
  });

  it("matches url even when scraped handle is wrong", () => {
    expect(
      isOwnPost({
        handle: "boardyai",
        url: "https://x.com/adil_kadival/status/2087117950679646459",
        myHandle: "adil_kadival",
      })
    ).toBe(true);
  });

  it("allows other people", () => {
    expect(
      isOwnPost({
        handle: "boardyai",
        url: "https://x.com/boardyai/status/2087118022435905704",
        myHandle: "adil_kadival",
      })
    ).toBe(false);
  });
});

describe("handleFromTweetUrl", () => {
  it("parses handle", () => {
    expect(
      handleFromTweetUrl("https://x.com/adil_kadival/status/123")
    ).toBe("adil_kadival");
  });
});
