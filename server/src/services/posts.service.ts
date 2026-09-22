import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { checkAndIncrementUsage } from "./usage.service.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";

// ── Stub scores — replace with real Jev/LLM calls in agents-api later ─────────

function generateStubScores() {
  const rand = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
  return {
    hookScore: rand(50, 95),
    structureScore: rand(50, 95),
    sentimentScore: rand(40, 90),
    shareabilityScore: rand(45, 92),
    aiSlopScore: rand(0, 30),
    overallScore: rand(55, 90),
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

  // Extract the post ID from the URL
  const match = url.match(/\/status\/(\d+)/);
  const platformPostId = match ? match[1] : url;

  const scores = generateStubScores();

  // Upsert a Post record + PostScore
  const post = await prisma.post.upsert({
    where: { connectedAccountId_platformPostId: { connectedAccountId: accountId, platformPostId } },
    create: {
      connectedAccountId: accountId,
      platformPostId,
      type: "TEXT",
      text: url, // placeholder until we fetch post text from X API
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
    message: "Stub analysis — connect agents-api for real Jev/LLM scores",
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
