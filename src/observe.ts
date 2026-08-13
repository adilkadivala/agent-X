/**
 * Persistent X observer daemon:
 *   open browser once → keep open → loop(observe → mirror post → engage)
 *
 * Run: npm run observe
 * Stop: Ctrl+C (closes browser on exit)
 */
import { loadConfig, ensureDataDirs, type AppConfig } from "./config.js";
import { openDb, getConfigValue, type Db } from "./db.js";
import { acquireLock } from "./lock.js";
import { createLlmFromConfig } from "./draft.js";
import { openAgentSession, type AgentSession } from "./publisher.js";
import { runObserveCycle } from "./engage/observe-cycle.js";
import { runPdfPostOnce } from "./pdf-post.js";
import { shouldAttemptPost } from "./schedule.js";
import { resolveLlmProvider } from "./llm.js";
import { nextObserveSleepSeconds } from "./observe-sleep.js";
import { formatOcrStatus } from "./ocr/eligibility.js";
import fs from "node:fs";
import path from "node:path";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isPaused(cfg: AppConfig, db: Db): boolean {
  if (cfg.PAUSED) return true;
  const pauseFile = path.join(path.dirname(cfg.DATABASE_PATH), "PAUSED");
  if (fs.existsSync(pauseFile)) return true;
  return getConfigValue(db, "paused") === "true";
}

async function main(): Promise<void> {
  let cfg: AppConfig;
  try {
    cfg = loadConfig();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }

  ensureDataDirs(cfg);

  const lock = acquireLock(cfg.LOCK_PATH);
  if (!lock) {
    console.log("Another worker holds the lock — exiting.");
    process.exit(0);
  }

  const db = openDb(cfg.DATABASE_PATH);
  const provider = resolveLlmProvider(cfg.LLM_PROVIDER);
  const llm = createLlmFromConfig(cfg);
  console.log(
    `LLM: provider=${provider} model=${cfg.LLM_MODEL}` +
      (cfg.LLM_BASE_URL ? ` base=${cfg.LLM_BASE_URL}` : "")
  );
  let session: AgentSession | null = null;
  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n${signal} — closing X window…`);
    try {
      await session?.close();
    } catch {
      /* ignore */
    }
    db.close();
    lock.release();
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    console.log("Opening X (stays open until you stop this process)…");
    session = await openAgentSession({
      profileDir: cfg.BROWSER_PROFILE_DIR,
      headless: cfg.HEADLESS,
      myHandle: cfg.myHandle,
    });
    console.log(
      `observe sleep random ${cfg.OBSERVE_SLEEP_MIN_SECONDS}–${cfg.OBSERVE_SLEEP_MAX_SECONDS}s each cycle — Ctrl+C to stop`
    );
    if (cfg.PDF_POST_ENABLED) {
      console.log(
        `pdf-deep: enabled — up to ${cfg.PDF_DAILY_MAX}/day, gap ${cfg.PDF_MIN_GAP_MINUTES}m, dirs=${cfg.pdfDirs.join(" | ")}`
      );
    }
    if (cfg.OCR_MODE) {
      console.log("OCR mode on:\n" + formatOcrStatus(cfg, db));
    }

    while (!shuttingDown) {
      if (isPaused(cfg, db)) {
        const waitSec = nextObserveSleepSeconds(cfg);
        console.log(`paused — sleeping ${waitSec}s`);
        await sleep(waitSec * 1000);
        continue;
      }

      const now = new Date();

      // Independent of feed engage/mirror: PDF deep posts have their own budget.
      if (cfg.PDF_POST_ENABLED && session) {
        try {
          const pdfResult = await runPdfPostOnce({
            cfg,
            db,
            llm,
            session,
            now: () => now,
          });
          if (pdfResult !== "noop") {
            console.log("pdf-deep cycle:", pdfResult);
          }
        } catch (err) {
          console.error("pdf-deep cycle error:", (err as Error).message);
        }
      }

      const attempt = shouldAttemptPost(cfg, now, Math.random);
      if (!attempt.ok && !cfg.FORCE_RUN) {
        console.log("outside window/jitter — observing feed only (no post/engage)");
        await runObserveCycle({
          cfg,
          db,
          llm,
          session,
          now: () => now,
          skipMirror: true,
          skipEngage: true,
        });
      } else {
        const result = await runObserveCycle({
          cfg,
          db,
          llm,
          session,
          now: () => now,
        });
        console.log("cycle result:", result);
      }

      if (shuttingDown) break;
      const waitSec = nextObserveSleepSeconds(cfg);
      console.log(`sleeping ${waitSec}s (random, X window stays open)…`);
      await sleep(waitSec * 1000);
    }
  } catch (err) {
    console.error(err);
    try {
      await session?.close();
    } catch {
      /* ignore */
    }
    db.close();
    lock.release();
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
