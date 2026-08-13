import { describe, it, expect } from "vitest";
import {
  scorePdfDeepDraft,
  polishPdfFormat,
  lineCount,
  emojiBulletCount,
} from "../src/pdf-post.js";
import { listPdfs, renderPdfPages } from "../src/sources/pdf-deep.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const scannable = `Most engineers treat RL like a UNIVERSAL HAMMER

Very few know when it is the WRONG TOOL

That is the interview edge that actually matters

What must be true before you pick RL:

✅ Dense reward that mirrors business value
✅ Cheap massive interactions (sim or traffic)
✅ Environment stationary enough to learn
✅ Clear failure mode if the policy drifts
✅ A simpler baseline already measured
✅ Team that can debug credit assignment

Bottom line: skip RL until those conditions HOLD.`;

describe("pdf format helpers", () => {
  it("counts lines and emoji bullets", () => {
    expect(lineCount(scannable)).toBeGreaterThanOrEqual(10);
    expect(emojiBulletCount(scannable)).toBeGreaterThanOrEqual(5);
  });

  it("polishes newlines", () => {
    const dirty = "Hook one.\n\n\n\n✅ Point";
    expect(polishPdfFormat(dirty)).toBe("Hook one.\n\n✅ Point");
  });
});

describe("scorePdfDeepDraft", () => {
  it("passes a scannable emoji-line draft", () => {
    const r = scorePdfDeepDraft(
      {
        text: scannable,
        tags: [],
        claims: [],
        score: 0.85,
        reasons: ["ok"],
        content_mode: "pdf_deep",
      },
      {
        bannedPhrases: [],
        threshold: 0.75,
        wordMin: 80,
        wordMax: 250,
      }
    );
    expect(r.pass).toBe(true);
  });

  it("rejects wall of text", () => {
    const wall =
      "Reading the RL system design guide reminded me of one thing: the most valuable thing you can say in an interview and in a product decision is that RL is the wrong tool here. Too many engineers treat reinforcement learning like a universal hammer swinging it at any problem that has a loop. The truth is RL is fragile high-leverage and only shines when three conditions hold you have a well-defined dense reward that truly reflects business value you can generate massive low-cost interactions and the environment is stationary enough that a policy learned today will not be obsolete tomorrow when auction dynamics change overnight.";
    const r = scorePdfDeepDraft(
      {
        text: wall,
        tags: [],
        claims: [],
        score: 0.9,
        reasons: [],
        content_mode: "pdf_deep",
      },
      { bannedPhrases: [], threshold: 0.75, wordMin: 80, wordMax: 250 }
    );
    expect(r.pass).toBe(false);
  });

  it("rejects too few emoji bullets", () => {
    const weak = `Most people jump into reinforcement learning too early

Very few stop to ask if it is even the right tool for the job

That mistake shows up in interviews and in production systems alike

What usually gets ignored before choosing RL:

Point about reward design without any emoji marker here
Point about cheap interaction data without any emoji marker
Point about stationary environments without any emoji marker
Point about measuring a simple baseline first without emoji
Point about debugging credit assignment in noisy loops

Bottom line stay disciplined and pick the simpler model when you can.`;
    const r = scorePdfDeepDraft(
      {
        text: weak,
        tags: [],
        claims: [],
        score: 0.9,
        reasons: [],
        content_mode: "pdf_deep",
      },
      { bannedPhrases: [], threshold: 0.75, wordMin: 80, wordMax: 250 }
    );
    expect(r.pass).toBe(false);
    expect(r.reasons.some((x) => /emoji bullets/.test(x))).toBe(true);
  });
});

describe("listPdfs / multi-page thumbs", () => {
  it("lists learn PDFs when dir exists", () => {
    const dir = "/home/k-adi/school/ai-stuff/learn";
    if (!fs.existsSync(dir)) return;
    const pdfs = listPdfs([dir]);
    expect(pdfs.length).toBeGreaterThan(0);
  });

  it("renders at least two page thumbnails", () => {
    const dir = "/home/k-adi/school/ai-stuff/learn";
    if (!fs.existsSync(dir)) return;
    const pdfs = listPdfs([dir]);
    if (!pdfs.length) return;
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), "pdfthumb-"));
    try {
      const thumbs = renderPdfPages(pdfs[0], cache, {
        pages: 2,
        dpi: 72,
        pageCount: 10,
      });
      expect(thumbs.length).toBeGreaterThanOrEqual(2);
      for (const t of thumbs) {
        expect(fs.existsSync(t)).toBe(true);
        expect(fs.statSync(t).size).toBeGreaterThan(1000);
      }
    } finally {
      fs.rmSync(cache, { recursive: true, force: true });
    }
  });
});
