/**
 * Keep X posts plain: no markdown underscores, no em-dash "essay" joins.
 * LLMs love "insight — restated caption"; we strip that habit.
 */

/** Remove __bold__ / _italic_ markdown wrappers (keep inner text). */
export function stripMarkdownUnderscores(text: string): string {
  return text
    .replace(/__([^_\n]+)__/g, "$1")
    .replace(/(^|[^A-Za-z0-9])_([^_\n]+)_(?![A-Za-z0-9])/g, "$1$2");
}

/**
 * Drop trailing " — long caption" tails and replace remaining dashes
 * with normal sentence punctuation.
 */
export function stripEmDashStyle(text: string): string {
  let t = text.trim();
  // Only strip attribution/caption tails that come AFTER a finished sentence
  // e.g. "...flies. — Elon Musk presenting Falcon 9..."
  t = t.replace(/([.!?])\s*[—–]\s+[^—–\n]{10,}\s*$/u, "$1");
  // Mid-sentence em/en dashes → period + capitalize next letter
  t = t.replace(/\s*[—–]\s*([A-Za-z])/gu, (_m, c: string) => `. ${c.toUpperCase()}`);
  t = t.replace(/\s*[—–]\s*/gu, ". ");
  t = t.replace(/\s+--\s+/g, ". ");
  t = t.replace(/\.\s*\./g, ".");
  t = t.replace(/\s{2,}/g, " ").trim();
  return t;
}

export function cleanChatText(text: string): string {
  return stripEmDashStyle(stripMarkdownUnderscores(text.trim())).replace(
    /\s+/g,
    " "
  );
}

export function hasForbiddenDashStyle(text: string): boolean {
  return /[—–]/.test(text) || /\s--\s/.test(text) || /__[^_]+__/.test(text);
}
