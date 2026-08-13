/**
 * One-shot PDF deep post (independent of observe/engage).
 * Usage: FORCE_RUN=true DRY_RUN=true npm run pdf-post
 */
import { loadConfig, ensureDataDirs } from "../config.js";
import { openDb } from "../db.js";
import { acquireLock } from "../lock.js";
import { createLlmFromConfig } from "../draft.js";
import { openAgentSession } from "../publisher.js";
import { runPdfPostOnce } from "../pdf-post.js";

async function main(): Promise<void> {
  const cfg = loadConfig();
  ensureDataDirs(cfg);

  const lock = acquireLock(cfg.LOCK_PATH);
  if (!lock) {
    console.log("Another worker holds the lock — exiting.");
    process.exit(0);
  }

  const db = openDb(cfg.DATABASE_PATH);
  const llm = createLlmFromConfig({ ...cfg, timeoutMs: 120_000 });

  let session = null as Awaited<ReturnType<typeof openAgentSession>> | null;
  try {
    if (!cfg.DRY_RUN) {
      session = await openAgentSession({
        profileDir: cfg.BROWSER_PROFILE_DIR,
        headless: cfg.HEADLESS,
      });
    }
    const result = await runPdfPostOnce({
      cfg,
      db,
      llm,
      session: session ?? undefined,
    });
    console.log("pdf-post result:", result);
  } finally {
    try {
      await session?.close();
    } catch {
      /* ignore */
    }
    db.close();
    lock.release();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
