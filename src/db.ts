import Database from "better-sqlite3";
import type { ContentMode, PostStatus, RunResult, SourceItem } from "./types.js";

export type Db = Database.Database;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources_seen (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,
  url TEXT,
  title TEXT,
  raw_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sources_fetched ON sources_seen(fetched_at);

CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id TEXT,
  draft TEXT NOT NULL,
  score REAL,
  score_reasons TEXT,
  tweet_id TEXT UNIQUE,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  content_mode TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);

CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  weight REAL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS run_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  result TEXT NOT NULL,
  detail TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS watched_tweets (
  tweet_id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  text TEXT,
  url TEXT NOT NULL,
  published_at TEXT,
  seen_at TEXT NOT NULL,
  status TEXT NOT NULL,
  action TEXT,
  our_draft TEXT,
  engaged_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_watched_handle ON watched_tweets(handle);
CREATE INDEX IF NOT EXISTS idx_watched_status ON watched_tweets(status);

CREATE TABLE IF NOT EXISTS ocr_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  captured_at TEXT NOT NULL,
  premium INTEGER NOT NULL,
  followers INTEGER,
  impressions_90d INTEGER,
  notes TEXT
);

CREATE TABLE IF NOT EXISTS post_metrics (
  post_id INTEGER PRIMARY KEY,
  tweet_id TEXT,
  tweet_url TEXT,
  impressions INTEGER,
  checked_at TEXT,
  FOREIGN KEY(post_id) REFERENCES posts(id)
);
`;

export function openDb(databasePath: string): Db {
  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  // migrate older DBs
  const cols = db
    .prepare(`PRAGMA table_info(posts)`)
    .all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === "content_mode")) {
    db.exec(`ALTER TABLE posts ADD COLUMN content_mode TEXT`);
  }
  return db;
}

export function getConfigValue(db: Db, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM config WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setConfigValue(db: Db, key: string, value: string): void {
  db.prepare(
    `INSERT INTO config (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function upsertSource(db: Db, item: SourceItem): void {
  db.prepare(
    `INSERT INTO sources_seen (id, source_type, url, title, raw_json, fetched_at)
     VALUES (@id, @source_type, @url, @title, @raw_json, @fetched_at)
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       raw_json = excluded.raw_json,
       fetched_at = excluded.fetched_at`
  ).run({
    id: item.id,
    source_type: item.source_type,
    url: item.url ?? null,
    title: item.title ?? null,
    raw_json: JSON.stringify(item),
    fetched_at: item.fetched_at,
  });
}

export function hasPostedSource(db: Db, sourceId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 AS ok FROM posts WHERE source_id = ? AND status = 'posted' LIMIT 1`
    )
    .get(sourceId) as { ok: number } | undefined;
  return Boolean(row);
}

export function recentRejectCount(
  db: Db,
  sourceId: string,
  sinceIso: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM posts
       WHERE source_id = ? AND status = 'rejected' AND created_at >= ?
         AND score_reasons NOT LIKE '%"dry_run"%'
         AND score_reasons NOT LIKE '%dry_run%'`
    )
    .get(sourceId, sinceIso) as { c: number };
  return row.c;
}

