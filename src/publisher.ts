/**
 * x.com DOM / selectors live ONLY here.
 *
 * Worker calls postTweet(text) — never touches the DOM.
 *
 *   compose open → type text → click Post → wait success
 */
import { chromium, type BrowserContext, type Page } from "playwright";
import type { PublishResult } from "./types.js";

/** Named selectors — update this file when X redesigns. */
export const SELECTORS = {
  /** Main compose textbox (Draft.js / contenteditable) */
  composer:
    '[data-testid="tweetTextarea_0"], [aria-label="Post text"], div[role="textbox"][data-testid="tweetTextarea_0"]',
  /** Post / Tweet button */
  postButton:
    '[data-testid="tweetButtonInline"], [data-testid="tweetButton"]',
  /** Reply button on a tweet */
  reply: '[data-testid="reply"]',
  /** Retweet / repost button */
  retweet: '[data-testid="retweet"]',
  /** Confirm repost menu — Quote */
  quoteMenu: '[data-testid="retweetConfirm"], [role="menuitem"]',
  /** Like */
  like: '[data-testid="like"]',
  /** Media file input */
  fileInput: 'input[data-testid="fileInput"], input[type="file"][accept*="image"]',
  /** Login wall indicators */
  loginHint: 'input[name="text"], a[href="/login"], [data-testid="loginButton"]',
  /** Challenge / captcha-ish */
  challenge:
    'iframe[src*="captcha"], [data-testid="ocfEnterTextTextInput"], text=Verify',
} as const;

