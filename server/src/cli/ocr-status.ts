/**
 * OCR eligibility / status CLI.
 * Usage: npm run ocr:status
 *        OCR_REFRESH=true npm run ocr:status   # scrape profile via browser
 */
import { loadConfig, ensureDataDirs } from "../config.js";
import { openDb } from "../db.js";
import { openAgentSession } from "../publisher.js";
import {
  evaluateOcrEligibility,
  formatOcrStatus,
  refreshOcrSnapshot,
} from "../ocr/eligibility.js";
import { recentPostedForMetrics } from "../db.js";
import { trackPostImpressions } from "../ocr/impressions.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureDataDirs(cfg);
  const db = openDb(cfg.DATABASE_PATH);

  const refresh = ["1", "true", "yes", "on"].includes(
    (process.env.OCR_REFRESH || "").toLowerCase()
  );

  let el = evaluateOcrEligibility(cfg, db);

  if (refresh) {
    console.log("ocr: refreshing profile eligibility via browser…");
    const session = await openAgentSession({
      profileDir: cfg.BROWSER_PROFILE_DIR,
      headless: cfg.HEADLESS,
      myHandle: cfg.myHandle,
    });
    try {
      el = await refreshOcrSnapshot(session.page, cfg, db);
      if (cfg.OCR_TRACK_IMPRESSIONS) {
        const recent = recentPostedForMetrics(db, 5);
        for (const p of recent) {
          if (!p.tweet_id) continue;
          await trackPostImpressions(session.page, cfg, db, {
            postId: p.id,
            tweetIdOrUrl: p.tweet_id,
          });
        }
        el = evaluateOcrEligibility(cfg, db);
      }
    } finally {
      await session.close();
    }
  }

  console.log("\n=== X Original Content Rewards status ===\n");
  console.log(formatOcrStatus(cfg, db, el));
  console.log("");
  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