export function insertPost(
  db: Db,
  input: {
    source_id: string | null;
    draft: string;
    score: number | null;
    score_reasons: string[];
    status: PostStatus;
    tweet_id?: string | null;
    content_mode?: ContentMode | string | null;
  }
): number {
  const now = new Date().toISOString();
  const info = db
    .prepare(
      `INSERT INTO posts (source_id, draft, score, score_reasons, tweet_id, status, created_at, content_mode)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      input.source_id,
      input.draft,
      input.score,
      JSON.stringify(input.score_reasons),
      input.tweet_id ?? null,
      input.status,
      now,
      input.content_mode ?? null
    );
  return Number(info.lastInsertRowid);
}

/** Recent content modes for diversity (most recent first). */
export function recentContentModes(db: Db, limit = 8): ContentMode[] {
  const rows = db
    .prepare(
      `SELECT content_mode FROM posts
       WHERE content_mode IS NOT NULL AND content_mode != ''
         AND status IN ('posted', 'rejected', 'pending')
       ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as Array<{ content_mode: string }>;
  return rows
    .map((r) => r.content_mode as ContentMode)
    .filter(Boolean);
}

export function updatePost(
  db: Db,
  id: number,
  patch: {
    status: PostStatus;
    tweet_id?: string | null;
    score?: number | null;
    score_reasons?: string[];
  }
): void {
  db.prepare(
    `UPDATE posts SET status = ?, tweet_id = COALESCE(?, tweet_id),
      score = COALESCE(?, score),
      score_reasons = COALESCE(?, score_reasons)
     WHERE id = ?`
  ).run(
    patch.status,
    patch.tweet_id ?? null,
    patch.score ?? null,
    patch.score_reasons ? JSON.stringify(patch.score_reasons) : null,
    id
  );
}

export function insertRunLog(
  db: Db,
  input: {
    started_at: string;
    result: RunResult;
    detail?: string;
    error?: string;
  }
): void {
  db.prepare(
    `INSERT INTO run_log (started_at, result, detail, error) VALUES (?, ?, ?, ?)`
  ).run(
    input.started_at,
    input.result,
    input.detail ?? null,
    input.error ?? null
  );
}

/** Count posted rows in local calendar day for TZ. */
export function postsToday(db: Db, timeZone: string): number {
  const now = new Date();
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const rows = db
    .prepare(`SELECT created_at FROM posts WHERE status = 'posted'`)
    .all() as Array<{ created_at: string }>;

  let count = 0;
  for (const r of rows) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(r.created_at));
    if (key === dayKey) count += 1;
  }
  return count;
}

/** Count successful PDF deep posts today (content_mode = pdf_deep). */
export function pdfPostsToday(db: Db, timeZone: string): number {
  const now = new Date();
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const rows = db
    .prepare(
      `SELECT created_at FROM posts
       WHERE status = 'posted' AND content_mode = 'pdf_deep'`
    )
    .all() as Array<{ created_at: string }>;

  let count = 0;
  for (const r of rows) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(r.created_at));
    if (key === dayKey) count += 1;
  }
  return count;
}

export function lastPdfPostedAt(db: Db): string | null {
  const row = db
    .prepare(
      `SELECT created_at FROM posts
       WHERE status = 'posted' AND content_mode = 'pdf_deep'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export function recoverOrphanPending(db: Db, olderThanMs: number): number {
  const cutoff = new Date(Date.now() - olderThanMs).toISOString();
  const info = db
    .prepare(
      `UPDATE posts SET status = 'failed'
       WHERE status = 'pending' AND created_at < ?`
    )
    .run(cutoff);
  return info.changes;
}

export function lastPostedAt(db: Db): string | null {
  const row = db
    .prepare(
      `SELECT created_at FROM posts WHERE status = 'posted'
       ORDER BY created_at DESC LIMIT 1`
    )
    .get() as { created_at: string } | undefined;
  return row?.created_at ?? null;
}

export type WatchedRowStatus =
  | "seen"
  | "skipped_old"
  | "skipped_rt"
  | "pending"
  | "engaged"
  | "rejected"
  | "failed"
  | "dry_run";

export function getWatchedTweet(
  db: Db,
  tweetId: string
): { status: string } | undefined {
  return db
    .prepare(`SELECT status FROM watched_tweets WHERE tweet_id = ?`)
    .get(tweetId) as { status: string } | undefined;
}

export function upsertWatchedTweet(
  db: Db,
  input: {
    tweetId: string;
    handle: string;
    text: string;
    url: string;
    publishedAt?: string;
    status: WatchedRowStatus;
    action?: string;
    draft?: string;
  }
): void {
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO watched_tweets
      (tweet_id, handle, text, url, published_at, seen_at, status, action, our_draft, engaged_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(tweet_id) DO UPDATE SET
       text = excluded.text,
       status = CASE
         WHEN watched_tweets.status = 'engaged' THEN watched_tweets.status
         ELSE excluded.status
       END,
       action = COALESCE(excluded.action, watched_tweets.action),
       our_draft = COALESCE(excluded.our_draft, watched_tweets.our_draft)`
  ).run(
    input.tweetId,
    input.handle,
    input.text,
    input.url,
    input.publishedAt ?? null,
    now,
    input.status,
    input.action ?? null,
    input.draft ?? null
  );
}

