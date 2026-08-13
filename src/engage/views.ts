/**
 * Parse X view strings: "19.2K", "1.1M", "852", "20,100".
 */
export function parseViewCount(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.replace(/,/g, "").trim().toUpperCase();
  const m = s.match(/^([\d.]+)\s*([KMB])?\s*(VIEWS?)?$/i);
  if (!m) {
    const m2 = s.match(/([\d.]+)\s*([KMB])?\s*VIEWS?/i);
    if (!m2) return undefined;
    const n = Number(m2[1]);
    if (!Number.isFinite(n)) return undefined;
    const suf = (m2[2] || "").toUpperCase();
    if (suf === "K") return Math.round(n * 1_000);
    if (suf === "M") return Math.round(n * 1_000_000);
    if (suf === "B") return Math.round(n * 1_000_000_000);
    return Math.round(n);
  }
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const suf = (m[2] || "").toUpperCase();
  if (suf === "K") return Math.round(n * 1_000);
  if (suf === "M") return Math.round(n * 1_000_000);
  if (suf === "B") return Math.round(n * 1_000_000_000);
  return Math.round(n);
}
