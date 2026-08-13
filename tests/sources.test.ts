import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadInbox } from "../src/sources/inbox.js";
import { loadRss } from "../src/sources/rss.js";
import { pickSource } from "../src/sources/pick.js";
import { filterByRecency } from "../src/sources/recency.js";
import {
  buildGoogleNewsRssUrl,
  parseNewsQueries,
} from "../src/sources/google-news.js";
import type { SourceItem } from "../src/types.js";

describe("loadInbox", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "xagent-inbox-"));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("parses txt notes and URLs", () => {
    fs.writeFileSync(
      path.join(dir, "a.txt"),
      "https://example.com/post\nShipped the dry-run path\n"
    );
    fs.writeFileSync(path.join(dir, "b.txt"), "Just a freeform note about agents");
    const items = loadInbox(dir);
    expect(items).toHaveLength(2);
    expect(items[0].source_type).toBe("inbox");
    expect(items.some((i) => i.url?.includes("example.com"))).toBe(true);
    expect(items.every((i) => i.facts.length > 0)).toBe(true);
  });

  it("skips empty files", () => {
    fs.writeFileSync(path.join(dir, "empty.txt"), "  \n");
    expect(loadInbox(dir)).toHaveLength(0);
  });
});

describe("loadRss", () => {
  it("parses fixture XML", async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0"><channel>
        <title>AI News</title>
        <item>
          <title>Model ships</title>
          <link>https://news.example/1</link>
          <guid>g1</guid>
          <pubDate>Tue, 04 Aug 2026 08:00:00 GMT</pubDate>
          <description>A new model shipped today</description>
        </item>
      </channel></rss>`;
    const items = await loadRss("https://feed.example/rss", {
      fetchXml: async () => xml,
    });
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe("Model ships");
    expect(items[0].url).toContain("news.example");
    expect(items[0].source_type).toBe("rss");
    expect(items[0].published_at).toBeTruthy();
  });
});

describe("google news helpers", () => {
  it("builds search RSS URL with when:", () => {
    const url = buildGoogleNewsRssUrl("OpenAI OR Anthropic", { when: "1d" });
    expect(url).toContain("news.google.com/rss/search");
    expect(decodeURIComponent(url)).toContain("when:1d");
  });

  it("parses comma-separated queries", () => {
    expect(parseNewsQueries("a, b ,c")).toEqual(["a", "b", "c"]);
  });
});

describe("filterByRecency", () => {
  it("drops stale news, keeps inbox", () => {
    const now = new Date("2026-08-04T12:00:00.000Z");
    const items: SourceItem[] = [
      {
        id: "old",
        source_type: "google_news",
        facts: [],
        raw: {},
        fetched_at: "2026-08-01T00:00:00.000Z",
        published_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "new",
        source_type: "google_news",
        facts: [],
        raw: {},
        fetched_at: "2026-08-04T10:00:00.000Z",
        published_at: "2026-08-04T10:00:00.000Z",
      },
      {
        id: "note",
        source_type: "inbox",
        facts: ["ship"],
        raw: {},
        fetched_at: "2026-07-01T00:00:00.000Z",
      },
    ];
    const kept = filterByRecency(items, { maxAgeHours: 48, now });
    expect(kept.map((i) => i.id).sort()).toEqual(["new", "note"]);
  });
});

describe("pickSource", () => {
  const mk = (
    id: string,
    type: "inbox" | "rss" | "google_news",
    published_at?: string
  ): SourceItem => ({
    id,
    source_type: type,
    title: id,
    facts: [id],
    raw: {},
    fetched_at: published_at || new Date().toISOString(),
    published_at,
  });

  it("prefers news over inbox by default", () => {
    const picked = pickSource(
      [
        mk("i1", "inbox", "2026-08-04T10:00:00.000Z"),
        mk("g1", "google_news", "2026-08-04T12:00:00.000Z"),
      ],
      {
        hasPosted: () => false,
        rejectCount24h: () => 0,
      }
    );
    expect(picked?.id).toBe("g1");
  });

  it("inbox-first when preferNews=false", () => {
    const picked = pickSource([mk("r1", "rss"), mk("i1", "inbox")], {
      hasPosted: () => false,
      rejectCount24h: () => 0,
      preferNews: false,
    });
    expect(picked?.id).toBe("i1");
  });

  it("picks newest news by published_at", () => {
    const picked = pickSource(
      [
        mk("old", "google_news", "2026-08-01T00:00:00.000Z"),
        mk("new", "google_news", "2026-08-04T08:00:00.000Z"),
      ],
      { hasPosted: () => false, rejectCount24h: () => 0 }
    );
    expect(picked?.id).toBe("new");
  });

  it("skips already posted", () => {
    const picked = pickSource([mk("i1", "inbox")], {
      hasPosted: (id) => id === "i1",
      rejectCount24h: () => 0,
    });
    expect(picked).toBeNull();
  });

  it("skips news rejected in last 24h", () => {
    const picked = pickSource([mk("r1", "rss")], {
      hasPosted: () => false,
      rejectCount24h: () => 1,
    });
    expect(picked).toBeNull();
  });
});
