import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { assertAccountBelongsToUser } from "./accounts.service.js";
import type { DraftKind } from "@prisma/client";

export interface CreateDraftInput {
  body: string;
  kind: DraftKind;
  opportunityId?: string;
  scheduledAt?: Date;
}

export async function getDraftQueue(accountId: string, userId: string) {
  await assertAccountBelongsToUser(accountId, userId);
  return prisma.draft.findMany({
    where: { connectedAccountId: accountId, status: { in: ["DRAFT", "SCHEDULED"] } },
    orderBy: { createdAt: "desc" },
    include: { opportunity: { select: { sourceHandle: true, sourceText: true } } },
  });
}

export async function createDraft(accountId: string, userId: string, input: CreateDraftInput) {
  await assertAccountBelongsToUser(accountId, userId);
  return prisma.draft.create({
    data: {
      connectedAccountId: accountId,
      body: input.body,
      kind: input.kind,
      opportunityId: input.opportunityId,
      scheduledAt: input.scheduledAt,
      guardrailResults: {}, // populated by agents-api guardrail check
      status: "DRAFT",
    },
  });
}

export async function approveDraft(draftId: string, userId: string) {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId },
    include: { connectedAccount: { select: { userId: true } } },
  });
  if (!draft || draft.connectedAccount.userId !== userId) {
    throw AppError.notFound("Draft not found");
  }
  if (draft.status !== "DRAFT") {
    throw AppError.badRequest(`Draft is already ${draft.status.toLowerCase()}`);
  }
  return prisma.draft.update({
    where: { id: draftId },
    data: { status: "SCHEDULED", approvedAt: new Date() },
  });
}

export async function publishDraft(draftId: string, userId: string) {
  const draft = await prisma.draft.findFirst({
    where: { id: draftId },
    include: { connectedAccount: { select: { userId: true } } },
  });
  if (!draft || draft.connectedAccount.userId !== userId) {
    throw AppError.notFound("Draft not found");
  }
  if (!draft.approvedAt) {
    throw AppError.forbidden("Draft must be approved before publishing");
  }
  // Stub — real X API publish goes here via agents-api
  return prisma.draft.update({
    where: { id: draftId },
    data: { status: "PUBLISHED", publishedPostId: `stub-${Date.now()}` },
  });
}
