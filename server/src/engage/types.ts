/** High-profile timeline engagement (reply / quote). */

export type WatchedTweet = {
  tweetId: string;
  handle: string;
  text: string;
  url: string;
  /** ISO if known */
  publishedAt?: string;
  isRetweet: boolean;
  isReply: boolean;
  /** Impression / view count when scrape can read it */
  views?: number;
};

export type EngageKind = "reply" | "quote";

export type EngageDraft = {
  kind: EngageKind;
  text: string;
  score: number;
  reasons: string[];
  /** Why this action fits the source tweet */
  rationale: string;
};
