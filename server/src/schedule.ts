import type { AppConfig } from "./config.js";

/** Local hour 0-23 in cfg.TZ */
export function localHour(timeZone: string, now = new Date()): number {
  const hourStr = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    hour12: false,
  }).format(now);
  // en-US hour12:false can yield "24" for midnight in some engines — normalize
  let h = Number(hourStr);
  if (h === 24) h = 0;
  return h;
}

export function inPostWindow(
  windows: AppConfig["postWindows"],
  timeZone: string,
  now = new Date()
): boolean {
  const hour = localHour(timeZone, now);
  return windows.some((w) => hour >= w.start && hour < w.end);
}

/**
 * Returns true if we should proceed (inside window and jitter allows).
 * FORCE_RUN bypasses. OCR_MODE + OCR_IGNORE_WINDOWS bypasses windows/jitter.
 */
export function shouldAttemptPost(
  cfg: Pick<
    AppConfig,
    | "FORCE_RUN"
    | "postWindows"
    | "TZ"
    | "WINDOW_JITTER"
    | "OCR_MODE"
    | "OCR_IGNORE_WINDOWS"
  >,
  now = new Date(),
  random: () => number = Math.random
): { ok: boolean; reason?: string } {
  if (cfg.FORCE_RUN) return { ok: true };
  if (cfg.OCR_MODE && cfg.OCR_IGNORE_WINDOWS) return { ok: true };
  if (!inPostWindow(cfg.postWindows, cfg.TZ, now)) {
    return { ok: false, reason: "outside_window" };
  }
  if (random() > cfg.WINDOW_JITTER) {
    return { ok: false, reason: "jitter_skip" };
  }
  return { ok: true };
}