export function markWatchedEngaged(
  db: Db,
  tweetId: string,
  action: string,
  draft: string
): void {
  db.prepare(
    `UPDATE watched_tweets SET status = 'engaged', action = ?, our_draft = ?, engaged_at = ?
     WHERE tweet_id = ?`
  ).run(action, draft, new Date().toISOString(), tweetId);
}

export function engagementsToday(db: Db, timeZone: string): number {
  const now = new Date();
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const rows = db
    .prepare(
      `SELECT engaged_at FROM watched_tweets WHERE status = 'engaged' AND engaged_at IS NOT NULL`
    )
    .all() as Array<{ engaged_at: string }>;
  let count = 0;
  for (const r of rows) {
    const key = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(r.engaged_at));
    if (key === dayKey) count += 1;
  }
  return count;
}

export function lastEngagedAt(db: Db): string | null {
  const row = db
    .prepare(
      `SELECT engaged_at FROM watched_tweets WHERE status = 'engaged' AND engaged_at IS NOT NULL
       ORDER BY engaged_at DESC LIMIT 1`
    )
    .get() as { engaged_at: string } | undefined;
  return row?.engaged_at ?? null;
}

export function insertOcrSnapshot(
  db: Db,
  input: {
    premium: boolean;
    followers: number | null;
    impressions_90d: number | null;
    notes?: string;
  }
): void {
  db.prepare(
    `INSERT INTO ocr_snapshots (captured_at, premium, followers, impressions_90d, notes)
     VALUES (?, ?, ?, ?, ?)`
  ).run(
    new Date().toISOString(),
    input.premium ? 1 : 0,
    input.followers,
    input.impressions_90d,
    input.notes ?? null
  );
}

export function latestOcrSnapshot(db: Db): {
  captured_at: string;
  premium: boolean;
  followers: number | null;
  impressions_90d: number | null;
  notes: string | null;
} | null {
  const row = db
    .prepare(
      `SELECT captured_at, premium, followers, impressions_90d, notes
       FROM ocr_snapshots ORDER BY id DESC LIMIT 1`
    )
    .get() as
    | {
        captured_at: string;
        premium: number;
        followers: number | null;
        impressions_90d: number | null;
        notes: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    captured_at: row.captured_at,
    premium: Boolean(row.premium),
    followers: row.followers,
    impressions_90d: row.impressions_90d,
    notes: row.notes,
  };
}

export function upsertPostMetrics(
  db: Db,
  input: {
    post_id: number;
    tweet_id?: string | null;
    tweet_url?: string | null;
    impressions: number;
  }
): void {
  db.prepare(
    `INSERT INTO post_metrics (post_id, tweet_id, tweet_url, impressions, checked_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(post_id) DO UPDATE SET
       tweet_id = excluded.tweet_id,
       tweet_url = excluded.tweet_url,
       impressions = excluded.impressions,
       checked_at = excluded.checked_at`
  ).run(
    input.post_id,
    input.tweet_id ?? null,
    input.tweet_url ?? null,
    input.impressions,
    new Date().toISOString()
  );
}

/** Sum stored impressions for posts created in the last `days` days. */
export function impressionsLastDays(db: Db, days: number): number {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const rows = db
    .prepare(
      `SELECT pm.impressions AS impressions, p.created_at AS created_at
       FROM post_metrics pm
       JOIN posts p ON p.id = pm.post_id
       WHERE p.status = 'posted' AND pm.impressions IS NOT NULL`
    )
    .all() as Array<{ impressions: number; created_at: string }>;
  let sum = 0;
  for (const r of rows) {
    const t = new Date(r.created_at).getTime();
    if (!Number.isNaN(t) && t >= cutoff) sum += Number(r.impressions) || 0;
  }
  return sum;
}

export function recentPostedForMetrics(
  db: Db,
  limit = 20
): Array<{ id: number; tweet_id: string | null; draft: string }> {
  return db
    .prepare(
      `SELECT id, tweet_id, draft FROM posts
       WHERE status = 'posted' AND tweet_id IS NOT NULL
       ORDER BY id DESC LIMIT ?`
    )
    .all(limit) as Array<{ id: number; tweet_id: string | null; draft: string }>;
}
