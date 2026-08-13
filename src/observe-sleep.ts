import type { AppConfig } from "./config.js";

/** Fresh random sleep each cycle — e.g. 60s, 150s, 240s, … up to max (≤360). */
export function nextObserveSleepSeconds(cfg: AppConfig): number {
  let min = cfg.OBSERVE_SLEEP_MIN_SECONDS ?? 60;
  let max = cfg.OBSERVE_SLEEP_MAX_SECONDS ?? 360;
  if (max < min) [min, max] = [max, min];
  min = Math.max(30, Math.min(360, min));
  max = Math.max(min, Math.min(360, max));
  return min + Math.floor(Math.random() * (max - min + 1));
}
