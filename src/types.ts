export type SourceType =
  | "rss"
  | "inbox"
  | "google_news"
  | "local_media"
  | "spark"
  | "library";

/** What kind of human post we're making this cycle */
export type ContentMode =
  | "tech_news"
  | "hot_take"
  | "meme"
  | "screenshot"
  | "ship_note"
  | "question"
  | "pdf_deep";

export type SourceItem = {
  id: string;
  source_type: SourceType;
  url?: string;
  title?: string;
  /** Remote image candidate (RSS enclosure / media) */
  imageUrl?: string;
  /** Local file to attach (screenshot / meme asset) */
  localImagePath?: string;
  /** Article publish time when known (ISO) — used for freshness ranking */
  published_at?: string;
  facts: string[];
  raw: unknown;
  fetched_at: string;
  /** Set when this source was chosen for a specific content mode */
  content_mode?: ContentMode;
};

export type PauseReason =
  | "paused_manual"
  | "browser_challenge"
  | "login_required";

export type RunResult =
  | "noop"
  | "quality_fail"
  | "posted"
  | "paused"
  | "error"
  | "dry_run";

export type PostStatus = "pending" | "posted" | "rejected" | "failed";

export type DraftResult = {
  text: string;
  /** Suggested hashtags without # — finalized separately */
  tags: string[];
  claims: string[];
  score: number;
  reasons: string[];
  content_mode?: ContentMode;
};

export type QualityResult = {
  pass: boolean;
  score: number;
  reasons: string[];
  text: string;
};

export type PublishResult =
  | { ok: true; tweetUrl?: string; tweetId?: string }
  | {
      ok: false;
      kind: "login_required" | "browser_challenge" | "selector_break" | "error";
      message: string;
    };
