import { describe, it, expect } from "vitest";
import {
  weightedLength,
  finalizePostText,
  normalizeTags,
  TCO_URL_LENGTH,
} from "../src/format.js";
import { extractOgImage } from "../src/media.js";

describe("weightedLength", () => {
  it("counts URLs as t.co length", () => {
    const url = "https://techcrunch.com/very/long/path/article-name";
    expect(weightedLength(`Hello ${url}`)).toBe(6 + TCO_URL_LENGTH);
  });
});

describe("finalizePostText", () => {
  it("appends tags and source link", () => {
    const r = finalizePostText("NFC keys beat willpower for doomscrolling.", {
      maxHashtags: 2,
      includeSourceLink: true,
      sourceUrl: "https://techcrunch.com/a",
      tags: ["AI", "Tech", "Extra"],
    });
    expect(r.tags).toEqual(["AI", "Tech"]);
    expect(r.text).toContain("#AI #Tech");
    expect(r.text).toContain("https://techcrunch.com/a");
  });

  it("dedupes tags", () => {
    expect(normalizeTags(["AI", "#ai", "Agents"], 3)).toEqual(["AI", "Agents"]);
  });
});

describe("extractOgImage", () => {
  it("parses og:image", () => {
    const html = `<html><head>
      <meta property="og:image" content="https://cdn.example/img.jpg" />
    </head></html>`;
    expect(extractOgImage(html)).toBe("https://cdn.example/img.jpg");
  });
});
