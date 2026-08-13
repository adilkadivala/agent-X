import fs from "node:fs";
import type { ContentMode, DraftResult, SourceItem } from "./types.js";
export type { LlmClient } from "./llm.js";
export {
  createLlmClient,
  createLlmFromConfig,
  createOpenAiClient,
  resolveLlmProvider,
} from "./llm.js";
import type { LlmClient } from "./llm.js";
import { cleanChatText } from "./text-style.js";

export function loadVoiceSamples(filePath: string): string[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8");
  return raw
    .split(/\n\s*\n/)
    .map((p) =>
      p
        .split("\n")
        .filter((line) => !line.trim().startsWith("#"))
        .join("\n")
        .trim()
    )
    .filter((p) => p.length > 0);
}

function sampleBlock(samples: string[]): string {
  return samples.length > 0
    ? samples
        .slice(0, 12)
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")
    : "(no samples — write like a thoughtful builder: direct, concrete, no hype)";
}

function modeInstructions(mode: ContentMode): string {
  switch (mode) {
    case "tech_news":
      return `MODE: tech_news
- React to the headline like a human who builds software — not a news desk.
- One sharp take or one real question. 80–180 chars body ideal.
- You may reference the story ("per X: …") but do NOT write a press-release summary.
- No "I shipped" claims about other companies' products.`;
    case "hot_take":
      return `MODE: hot_take
- Pure opinion. NO news summary. NO mandatory link.
- One spicy-but-defensible builder take. Matches samples like:
  "At this point if AI writes 90% of code who even survives in tech?"
- Optional topic spark in FACTS — use as inspiration only, invent no fake news.
- 60–160 chars preferred. No hashtags required.`;
    case "meme":
      return `MODE: meme
- Funny / relatable AI-builder humor. Can be absurdist or dry.
- Think: meme caption energy, still in the author's voice.
- Short. One punchline. No essay. No "RT if".
- If an image is attached, caption should fit the image; do not describe the image literally like alt-text.`;
    case "screenshot":
      return `MODE: screenshot
- Caption a real screenshot/build photo the author is posting.
- First person ok: what you were debugging, shipping, or noticing.
- Short. Concrete. Not "check out my UI 🔥".
- Do not invent product metrics not in the facts/filename hints.`;
    case "ship_note":
      return `MODE: ship_note
- First-person build note from the author's inbox facts.
- What shipped / broke / was learned — tiny and honest.
- No fake feature lists.`;
    case "question":
      return `MODE: question
- One genuine question builders actually ask each other.
- NOT engagement bait ("RT if you agree", "who else…").
- Prefer curiosity over dunking.`;
    default:
      return `MODE: general short post in author's voice.`;
  }
}

function buildSystem(
  samples: string[],
  maxHashtags: number,
  mode: ContentMode
): string {
  return `You write short X (Twitter) posts that feel like a real human account — variety matters.

VOICE SAMPLES (match length, tone, rhythm):
${sampleBlock(samples)}

${modeInstructions(mode)}

GLOBAL STYLE:
- Human, not corporate. One idea per post.
- Plain sentences. NEVER use em dashes (—), --, or markdown underscores (__ / _).
- NEVER append " — restated caption" tails.
- No "RT if", "follow for more", "link in bio", "bookmark this".
- Never solicit likes/follows/RTs. Never talk about monetization, payouts, or Creator Revenue Sharing.
- No emoji spam. Lowercase ok if samples use it.
- tags: 0–${maxHashtags} tags WITHOUT # (often empty — samples rarely hashtag).
- "text" = post body ONLY (no raw URLs, no hashtags — added later when needed).
- Return ONLY valid JSON (no markdown fences):
{"text":"...","tags":[],"claims":["..."],"score":0.0,"reasons":["..."]}
- score: 0-1 voice match honesty (essays that ignore samples score low).
- claims: grounded facts only; empty ok for pure opinion/meme/question.`;
}

export function buildUserPrompt(source: SourceItem, mode: ContentMode): string {
  const imageNote = source.localImagePath
    ? `\nLOCAL IMAGE ATTACHED: ${source.localImagePath} (will be posted with this caption)`
    : source.imageUrl
      ? `\nREMOTE IMAGE CANDIDATE: ${source.imageUrl}`
      : "\nNO IMAGE";

  return `CONTENT MODE: ${mode}
SOURCE TYPE: ${source.source_type}
TITLE: ${source.title || "(none)"}
URL: ${source.url || "(none)"}${imageNote}
FACTS:
${source.facts.map((f) => `- ${f}`).join("\n")}

Write one X post as JSON for this mode.`;
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("LLM response is not JSON");
    return JSON.parse(match[0]);
  }
}

export async function draftPost(
  source: SourceItem,
  opts: {
    samples: string[];
    llm: LlmClient;
    maxHashtags?: number;
    mode?: ContentMode;
  }
): Promise<DraftResult> {
  const maxHashtags = opts.maxHashtags ?? 3;
  const mode = opts.mode || source.content_mode || "tech_news";
  const system = buildSystem(opts.samples, maxHashtags, mode);
  const user = buildUserPrompt(source, mode);
  const raw = await opts.llm.complete(system, user);
  const data = extractJson(raw) as {
    text?: string;
    tags?: string[];
    claims?: string[];
    score?: number;
    reasons?: string[];
  };

  if (!data.text || typeof data.text !== "string") {
    throw new Error("LLM JSON missing text");
  }

  return {
    text: cleanChatText(data.text),
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    claims: Array.isArray(data.claims) ? data.claims.map(String) : [],
    score: typeof data.score === "number" ? data.score : 0,
    reasons: Array.isArray(data.reasons) ? data.reasons.map(String) : [],
    content_mode: mode,
  };
}
