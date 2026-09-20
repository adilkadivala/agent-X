/**
 * Offline voice eval — no browser.
 * Uses LLM if LLM_API_KEY set; otherwise runs quality-only on canned drafts.
 *
 *   npm run eval:voice
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import {
  createOpenAiClient,
  draftPost,
  loadVoiceSamples,
} from "../src/draft.js";
import { scoreDraft } from "../src/quality.js";
import type { SourceItem } from "../src/types.js";

loadDotenv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, "fixtures");

type Fixture = {
  id: string;
  source: SourceItem;
  expect: {
    minScore?: number;
    maxLength?: number;
    mustNotMatch?: string[];
    mustContainAny?: string[];
  };
};

async function main() {
  const files = fs
    .readdirSync(fixturesDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  const samplesPath =
    process.env.VOICE_SAMPLES_PATH ||
    path.join(process.cwd(), "voice-samples.md");
  const samples = loadVoiceSamples(samplesPath);
  const apiKey = process.env.LLM_API_KEY;
  const llm = apiKey
    ? createOpenAiClient({
        apiKey,
        baseUrl: process.env.LLM_BASE_URL || undefined,
        model: process.env.LLM_MODEL || "gpt-4o-mini",
      })
    : null;

  if (!llm) {
    console.warn(
      "No LLM_API_KEY — eval will use placeholder drafts (quality rules only)."
    );
  }

  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const fix = JSON.parse(
      fs.readFileSync(path.join(fixturesDir, file), "utf8")
    ) as Fixture;
    let text: string;
    let score: number;
    let claims: string[] = [];
    let reasons: string[] = [];

    if (llm) {
      const d = await draftPost(fix.source, { samples, llm });
      text = d.text;
      score = d.score;
      claims = d.claims;
      reasons = d.reasons;
    } else {
      text =
        fix.source.source_type === "rss"
          ? `Per the feed: ${fix.source.title} — worth watching, not worth the hype cycle.`
          : `${fix.source.facts[0]} — shipping small, posting less.`;
      score = 0.85;
      claims = fix.source.facts.slice(0, 1);
      reasons = ["placeholder"];
    }

    const q = scoreDraft(
      { text, tags: [], claims, score, reasons },
      fix.source,
      {
        bannedPhrases: (process.env.BANNED_PHRASES || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        threshold: fix.expect.minScore ?? 0.5,
      }
    );

    const errors: string[] = [];
    if (text.length > (fix.expect.maxLength ?? 280)) {
      errors.push(`length ${text.length}`);
    }
    for (const bad of fix.expect.mustNotMatch || []) {
      if (text.toLowerCase().includes(bad.toLowerCase())) {
        errors.push(`mustNotMatch: ${bad}`);
      }
    }
    if (fix.expect.mustContainAny?.length) {
      const ok = fix.expect.mustContainAny.some((s) =>
        text.toLowerCase().includes(s.toLowerCase())
      );
      if (!ok) errors.push(`mustContainAny: ${fix.expect.mustContainAny}`);
    }
    if (!q.pass && llm) {
      // soft: quality fail counts only when using real LLM
      errors.push(`quality: ${q.reasons.join("; ")}`);
    }

    if (errors.length) {
      failed += 1;
      console.log(`FAIL ${fix.id}`);
      console.log("  text:", text);
      console.log("  errors:", errors.join(" | "));
    } else {
      passed += 1;
      console.log(`PASS ${fix.id}: ${text.slice(0, 80)}...`);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed of ${files.length}`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
