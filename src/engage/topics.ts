/**
 * Topic gate for For you / discovery: technology, AI, LLMs, Solana/crypto,
 * YC, startups, founders — before we spend tokens on an engage draft.
 */
import type { LlmClient } from "../draft.js";
import type { FeedTweet } from "./discover.js";

/**
 * Broad tech / builder vocabulary. Match ANY of these → eligible on For you
 * (from anyone, not only people you follow).
 */
const KEYWORD_RE =
  /\b(founder|founders|founding|ceo|cto|co[- ]?founder|startup|startups|startupland|product|launch(ed|ing)?|ship(ped|ping)?|funding|fundrais(e|ing)|series\s*[a-d]|seed\s*round|pre[- ]?seed|valuation|raised\s+\$?|invest(ed|ors|ment)|yc\b|y\s*combinator|ycombinator|batch\s*['’]?2[0-9]|demo\s*day|accelerat(or|ed)|saas|arr|mrr|pmf|go[- ]?to[- ]?market|gtm|open[- ]?source|agent(s|ic)?|ai\b|a\.i\.|artificial\s+intelligence|llm|llms|gpt|claude|gemini|grok|o1\b|chatgpt|openai|anthropic|deepseek|mistral|cursor\b|copilot|codegen|vibe\s*cod(e|ing)|prompt(ing|s)?|rag\b|fine[- ]?tun(e|ing)|inference|embedding|transformer|machine\s*learning|\bml\b|neural|gpu|nvidia|cuda|crypto|solana|\$?sol\b|web3|blockchain|token|defi|nft|prediction\s*market(s)?|polymarket|degen|staking|yield|l2|mainnet|ethereum|bitcoin|tech(nology|nical)?|software|engineer(ing|s)?|developer|devtools?|api\b|sdk|leetcode|coding|codebase|github|hackathon|devops|cloud|kubernetes|k8s|docker|rust|python|typescript|javascript|golang|\bgo\b|database|postgres|redis|built\s+this|we('re| are)\s+(live|launching))\b/i;

/** Job / hiring posts — never entertain. */
const JOB_POST_RE =
  /\b(we('?re| are)?\s+hiring|now\s+hiring|hiring\s+(for|a|an|our|remote)|#hiring|job\s*opening|open\s+roles?|open\s+positions?|join\s+our\s+team|looking\s+for\s+(a|an|our)\s+\w+\s+(engineer|developer|designer|manager|intern)|apply\s+(now|here|via|at)|send\s+(your\s+)?(cv|resume|portfolio)|careers?\s+page|job\s+alert|remote\s+role|full[- ]?time\s+role|part[- ]?time\s+role|this\s+role|job\s+description|\bjd\b|hir(e|ing)\s+(immediately|asap)|vacancies|we'?re\s+looking\s+to\s+hire)\b/i;

export type TopicScore = {
  pass: boolean;
  topics: string[];
  reason: string;
  score: number;
};

/** True for hiring / job posts — skip engage. */
export function isJobPost(text: string): boolean {
  return JOB_POST_RE.test(text || "");
}

/** True when the post is about tech / AI / Solana / YC / startups / founders / LLMs. */
export function keywordTopicHit(text: string): TopicScore {
  const t = text || "";
  if (!t.trim()) {
    return { pass: false, topics: [], reason: "empty text", score: 0 };
  }
  if (isJobPost(t)) {
    return {
      pass: false,
      topics: ["job"],
      reason: "job/hiring post — skip",
      score: 0,
    };
  }
  if (!KEYWORD_RE.test(t)) {
    return {
      pass: false,
      topics: [],
      reason: "not tech/AI/startup/founder related",
      score: 0,
    };
  }
  const topics: string[] = [];
  if (
    /\b(ai\b|a\.i\.|llm|gpt|claude|gemini|grok|chatgpt|openai|anthropic|prompt|rag\b|inference|machine\s*learning|\bml\b)\b/i.test(
      t
    )
  ) {
    topics.push("ai");
  }
  if (/\b(solana|\$?sol\b|web3|blockchain|crypto|defi|ethereum|token)\b/i.test(t)) {
    topics.push("solana_crypto");
  }
  if (/\b(yc\b|y\s*combinator|ycombinator|demo\s*day|batch\s*['’]?2[0-9]|accelerat)/i.test(t)) {
    topics.push("yc");
  }
  if (/\b(funding|fundrais|series\s*[a-d]|seed|raised\s+\$|valuation|investor)/i.test(t)) {
    topics.push("funding");
  }
  if (/\b(founder|founders|ceo|cto|co[- ]?founder|startup)/i.test(t)) {
    topics.push("founders");
  }
  if (/\b(product|launch|shipped|saas|agent|built this|devtools?|api\b|sdk)\b/i.test(t)) {
    topics.push("product");
  }
  if (
    /\b(tech|software|engineer|developer|code|leetcode|github|cloud|rust|python|typescript)\b/i.test(
      t
    )
  ) {
    topics.push("technology");
  }
  return {
    pass: true,
    topics: topics.length ? topics : ["technology"],
    reason: "keyword match",
    score: 0.75,
  };
}

/**
 * Optional LLM confirm — use when keywords match but we want higher precision.
 */
export async function llmTopicConfirm(
  tweet: FeedTweet,
  llm: LlmClient
): Promise<TopicScore> {
  const system = `You classify X posts for a builder who engages on: technology, AI/LLMs, Solana/crypto, YC, startups, and founders.
Return ONLY JSON: {"pass":true|false,"topics":["ai"|"solana"|"yc"|"funding"|"founders"|"product"|"technology"],"score":0.0,"reason":"..."}
pass=false for job/hiring posts. pass=true only for tech, AI/ML/LLMs, crypto/Solana, YC, startups, founders, or shipping — not memes, sports, celebrity, politics, or recruiting.
score 0-1 confidence.`;

  const user = `@${tweet.handle}: """${tweet.text.slice(0, 500)}"""`;
  try {
    const raw = await llm.complete(system, user);
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return { pass: false, topics: [], reason: "bad json", score: 0 };
    const data = JSON.parse(m[0]) as {
      pass?: boolean;
      topics?: string[];
      score?: number;
      reason?: string;
    };
    if (isJobPost(tweet.text)) {
      return {
        pass: false,
        topics: ["job"],
        reason: "job/hiring post — skip",
        score: 0,
      };
    }
    return {
      pass: Boolean(data.pass),
      topics: Array.isArray(data.topics) ? data.topics.map(String) : [],
      reason: String(data.reason || ""),
      score: typeof data.score === "number" ? data.score : 0,
    };
  } catch {
    return keywordTopicHit(tweet.text);
  }
}

export function rankForEngage(a: FeedTweet, b: FeedTweet): number {
  // Prefer For you tech posts, then network, then the rest
  const topicBoost = (t: FeedTweet) => (keywordTopicHit(t.text).pass ? 0 : 1);
  const tb = topicBoost(a) - topicBoost(b);
  if (tb !== 0) return tb;

  const srcRank = (s: FeedTweet["source"]) => {
    if (s === "timeline") return 0;
    if (s === "following") return 1;
    if (s === "notifications") return 2;
    if (s === "search") return 3;
    return 4;
  };
  const sr = srcRank(a.source) - srcRank(b.source);
  if (sr !== 0) return sr;
  const va = a.views ?? -1;
  const vb = b.views ?? -1;
  if (va !== vb) return vb - va;
  const ta = a.publishedAt || "";
  const tbTime = b.publishedAt || "";
  if (ta && tbTime) return tbTime.localeCompare(ta);
  return b.tweetId.localeCompare(a.tweetId);
}
