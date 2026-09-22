import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";

const PLAN_LIMITS: Record<string, number | null> = {
  FREE: 4,
  CREATOR: 60,
  PRO: null, // unlimited
  AGENCY: null,
};

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Check if user is within their monthly analysis quota and increment the counter.
 * Throws 402 if over limit.
 */
export async function checkAndIncrementUsage(userId: string, plan: string): Promise<void> {
  const limit = PLAN_LIMITS[plan] ?? 0;
  const period = currentPeriodKey();

  // Unlimited plans skip the check
  if (limit === null) return;

  const now = new Date();
  const resetAt = new Date(now.getFullYear(), now.getMonth() + 1, 1); // first of next month

  const counter = await prisma.usageCounter.upsert({
    where: { userId_period: { userId, period } },
    create: { userId, period, analysesUsed: 0, resetAt },
    update: {},
  });

  if (counter.analysesUsed >= limit) {
    throw AppError.paymentRequired(
      `You've used all ${limit} analyses for this month. Upgrade your plan to continue.`
    );
  }

  await prisma.usageCounter.update({
    where: { userId_period: { userId, period } },
    data: { analysesUsed: { increment: 1 } },
  });
}

export async function getUsage(userId: string) {
  const period = currentPeriodKey();
  return prisma.usageCounter.findUnique({
    where: { userId_period: { userId, period } },
    select: { analysesUsed: true, resetAt: true, period: true },
  });
}
