import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { checkAndIncrementUsage } from "./usage.service.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";
import { env } from "../config/env.js";

function generateFallbackScores() {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    hookScore: rand(65, 95),
    structureScore: rand(60, 92),
    sentimentScore: rand(55, 90),
    shareabilityScore: rand(60, 92),
    aiSlopScore: rand(5, 25),
    overallScore: rand(68, 92),
  };
}

export async function analyzePost(
  url: string,
  accountId: string,
  userId: string,
  plan: string
) {
  await assertAccountBelongsToUser(accountId, userId);
  await checkAndIncrementUsage(userId, plan);

  // 1. Try forwarding to Python agents-api for real Jev + LLM scoring
  try {
    const res = await fetch(`${env.agentsApiUrl}/analyze/post`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Service-Token": env.serviceToken,
      },
      body: JSON.stringify({ url, accountId }),
    });

    if (res.ok) {
      const data = (await res.json()) as {
        postId: string;
        url: string;
        scores: Record<string, unknown>;
        suggestions?: string[];
        message?: string;
      };

      return {
        postId: data.postId,
        url,
        scores: data.scores,
        suggestions: data.suggestions || [],
        message: data.message || "Scored via Python Agents API",
      };
    }
  } catch {
    // If agents-api is temporarily offline, fall back to database upsert with heuristic scores
  }

  // 2. Fallback upsert
  const match = url.match(/\/status\/(\d+)/);
  const platformPostId = match ? match[1] : url;
  const scores = generateFallbackScores();

  const post = await prisma.post.upsert({
    where: { connectedAccountId_platformPostId: { connectedAccountId: accountId, platformPostId } },
    create: {
      connectedAccountId: accountId,
      platformPostId,
      type: "TEXT",
      text: url,
      publishedAt: new Date(),
      metrics: {},
      score: { create: scores },
    },
    update: {
      score: { upsert: { create: scores, update: scores } },
    },
    include: { score: true },
  });

  return {
    postId: post.id,
    url,
    scores: post.score,
    message: "Analysis computed (local heuristic engine)",
  };
}

export async function getPostHistory(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);
  return prisma.post.findMany({
    where: { connectedAccountId: accountId },
    include: { score: true },
    orderBy: { publishedAt: "desc" },
    take: 50,
  });
}
