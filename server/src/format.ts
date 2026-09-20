/**
 * Finalize post text: body + hashtags + source link.
 * Uses X's t.co URL weighting (23 chars) for length checks.
 */

export const TCO_URL_LENGTH = 23;
export const MAX_POST_WEIGHTED = 280;

const URL_RE = /https?:\/\/[^\s]+/gi;

/** X counts each URL as 23 characters regardless of real length. */
export function weightedLength(text: string): number {
  let len = 0;
  let last = 0;
  const re = new RegExp(URL_RE.source, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    len += m.index - last;
    len += TCO_URL_LENGTH;
    last = m.index + m[0].length;
  }
  len += text.length - last;
  return len;
}

export function extractHashtags(text: string): string[] {
  const tags: string[] = [];
  const re = /#([A-Za-z][A-Za-z0-9_]{0,49})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    tags.push(m[1]);
  }
  return tags;
}

export function normalizeTags(tags: string[], max: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const t = raw.replace(/^#/, "").replace(/[^A-Za-z0-9_]/g, "");
    if (!t || t.length > 50) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= max) break;
  }
  return out;
}

export function stripTrailingHashtagsAndUrls(text: string): string {
  let t = text.trim();
  // peel trailing hashtags / urls from the end repeatedly
  for (let i = 0; i < 20; i++) {
    const next = t
      .replace(/\s+(https?:\/\/\S+)$/i, "")
      .replace(/\s+(#[A-Za-z][A-Za-z0-9_]*)+$/g, "")
      .trim();
    if (next === t) break;
    t = next;
  }
  return t;
}

export type FinalizeOpts = {
  maxHashtags: number;
  includeSourceLink: boolean;
  sourceUrl?: string;
  tags?: string[];
};

/**
 * Build final post: clean body + up to N tags + source URL (for news).
 */
export function finalizePostText(
  draftText: string,
  opts: FinalizeOpts
): { text: string; tags: string[]; reasons: string[] } {
  const reasons: string[] = [];
  let body = stripTrailingHashtagsAndUrls(draftText);
  const fromBody = extractHashtags(draftText);
  const tags = normalizeTags([...(opts.tags || []), ...fromBody], opts.maxHashtags);

  if (tags.length) {
    body = `${body} ${tags.map((t) => `#${t}`).join(" ")}`;
  }

  const url = opts.sourceUrl?.trim();
  if (opts.includeSourceLink && url) {
    const already = body.toLowerCase().includes(url.toLowerCase());
    if (!already) {
      body = `${body}\n${url}`;
      reasons.push("appended source link");
    }
  }

  body = body.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return { text: body, tags, reasons };
}
