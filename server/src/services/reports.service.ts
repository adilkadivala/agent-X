import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";

export async function getLatestReport(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);
  const report = await prisma.report.findFirst({
    where: { connectedAccountId: accountId },
    orderBy: { createdAt: "desc" },
  });
  if (!report) throw AppError.notFound("No reports found for this account. Run a refresh to generate one.");
  return report;
}

export async function getReportHistory(accountId: string, userId: string, page = 1, pageSize = 20) {
  await assertAccountBelongsToUser(accountId, userId);
  const [reports, total] = await prisma.$transaction([
    prisma.report.findMany({
      where: { connectedAccountId: accountId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, type: true, periodStart: true, periodEnd: true, createdAt: true },
    }),
    prisma.report.count({ where: { connectedAccountId: accountId } }),
  ]);
  return { reports, total, page, pageSize };
}

export async function triggerReportRefresh(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);

  const now = new Date();
  const periodStart = new Date(now);
  periodStart.setDate(now.getDate() - 30);

  // Create a stub report — real payload will be computed by agents-api
  const report = await prisma.report.create({
    data: {
      connectedAccountId: accountId,
      type: "POSTMORTEM",
      payload: {
        status: "pending",
        message: "Analysis queued — agents-api will populate this report",
      },
      periodStart,
      periodEnd: now,
    },
  });

  return report;
}