export type PublisherOpts = {
  profileDir: string;
  headless?: boolean;
  /** Never quote/reply/like this handle's posts */
  myHandle?: string;
  /** Local image paths to attach (max ~4; we use 1) */
  imagePaths?: string[];
  /** Post into an X Community instead of public timeline */
  communityId?: string;
  communityName?: string;
  /** Injected for tests */
  launch?: () => Promise<{
    context: BrowserContext;
    close: () => Promise<void>;
  }>;
  typeDelayMs?: { min: number; max: number };
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function randBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/** Strip /analytics etc. so we land on the tweet, not a modal sheet. */
function cleanTweetUrl(url: string): string {
  const m = url.match(/\/([^/?#]+)\/status\/(\d+)/);
  if (!m) return url.split("?")[0];
  return `https://x.com/${m[1]}/status/${m[2]}`;
}

/** Dismiss X layer masks (modals/sheets) that block click. */
async function dismissOverlays(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const mask = page.locator('[data-testid="mask"]').first();
    if (!(await mask.isVisible({ timeout: 400 }).catch(() => false))) break;
    await page.keyboard.press("Escape").catch(() => undefined);
    await sleep(400);
  }
  // Click away any leftover sheet close buttons
  const close = page
    .locator('[data-testid="app-bar-close"], [aria-label="Close"]')
    .first();
  if (await close.isVisible({ timeout: 300 }).catch(() => false)) {
    await close.click({ timeout: 2000 }).catch(() => undefined);
    await sleep(300);
  }
}

async function safeClick(
  page: Page,
  locator: ReturnType<Page["locator"]>,
  label: string
): Promise<PublishResult | null> {
  await dismissOverlays(page);
  try {
    await locator.click({ timeout: 8_000 });
    return null;
  } catch {
    await dismissOverlays(page);
    try {
      await locator.click({ force: true, timeout: 5_000 });
      return null;
    } catch (err) {
      return {
        ok: false,
        kind: "selector_break",
        message: `${label}: ${(err as Error).message}`,
      };
    }
  }
}

export async function detectLoginWall(page: Page): Promise<boolean> {
  const url = page.url();
  if (/\/(login|i\/flow\/login)/i.test(url)) return true;
  try {
    const login = page.locator(SELECTORS.loginHint).first();
    if (await login.isVisible({ timeout: 1500 }).catch(() => false)) {
      // composer absent + login present
      const composer = page.locator(SELECTORS.composer).first();
      const hasComposer = await composer
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (!hasComposer) return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

export async function detectChallenge(page: Page): Promise<boolean> {
  try {
    const el = page.locator(SELECTORS.challenge).first();
    return await el.isVisible({ timeout: 1500 }).catch(() => false);
  } catch {
    return false;
  }
}

async function defaultLaunch(
  profileDir: string,
  headless: boolean
): Promise<{ context: BrowserContext; close: () => Promise<void> }> {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 800 },
    args: ["--disable-blink-features=AutomationControlled"],
  });
  return {
    context,
    close: async () => {
      await context.close();
    },
  };
}

/**
 * Human-ish type into composer (per-key delay).
 */
export async function typeIntoComposer(
  page: Page,
  text: string,
  delay: { min: number; max: number }
): Promise<void> {
  const box = page.locator(SELECTORS.composer).first();
  await box.waitFor({ state: "visible", timeout: 20_000 });
  await box.click();
  // Clear any draft
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+A" : "Control+A"
  );
  await page.keyboard.press("Backspace");
  for (const ch of text) {
    await page.keyboard.type(ch, {
      delay: randBetween(delay.min, delay.max),
    });
  }
}

/**
 * Switch compose audience from "Everyone" to a joined Community.
 * Prefer communityId (href match); fall back to visible communityName.
 */
export async function selectCommunityAudience(
  page: Page,
  opts: { communityId?: string; communityName?: string }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const id = (opts.communityId || "").trim();
  const name = (opts.communityName || "").trim();
  if (!id && !name) {
    return { ok: false, message: "community id/name missing" };
  }

  // Already showing this community in the audience pill?
  if (name) {
    const already = page
      .getByRole("button", { name: new RegExp(name, "i") })
      .first();
    if (await already.isVisible({ timeout: 1200 }).catch(() => false)) {
      return { ok: true };
    }
  }

  // Open audience picker (label varies: Everyone / Public / Choose audience)
  const triggers = [
    page.getByRole("button", { name: /^Everyone$/i }),
    page.getByRole("button", { name: /Choose audience/i }),
    page.getByRole("button", { name: /^Public$/i }),
    page.locator('[aria-label*="Choose audience" i]').first(),
    page.locator('button').filter({ hasText: /^Everyone$/i }).first(),
  ];
  let opened = false;
  for (const t of triggers) {
    if (await t.isVisible({ timeout: 900 }).catch(() => false)) {
      await t.click({ force: true }).catch(() => undefined);
      await sleep(700);
      opened = true;
      break;
    }
  }
  if (!opened) {
    return {
      ok: false,
      message: "audience picker not found (are you in compose?)",
    };
  }

  const menu = page
    .locator('[role="dialog"], [data-testid="HoverCard"], [role="menu"]')
    .first();
  await menu.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);

  // Scroll virtualized community list a few times while searching
  for (let pass = 0; pass < 8; pass++) {
    if (id) {
      const byHref = page
        .locator(
          `a[href*="/i/communities/${id}"], [href*="communities/${id}"], [data-testid*="${id}"]`
        )
        .first();
      if (await byHref.isVisible({ timeout: 400 }).catch(() => false)) {
        await byHref.click({ force: true });
        await sleep(800);
        return { ok: true };
      }
    }
    if (name) {
      const byName = page
        .getByRole("button", { name: new RegExp(`^${name}$`, "i") })
        .or(page.getByText(name, { exact: true }))
        .first();
      if (await byName.isVisible({ timeout: 400 }).catch(() => false)) {
        await byName.click({ force: true });
        await sleep(800);
        return { ok: true };
      }
      // Broader: any clickable containing the name inside the menu
      const loose = menu.locator(`text=${name}`).first();
      if (await loose.isVisible({ timeout: 300 }).catch(() => false)) {
        await loose.click({ force: true });
        await sleep(800);
        return { ok: true };
      }
    }

    await menu.evaluate((el) => {
      el.scrollTop += 280;
    }).catch(() => undefined);
    await page.mouse.wheel(0, 400).catch(() => undefined);
    await sleep(350);
  }

  await page.keyboard.press("Escape").catch(() => undefined);
  return {
    ok: false,
    message: `community not found in audience list (${name || id}). Join it first.`,
  };
}

/** Compose + post on an already-open page (does not close the browser). */
export async function postTweetOnPage(
  page: Page,
  text: string,
  opts: Pick<
    PublisherOpts,
    "imagePaths" | "typeDelayMs" | "communityId" | "communityName"
  > = {}
): Promise<PublishResult> {
  const delay = opts.typeDelayMs ?? { min: 30, max: 80 };
  const communityId = (opts.communityId || "").trim();
  const communityName = (opts.communityName || "").trim();
  const postToCommunity = Boolean(communityId || communityName);

  try {
    if (postToCommunity && communityId) {
      // Landing on the community first makes the audience pill more reliable
      await page.goto(`https://x.com/i/communities/${communityId}`, {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await sleep(randBetween(1200, 2000));
    }

    await page.goto("https://x.com/compose/post", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(randBetween(800, 1600));

    if (await detectLoginWall(page)) {
      return {
        ok: false,
        kind: "login_required",
        message: "Login wall — run npm run browser:login",
      };
    }
    if (await detectChallenge(page)) {
      return {
        ok: false,
        kind: "browser_challenge",
        message: "Challenge/captcha detected",
      };
    }

    if (postToCommunity) {
      const picked = await selectCommunityAudience(page, {
        communityId,
        communityName,
      });
      if (!picked.ok) {
        return {
          ok: false,
          kind: "error",
          message: `community audience: ${picked.message}`,
        };
      }
      console.log(
        `publisher: audience → community ${communityName || communityId}`
      );
    }

    try {
      await typeIntoComposer(page, text, delay);
    } catch (err) {
      return {
        ok: false,
        kind: "selector_break",
        message: `Composer not found: ${(err as Error).message}`,
      };
    }

    const images = (opts.imagePaths || []).filter(Boolean).slice(0, 4);
    if (images.length) {
      try {
        const input = page.locator(SELECTORS.fileInput).first();
        await input.setInputFiles(images);
        await sleep(randBetween(1500, 3000));
      } catch (err) {
        return {
          ok: false,
          kind: "selector_break",
          message: `Image attach failed: ${(err as Error).message}`,
        };
      }
    }

    await sleep(randBetween(1000, 2500));
    const fail = await clickPost(page);
    if (fail) return fail;
    await sleep(randBetween(1500, 3000));

    if (await detectChallenge(page)) {
      return {
        ok: false,
        kind: "browser_challenge",
        message: "Challenge after submit",
      };
    }

    let tweetUrl: string | undefined;
    let tweetId: string | undefined;
    const url = page.url();
    const m = url.match(/status\/(\d+)/);
    if (m) {
      tweetId = m[1];
      tweetUrl = url;
    }

    return { ok: true, tweetUrl, tweetId };
  } catch (err) {
    return {
      ok: false,
      kind: "error",
      message: (err as Error).message,
    };
  }
}

export async function postTweet(
  text: string,
  opts: PublisherOpts
): Promise<PublishResult> {
  const headless = opts.headless ?? false;
  const launched = opts.launch
    ? await opts.launch()
    : await defaultLaunch(opts.profileDir, headless);

  try {
    const page =
      launched.context.pages()[0] || (await launched.context.newPage());
    return await postTweetOnPage(page, text, opts);
  } finally {
    await launched.close();
  }
}

async function clickPost(page: Page): Promise<PublishResult | null> {
  const btn = page.locator(SELECTORS.postButton).first();
  try {
    await btn.waitFor({ state: "visible", timeout: 10_000 });
    try {
      await btn.click({ timeout: 8_000 });
    } catch {
      await btn.click({ force: true, timeout: 5_000 });
    }
  } catch (err) {
    return {
      ok: false,
      kind: "selector_break",
      message: `Post button failed: ${(err as Error).message}`,
    };
  }
  return null;
}

async function withBrowserSession<T>(
  opts: PublisherOpts,
  fn: (page: Page, context: BrowserContext) => Promise<T>
): Promise<T> {
  const headless = opts.headless ?? false;
  const launched = opts.launch
    ? await opts.launch()
    : await defaultLaunch(opts.profileDir, headless);
  try {
    const page =
      launched.context.pages()[0] || (await launched.context.newPage());
    return await fn(page, launched.context);
  } finally {
    await launched.close();
  }
}

function isOwnTweetUrl(tweetUrl: string, myHandle?: string): boolean {
  const me = (myHandle || "").replace(/^@/, "").trim().toLowerCase();
  if (!me) return false;
  const m = tweetUrl.match(/\/([^/?#]+)\/status\/\d+/i);
  return Boolean(m && m[1].toLowerCase() === me);
}

/** After quote composer opens, abort if the attached card is our own post. */
async function quoteComposerTargetsOwn(
  page: Page,
  myHandle?: string
): Promise<boolean> {
  const me = (myHandle || "").replace(/^@/, "").trim().toLowerCase();
  if (!me) return false;
  // Only the compose dialog — not background feed links
  const sel = `[role="dialog"] a[href*="/${me}/status/"]`;
  try {
    const n = await page.locator(sel).count();
    return n > 0;
  } catch {
    return false;
  }
}

/** Reply on an already-open page (does not close the browser). */
export async function replyOnPage(
  page: Page,
  tweetUrl: string,
  text: string,
  opts: {
    alsoLike?: boolean;
    myHandle?: string;
    typeDelayMs?: { min: number; max: number };
  } = {}
): Promise<PublishResult> {
  const delay = opts.typeDelayMs ?? { min: 30, max: 80 };
  const url = cleanTweetUrl(tweetUrl);
  try {
    if (isOwnTweetUrl(url, opts.myHandle)) {
      return {
        ok: false,
        kind: "error",
        message: "refused: will not reply to / like own post",
      };
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(randBetween(1000, 2000));
    await dismissOverlays(page);

    if (await detectLoginWall(page)) {
      return {
        ok: false,
        kind: "login_required",
        message: "Login wall — run npm run browser:login",
      };
    }
    if (await detectChallenge(page)) {
      return {
        ok: false,
        kind: "browser_challenge",
        message: "Challenge/captcha detected",
      };
    }

    // Never like our own posts
    if (opts.alsoLike && !isOwnTweetUrl(url, opts.myHandle)) {
      const like = page.locator(SELECTORS.like).first();
      await safeClick(page, like, "Like");
      await sleep(randBetween(400, 900));
    }

    const replyBtn = page.locator(SELECTORS.reply).first();
    const clickFail = await safeClick(page, replyBtn, "Reply button");
    if (clickFail) return clickFail;
    await sleep(randBetween(600, 1200));

    try {
      await typeIntoComposer(page, text, delay);
    } catch (err) {
      return {
        ok: false,
        kind: "selector_break",
        message: `Reply composer: ${(err as Error).message}`,
      };
    }

    await sleep(randBetween(800, 1600));
    const fail = await clickPost(page);
    if (fail) return fail;
    await sleep(randBetween(1500, 2800));

    if (await detectChallenge(page)) {
      return {
        ok: false,
        kind: "browser_challenge",
        message: "Challenge after reply",
      };
    }
    return { ok: true, tweetUrl: url };
  } catch (err) {
    return { ok: false, kind: "error", message: (err as Error).message };
  }
}

/**
 * Reply under an existing tweet.
 */
export async function replyToTweet(
  tweetUrl: string,
  text: string,
  opts: PublisherOpts & { alsoLike?: boolean; myHandle?: string }
): Promise<PublishResult> {
  try {
    return await withBrowserSession(opts, async (page) =>
      replyOnPage(page, tweetUrl, text, opts)
    );
  } catch (err) {
    return { ok: false, kind: "error", message: (err as Error).message };
  }
}

/** Quote on an already-open page (does not close the browser). */
export async function quoteOnPage(
  page: Page,
  tweetUrl: string,
  text: string,
  opts: {
    alsoLike?: boolean;
    myHandle?: string;
    typeDelayMs?: { min: number; max: number };
  } = {}
): Promise<PublishResult> {
  const delay = opts.typeDelayMs ?? { min: 30, max: 80 };
  const url = cleanTweetUrl(tweetUrl);
  try {
    if (isOwnTweetUrl(url, opts.myHandle)) {
      return {
        ok: false,
        kind: "error",
        message: "refused: will not quote / like own post",
      };
    }

    await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    await sleep(randBetween(1000, 2000));
    await dismissOverlays(page);

    if (await detectLoginWall(page)) {
      return {
        ok: false,
        kind: "login_required",
        message: "Login wall — run npm run browser:login",
      };
    }
    if (await detectChallenge(page)) {
      return {
        ok: false,
        kind: "browser_challenge",
        message: "Challenge/captcha detected",
      };
    }

    if (opts.alsoLike && !isOwnTweetUrl(url, opts.myHandle)) {
      const like = page.locator(SELECTORS.like).first();
      await safeClick(page, like, "Like");
      await sleep(randBetween(400, 900));
    }

    const rt = page.locator(SELECTORS.retweet).first();
    const rtFail = await safeClick(page, rt, "Repost button");
    if (rtFail) return rtFail;
    await sleep(500);
    try {
      const quoteItem = page
        .locator('[role="menuitem"]')
        .filter({ hasText: /quote/i })
        .first();
      if (await quoteItem.isVisible({ timeout: 3000 }).catch(() => false)) {
        await quoteItem.click({ force: true });
      } else {
        await page.goto(
          `https://x.com/compose/post?url=${encodeURIComponent(url)}`,
          { waitUntil: "domcontentloaded", timeout: 60_000 }
        );
      }
    } catch (err) {
      return {
        ok: false,
        kind: "selector_break",
        message: `Quote menu: ${(err as Error).message}`,
      };
    }
    await sleep(randBetween(800, 1500));

    // If X attached OUR post in the quote card (nested QT mishap), abort — no post
    if (await quoteComposerTargetsOwn(page, opts.myHandle)) {
      await page.keyboard.press("Escape").catch(() => undefined);
      await sleep(400);
      await page.keyboard.press("Escape").catch(() => undefined);
      return {
        ok: false,
        kind: "error",
        message: "refused: quote composer targets own post",
      };
    }

    try {
      await typeIntoComposer(page, text, delay);
    } catch (err) {
      return {
        ok: false,
        kind: "selector_break",
        message: `Quote composer: ${(err as Error).message}`,
      };
    }

    await sleep(randBetween(800, 1600));
    const fail = await clickPost(page);
    if (fail) return fail;
    await sleep(randBetween(1500, 2800));

    if (await detectChallenge(page)) {
      return {
        ok: false,
        kind: "browser_challenge",
        message: "Challenge after quote",
      };
    }
    return { ok: true, tweetUrl: url };
  } catch (err) {
    return { ok: false, kind: "error", message: (err as Error).message };
  }
}

/**
 * Quote-tweet an existing post.
 */
export async function quoteTweet(
  tweetUrl: string,
  text: string,
  opts: PublisherOpts & { alsoLike?: boolean; myHandle?: string }
): Promise<PublishResult> {
  try {
    return await withBrowserSession(opts, async (page) =>
      quoteOnPage(page, tweetUrl, text, opts)
    );
  } catch (err) {
    return { ok: false, kind: "error", message: (err as Error).message };
  }
}

/**
 * Long-lived X browser — open once, observe/post/engage without closing.
 * Call close() only on shutdown.
 */
export type AgentSession = {
  page: Page;
  context: BrowserContext;
  close: () => Promise<void>;
  post: (
    text: string,
    opts?: Pick<
      PublisherOpts,
      "imagePaths" | "typeDelayMs" | "communityId" | "communityName"
    >
  ) => Promise<PublishResult>;
  reply: (
    tweetUrl: string,
    text: string,
    opts?: { alsoLike?: boolean; myHandle?: string }
  ) => Promise<PublishResult>;
  quote: (
    tweetUrl: string,
    text: string,
    opts?: { alsoLike?: boolean; myHandle?: string }
  ) => Promise<PublishResult>;
  /** Return to home feed and keep the window on X. */
  goHome: () => Promise<void>;
};

export async function openAgentSession(
  opts: PublisherOpts
): Promise<AgentSession> {
  const headless = opts.headless ?? false;
  const launched = opts.launch
    ? await opts.launch()
    : await defaultLaunch(opts.profileDir, headless);
  const page =
    launched.context.pages()[0] || (await launched.context.newPage());

  await page.goto("https://x.com/home", {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await sleep(randBetween(1200, 2200));

  if (await detectLoginWall(page)) {
    await launched.close();
    throw new Error("Login wall — run npm run browser:login first");
  }

  // Prefer For you tab as the resting surface
  const forYou = page.getByRole("tab", { name: /^For you$/i });
  if (await forYou.isVisible({ timeout: 3000 }).catch(() => false)) {
    await forYou.click().catch(() => undefined);
    await sleep(randBetween(700, 1200));
  }

  return {
    page,
    context: launched.context,
    close: launched.close,
    post: (text, o) => postTweetOnPage(page, text, o ?? {}),
    reply: (url, text, o) =>
      replyOnPage(page, url, text, {
        ...o,
        myHandle: o?.myHandle || opts.myHandle,
      }),
    quote: (url, text, o) =>
      quoteOnPage(page, url, text, {
        ...o,
        myHandle: o?.myHandle || opts.myHandle,
      }),
    goHome: async () => {
      await page.goto("https://x.com/home", {
        waitUntil: "domcontentloaded",
        timeout: 60_000,
      });
      await sleep(randBetween(800, 1400));
      // Always land on For you (not Following)
      const forYou = page.getByRole("tab", { name: /^For you$/i });
      if (await forYou.isVisible({ timeout: 2500 }).catch(() => false)) {
        await forYou.click().catch(() => undefined);
        await sleep(randBetween(600, 1100));
      }
    },
  };
}

/** Launch browser, run callback with page, then close (one-shot). */
export async function withAgentBrowser<T>(
  opts: PublisherOpts,
  fn: (page: Page) => Promise<T>
): Promise<T> {
  return withBrowserSession(opts, async (page) => fn(page));
}

/** Open profile browser for manual login (does not post). */
export async function openLoginBrowser(opts: {
  profileDir: string;
  headless?: boolean;
}): Promise<void> {
  const { context, close } = await defaultLaunch(
    opts.profileDir,
    opts.headless ?? false
  );
  try {
    const page = context.pages()[0] || (await context.newPage());
    await page.goto("https://x.com/home", {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    console.log(
      "Log into X in this window. When done, close the browser or press Ctrl+C here."
    );
    // Keep open until user closes browser
    await new Promise<void>((resolve) => {
      context.on("close", () => resolve());
    });
  } finally {
    try {
      await close();
    } catch {
      /* already closed */
    }
  }
}
