import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";

export async function listAccounts(userId: string) {
  return prisma.connectedAccount.findMany({
    where: { userId },
    select: {
      id: true,
      platform: true,
      platformUserId: true,
      handle: true,
      status: true,
      connectedAt: true,
      disconnectedAt: true,
    },
    orderBy: { connectedAt: "asc" },
  });
}

export async function disconnectAccount(accountId: string, userId: string): Promise<void> {
  const account = await prisma.connectedAccount.findFirst({
    where: { id: accountId, userId },
  });
  if (!account) throw AppError.notFound("Account not found or does not belong to you");

  await prisma.connectedAccount.update({
    where: { id: accountId },
    data: {
      status: "DISCONNECTED",
      disconnectedAt: new Date(),
      // Wipe tokens on disconnect
      accessTokenEnc: "",
      refreshTokenEnc: null,
    },
  });
}

export async function assertAccountBelongsToUser(accountId: string, userId: string): Promise<void> {
  const account = await prisma.connectedAccount.findFirst({
    where: { id: accountId, userId, status: "CONNECTED" },
    select: { id: true },
  });
  if (!account) throw AppError.forbidden("Account not found or access denied");
}
