/**
 * Resolve and cache a local image for a source (RSS enclosure / og:image).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

function extFromContentType(ct: string | null): string | null {
  if (!ct) return null;
  const base = ct.split(";")[0].trim().toLowerCase();
  const map: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
  };
  return map[base] || null;
}

function extFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const ext = path.extname(u.pathname).toLowerCase();
    return IMAGE_EXT.has(ext) ? ext : null;
  } catch {
    return null;
  }
}

export function extractOgImage(html: string): string | undefined {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

export async function resolveImageUrl(opts: {
  candidateUrl?: string;
  pageUrl?: string;
  fetchHtml?: (url: string) => Promise<string>;
  timeoutMs?: number;
}): Promise<string | undefined> {
  if (opts.candidateUrl) return opts.candidateUrl;
  if (!opts.pageUrl) return undefined;

  const timeoutMs = opts.timeoutMs ?? 8_000;
  const fetchHtml =
    opts.fetchHtml ??
    (async (url: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          headers: {
            "User-Agent": "x-agent/0.1 (+personal)",
            Accept: "text/html",
          },
          signal: controller.signal,
          redirect: "follow",
        });
        if (!res.ok) throw new Error(`HTML ${res.status}`);
        return await res.text();
      } finally {
        clearTimeout(timer);
      }
    });

  try {
    const html = await fetchHtml(opts.pageUrl);
    return extractOgImage(html);
  } catch {
    return undefined;
  }
}

export async function downloadImage(
  imageUrl: string,
  cacheDir: string,
  opts: { fetchBin?: (url: string) => Promise<{ bytes: Buffer; contentType: string | null }> } = {}
): Promise<string | undefined> {
  fs.mkdirSync(cacheDir, { recursive: true });
  const hash = crypto.createHash("sha256").update(imageUrl).digest("hex").slice(0, 24);

  const fetchBin =
    opts.fetchBin ??
    (async (url: string) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      try {
        const res = await fetch(url, {
          headers: { "User-Agent": "x-agent/0.1 (+personal)" },
          signal: controller.signal,
          redirect: "follow",
        });
        if (!res.ok) throw new Error(`image HTTP ${res.status}`);
        const ct = res.headers.get("content-type");
        if (ct && !ct.toLowerCase().startsWith("image/")) {
          throw new Error(`not an image: ${ct}`);
        }
        const ab = await res.arrayBuffer();
        return { bytes: Buffer.from(ab), contentType: ct };
      } finally {
        clearTimeout(timer);
      }
    });

  try {
    const { bytes, contentType } = await fetchBin(imageUrl);
    if (bytes.length < 1_000 || bytes.length > 5_000_000) {
      return undefined;
    }
    const ext =
      extFromContentType(contentType) || extFromUrl(imageUrl) || ".jpg";
    const filePath = path.join(cacheDir, `${hash}${ext}`);
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, bytes);
    }
    return filePath;
  } catch (err) {
    console.warn("image download failed:", (err as Error).message);
    return undefined;
  }
}
