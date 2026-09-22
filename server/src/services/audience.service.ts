import { prisma } from "../prisma/client.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";

export async function getFollowerBreakdown(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);

  const samples = await prisma.followerSample.groupBy({
    by: ["classifiedType"],
    where: { connectedAccountId: accountId },
    _count: { classifiedType: true },
  });

  const total = samples.reduce((sum, s) => sum + s._count.classifiedType, 0);

  const breakdown = samples.map((s) => ({
    type: s.classifiedType,
    count: s._count.classifiedType,
    percentage: total > 0 ? Math.round((s._count.classifiedType / total) * 100) : 0,
  }));

  const topFollowers = await prisma.followerSample.findMany({
    where: { connectedAccountId: accountId },
    orderBy: { engagementCount: "desc" },
    take: 20,
    select: {
      platformFollowerId: true,
      handle: true,
      classifiedType: true,
      engagementCount: true,
      lastActiveAt: true,
    },
  });

  return { breakdown, total, topFollowers };
}

/**
 * Stub active-times response.
 * Real implementation reads from Post.publishedAt and aggregates by day/hour.
 */
export async function getActiveTimes(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);

  // Compute day-of-week counts from ingested posts
  const posts = await prisma.post.findMany({
    where: { connectedAccountId: accountId },
    select: { publishedAt: true, metrics: true },
    orderBy: { publishedAt: "desc" },
    take: 200,
  });

  // Build day buckets (0=Sun … 6=Sat)
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const p of posts) {
    dayCounts[new Date(p.publishedAt).getDay()]++;
  }

  return {
    dayActivity: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => ({
      day,
      postCount: dayCounts[i],
    })),
    bestWindow: "Based on ingested data — connect agents-api for AI-powered recommendations",
    totalPostsAnalyzed: posts.length,
  };
}
