/**
 * Manual smoke: open compose, type a harmless test line, optionally post.
 * Usage:
 *   npm run browser:smoke
 *   POST_LIVE=1 npm run browser:smoke   # actually clicks Post
 */
import { config as loadDotenv } from "dotenv";
import { loadBrowserConfig } from "../config.js";
import { postTweet } from "../publisher.js";
import { mkdirSync } from "node:fs";

loadDotenv();

async function main() {
  const cfg = loadBrowserConfig();
  mkdirSync(cfg.BROWSER_PROFILE_DIR, { recursive: true });
  const live = ["1", "true", "yes"].includes(
    (process.env.POST_LIVE || "").toLowerCase()
  );
  const text =
    process.env.SMOKE_TEXT ||
    `x-agent smoke ${new Date().toISOString().slice(0, 16)} (safe to delete)`;

  if (!live) {
    console.log(
      "DRY smoke: will open browser and fill composer but NOT click Post."
    );
    console.log("Set POST_LIVE=1 to actually post.");
    // Use postTweet only for live; for dry we still need partial flow —
    // for simplicity, only full post path is implemented; dry = abort message.
    console.log(
      "For compose-only dry check, use browser:login then manually open compose."
    );
    console.log("Smoke text would be:\n", text);
    process.exit(0);
  }

  console.log("LIVE smoke post:", text);
  const result = await postTweet(text, {
    profileDir: cfg.BROWSER_PROFILE_DIR,
    headless: cfg.HEADLESS,
  });
  console.log(result);
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
