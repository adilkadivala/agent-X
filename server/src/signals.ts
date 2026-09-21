import type { WatchedTweet } from "./engage/types.js";

export type SignalSuggestion = {
  tweet: WatchedTweet;
  score: number;
  kind: "reply" | "quote";
  reasons: string[];
};

export type SignalPreferences = {
  topics: string[];
  creatorHandles: string[];
  followingHandles: string[];
};

const normalize = (value: string) => value.trim().toLowerCase();

/**
 * Rank posts supplied by an authorized X API ingestion job.
 * This module only recommends actions; publishing remains an explicit user action.
 */
export function rankSignalSuggestions(
  posts: WatchedTweet[],
  preferences: SignalPreferences,
): SignalSuggestion[] {
  const topics = preferences.topics.map(normalize).filter(Boolean);
  const creators = new Set(preferences.creatorHandles.map(normalize));
  const following = new Set(preferences.followingHandles.map(normalize));

  return posts
    .filter((post) => post.text.trim().length > 0 && !post.isReply && !post.isRetweet)
    .map((tweet) => {
      const text = normalize(tweet.text);
      const topicMatches = topics.filter((topic) => text.includes(topic)).length;
      const creatorMatch = creators.has(normalize(tweet.handle));
      const followedMatch = following.has(normalize(tweet.handle));
      const viewScore = Math.min(30, Math.round(Math.log10((tweet.views ?? 0) + 1) * 8));
      const score = Math.min(100, 30 + topicMatches * 15 + (creatorMatch ? 18 : 0) + (followedMatch ? 12 : 0) + viewScore);
      const reasons = [
        ...(topicMatches > 0 ? [`${topicMatches} topic match${topicMatches === 1 ? "" : "es"}`] : []),
        ...(creatorMatch ? ["saved creator"] : []),
        ...(followedMatch ? ["from your following"] : []),
        ...(viewScore >= 15 ? ["high current impressions"] : []),
      ];
      const kind: SignalSuggestion["kind"] = score >= 75 ? "quote" : "reply";
      return { tweet, score, kind, reasons };
    })
    .filter((suggestion) => suggestion.score >= 55)
    .sort((a, b) => b.score - a.score);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log("Signal ranking is available to authorized ingestion callers.");
}
