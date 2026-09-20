/**
 * Pick an unpublished PDF from configured dirs, extract text, render page thumbnails.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import type { SourceItem } from "../types.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer }) => {
    getText: () => Promise<{ text: string; total?: number }>;
    destroy?: () => Promise<void>;
  };
};

export type PdfPick = {
  pdfPath: string;
  source: SourceItem;
  /** At least 2 page renders for the post gallery */
  imagePaths: string[];
  /** @deprecated use imagePaths[0] */
  thumbPath: string;
  pageCount?: number;
};

function sourceIdForPdf(pdfPath: string): string {
  const hash = crypto
    .createHash("sha256")
    .update(pdfPath)
    .digest("hex")
    .slice(0, 24);
  return `pdf:${hash}`;
}

export function listPdfs(dirs: string[]): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    if (!dir || !fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (file.toLowerCase().endsWith(".pdf")) {
        out.push(path.join(dir, file));
      }
    }
  }
  return out.sort();
}

export async function extractPdfText(
  pdfPath: string,
  maxChars = 8000
): Promise<{ text: string; pageCount?: number }> {
  const dataBuffer = fs.readFileSync(pdfPath);
  const parser = new PDFParse({ data: dataBuffer });
  try {
    const data = await parser.getText();
    const text = (data.text || "").replace(/\s+/g, " ").trim();
    return { text: text.slice(0, maxChars), pageCount: data.total };
  } finally {
    await parser.destroy?.();
  }
}

/** Render a single PDF page via poppler `pdftoppm`. */
export function renderPdfPage(
  pdfPath: string,
  cacheDir: string,
  page: number,
  opts: { dpi?: number } = {}
): string {
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  const dpi = opts.dpi ?? 110;
  const stem = crypto
    .createHash("sha256")
    .update(`${pdfPath}#${page}`)
    .digest("hex")
    .slice(0, 16);
  const outBase = path.join(cacheDir, `pdfthumb-${stem}-p${page}`);
  const outPng = `${outBase}.png`;
  if (fs.existsSync(outPng) && fs.statSync(outPng).size > 1000) {
    return outPng;
  }

  const result = spawnSync(
    "pdftoppm",
    [
      "-png",
      "-f",
      String(page),
      "-l",
      String(page),
      "-r",
      String(dpi),
      "-singlefile",
      pdfPath,
      outBase,
    ],
    { encoding: "utf8", timeout: 60_000 }
  );
  if (result.status !== 0 || !fs.existsSync(outPng)) {
    const err = (
      result.stderr ||
      result.stdout ||
      result.error?.message ||
      ""
    ).trim();
    throw new Error(
      `pdftoppm page ${page} failed for ${path.basename(pdfPath)}: ${err || "no output"}`
    );
  }
  return outPng;
}

/** @deprecated Prefer renderPdfPage */
export function renderPdfThumbnail(
  pdfPath: string,
  cacheDir: string,
  opts: { dpi?: number } = {}
): string {
  return renderPdfPage(pdfPath, cacheDir, 1, opts);
}

/** Render first N pages (default 2) for a multi-image X post. */
export function renderPdfPages(
  pdfPath: string,
  cacheDir: string,
  opts: { pages?: number; dpi?: number; pageCount?: number } = {}
): string[] {
  const want = opts.pages ?? 2;
  const maxPage = Math.max(1, opts.pageCount || want);
  const pages: number[] = [];
  for (let p = 1; p <= Math.min(want, maxPage); p++) pages.push(p);
  // If only 1 page exists, duplicate isn't useful — still return one
  const out: string[] = [];
  for (const p of pages) {
    try {
      out.push(renderPdfPage(pdfPath, cacheDir, p, { dpi: opts.dpi }));
    } catch (err) {
      if (p === 1) throw err;
      console.warn(
        `pdf thumb page ${p} skipped:`,
        (err as Error).message
      );
    }
  }
  return out;
}

/**
 * Pick one unused PDF (not yet posted), extract text + ≥2 page thumbnails.
 */
export async function pickPdfDeep(opts: {
  dirs: string[];
  cacheDir: string;
  hasPosted: (sourceId: string) => boolean;
  random?: () => number;
  imageCount?: number;
}): Promise<PdfPick | null> {
  const random = opts.random ?? Math.random;
  const imageCount = opts.imageCount ?? 2;
  const all = listPdfs(opts.dirs);
  const unused = all.filter((p) => !opts.hasPosted(sourceIdForPdf(p)));
  if (!unused.length) return null;

  const pdfPath = unused[Math.floor(random() * unused.length)];
  const { text, pageCount } = await extractPdfText(pdfPath);
  if (text.length < 200) {
    throw new Error(`PDF text too short: ${path.basename(pdfPath)}`);
  }
  const imagePaths = renderPdfPages(pdfPath, opts.cacheDir, {
    pages: imageCount,
    pageCount,
  });
  if (!imagePaths.length) {
    throw new Error(`No thumbnails for ${path.basename(pdfPath)}`);
  }

  const id = sourceIdForPdf(pdfPath);
  const title = path.basename(pdfPath);

  return {
    pdfPath,
    imagePaths,
    thumbPath: imagePaths[0],
    pageCount,
    source: {
      id,
      source_type: "library",
      title,
      localImagePath: imagePaths[0],
      facts: [
        `PDF: ${title}`,
        pageCount ? `Pages: ${pageCount}` : "Pages: unknown",
        `Excerpt: ${text}`,
      ],
      raw: { pdfPath, imagePaths, pageCount },
      fetched_at: new Date().toISOString(),
      content_mode: "pdf_deep",
    },
  };
}
