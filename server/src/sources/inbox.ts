import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SourceItem } from "../types.js";

function hashId(parts: string): string {
  return crypto.createHash("sha256").update(parts).digest("hex").slice(0, 32);
}

/**
 * Read inbox/*.txt — one URL or free-text note per file.
 */
export function loadInbox(inboxDir: string): SourceItem[] {
  if (!fs.existsSync(inboxDir)) return [];
  const files = fs
    .readdirSync(inboxDir)
    .filter((f) => f.endsWith(".txt"))
    .sort();

  const now = new Date().toISOString();
  const items: SourceItem[] = [];

  for (const file of files) {
    const full = path.join(inboxDir, file);
    const body = fs.readFileSync(full, "utf8").trim();
    if (!body) continue;

    const firstLine = body.split("\n")[0]?.trim() ?? "";
    const urlMatch = firstLine.match(/^https?:\/\/\S+/i);
    const url = urlMatch ? urlMatch[0] : undefined;
    const title = url
      ? body.replace(url, "").trim().split("\n")[0] || url
      : firstLine.slice(0, 120);

    const facts = body
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    items.push({
      id: hashId(`inbox:${file}:${body}`),
      source_type: "inbox",
      url,
      title,
      facts,
      raw: { file, body },
      fetched_at: now,
    });
  }

  return items;
}
