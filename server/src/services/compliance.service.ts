import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";

export async function getComplianceData(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);

  const [flags, totalChecked] = await prisma.$transaction([
    prisma.complianceFlag.findMany({
      where: { connectedAccountId: accountId },
      include: {
        rule: { select: { ruleId: true, category: true, description: true, severity: true, sourceUrl: true } },
        post: { select: { platformPostId: true, text: true, publishedAt: true } },
      },
      orderBy: { flaggedAt: "desc" },
      take: 100,
    }),
    prisma.post.count({ where: { connectedAccountId: accountId } }),
  ]);

  const openFlags = flags.filter((f) => f.status === "OPEN");
  const score = totalChecked === 0
    ? 100
    : Math.max(0, Math.round(100 - (openFlags.length / Math.max(totalChecked, 1)) * 100));

  return { score, flags, openFlagCount: openFlags.length, totalPostsChecked: totalChecked };
}

export async function dismissFlag(flagId: string, userId: string): Promise<void> {
  const flag = await prisma.complianceFlag.findFirst({
    where: { id: flagId },
    include: { connectedAccount: { select: { userId: true } } },
  });
  if (!flag || flag.connectedAccount.userId !== userId) {
    throw AppError.notFound("Flag not found");
  }
  await prisma.complianceFlag.update({
    where: { id: flagId },
    data: { status: "DISMISSED", resolvedAt: new Date() },
  });
}
