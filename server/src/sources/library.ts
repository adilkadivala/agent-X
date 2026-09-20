import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { SourceItem } from "../types.js";

const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer }) => {
    getText: () => Promise<{ text: string; total?: number }>;
    destroy?: () => Promise<void>;
  };
};

const LIBRARY_DIRS = [
  "/home/k-adi/school/ai-stuff/ai-related",
  "/home/k-adi/school/ai-stuff/full-pdf",
  "/home/k-adi/school/ai-stuff/go through",
  "/home/k-adi/school/ai-stuff/in-complete",
  "/home/k-adi/school/ai-stuff/learn",
];

export async function loadLibrary(): Promise<SourceItem[]> {
  const allPdfs: string[] = [];
  for (const dir of LIBRARY_DIRS) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      if (file.toLowerCase().endsWith(".pdf")) {
        allPdfs.push(path.join(dir, file));
      }
    }
  }

  if (allPdfs.length === 0) return [];
  const randomPdf = allPdfs[Math.floor(Math.random() * allPdfs.length)];

  try {
    const dataBuffer = fs.readFileSync(randomPdf);
    const parser = new PDFParse({ data: dataBuffer });
    let text = "";
    try {
      const data = await parser.getText();
      text = (data.text || "").slice(0, 4000);
    } finally {
      await parser.destroy?.();
    }

    return [
      {
        id: `lib-${Buffer.from(randomPdf).toString("base64").slice(0, 16)}`,
        source_type: "library",
        title: path.basename(randomPdf),
        facts: [
          `Source: PDF Document "${path.basename(randomPdf)}"`,
          `Extracted Content: ${text}`,
        ],
        raw: { pdfPath: randomPdf },
        fetched_at: new Date().toISOString(),
      },
    ];
  } catch (err) {
    console.error(`Failed to parse PDF ${randomPdf}:`, (err as Error).message);
    return [];
  }
}
