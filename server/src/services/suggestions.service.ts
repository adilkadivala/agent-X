import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";
import type { SuggestionCategory } from "@prisma/client";

export async function getSuggestions(
  accountId: string,
  userId: string,
  category?: SuggestionCategory
) {
  await assertAccountBelongsToUser(accountId, userId);
  return prisma.suggestion.findMany({
    where: {
      connectedAccountId: accountId,
      status: "NEW",
      ...(category ? { category } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export async function acceptSuggestion(suggestionId: string, userId: string) {
  const suggestion = await prisma.suggestion.findFirst({
    where: { id: suggestionId },
    include: { connectedAccount: { select: { userId: true } } },
  });
  if (!suggestion || suggestion.connectedAccount.userId !== userId) {
    throw AppError.notFound("Suggestion not found");
  }
  return prisma.suggestion.update({
    where: { id: suggestionId },
    data: { status: "ACCEPTED" },
  });
}

export async function dismissSuggestion(suggestionId: string, userId: string) {
  const suggestion = await prisma.suggestion.findFirst({
    where: { id: suggestionId },
    include: { connectedAccount: { select: { userId: true } } },
  });
  if (!suggestion || suggestion.connectedAccount.userId !== userId) {
    throw AppError.notFound("Suggestion not found");
  }
  return prisma.suggestion.update({
    where: { id: suggestionId },
    data: { status: "DISMISSED" },
  });
}
