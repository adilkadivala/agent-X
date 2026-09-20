import { loadBrowserConfig } from "../config.js";
import { openLoginBrowser } from "../publisher.js";
import { mkdirSync } from "node:fs";
import { config as loadDotenv } from "dotenv";

loadDotenv();

async function main() {
  const cfg = loadBrowserConfig();
  mkdirSync(cfg.BROWSER_PROFILE_DIR, { recursive: true });
  console.log("Profile:", cfg.BROWSER_PROFILE_DIR);
  console.log("Opening X — log in, then close the browser when finished.");
  await openLoginBrowser({
    profileDir: cfg.BROWSER_PROFILE_DIR,
    headless: cfg.HEADLESS,
  });
  console.log("Login session saved to profile dir.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
