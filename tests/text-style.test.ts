import { describe, expect, it } from "vitest";
import { cleanChatText, stripMarkdownUnderscores } from "../src/text-style.js";

describe("cleanChatText", () => {
  it("strips markdown underscores", () => {
    expect(stripMarkdownUnderscores("this is __bold__ and _italic_ ok")).toBe(
      "this is bold and italic ok"
    );
  });

  it("removes trailing em-dash caption tails", () => {
    const raw =
      "Musk was already pitching the future to policymakers in 2006. That D.C. demo proves ROI narratives are seeded before any rocket flies. — Elon Musk presenting Falcon 9 and Dragon in Washington, D.C. back in 2006.";
    expect(cleanChatText(raw)).toBe(
      "Musk was already pitching the future to policymakers in 2006. That D.C. demo proves ROI narratives are seeded before any rocket flies."
    );
  });

  it("turns mid-sentence em dashes into periods", () => {
    expect(
      cleanChatText(
        "Bangalore's rise is no longer a novelty; it's a baseline expectation. So comforting to hear as a bangalorean — signals confidence in local talent."
      )
    ).toBe(
      "Bangalore's rise is no longer a novelty; it's a baseline expectation. So comforting to hear as a bangalorean. Signals confidence in local talent."
    );
  });
});
