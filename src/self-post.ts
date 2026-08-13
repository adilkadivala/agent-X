/**
 * Never engage with our own X posts (quote / reply / like).
 */

export function normalizeHandle(handle: string | undefined | null): string {
  return (handle || "").replace(/^@/, "").trim().toLowerCase();
}

/** Author handle embedded in a status URL, if any. */
export function handleFromTweetUrl(tweetUrl: string): string | null {
  const m = tweetUrl.match(/\/([^/?#]+)\/status\/\d+/i);
  if (!m) return null;
  const h = m[1].toLowerCase();
  if (!h || h === "i" || h === "search") return null;
  return h;
}

/**
 * True if this target is our own post (by scraped handle and/or URL path).
 */
export function isOwnPost(opts: {
  handle?: string;
  url?: string;
  myHandle?: string;
}): boolean {
  const me = normalizeHandle(opts.myHandle);
  if (!me) return false;
  const h = normalizeHandle(opts.handle);
  if (h && h === me) return true;
  const fromUrl = opts.url ? handleFromTweetUrl(opts.url) : null;
  return Boolean(fromUrl && fromUrl === me);
}
