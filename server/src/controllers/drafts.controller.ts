import type { Request, Response, NextFunction } from "express";
import { getDraftQueue, createDraft, approveDraft, publishDraft } from "../services/drafts.service.js";
import { AppError } from "../lib/errors.js";
import type { DraftKind } from "@prisma/client";

export async function getDrafts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const drafts = await getDraftQueue(accountId, req.user!.id);
    res.json({ drafts });
  } catch (err) {
    next(err);
  }
}

export async function createDraftHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const { body, kind, opportunityId, scheduledAt } = req.body as {
      body?: string;
      kind?: DraftKind;
      opportunityId?: string;
      scheduledAt?: string;
    };
    if (!body) throw AppError.badRequest("body is required");
    if (!kind || !["ORIGINAL", "REPLY", "QUOTE"].includes(kind)) {
      throw AppError.badRequest("kind must be ORIGINAL, REPLY, or QUOTE");
    }
    const draft = await createDraft(accountId, req.user!.id, {
      body,
      kind,
      opportunityId,
      scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
    });
    res.status(201).json({ draft });
  } catch (err) {
    next(err);
  }
}

export async function approveDraftHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params["id"] as string;
    const draft = await approveDraft(id, req.user!.id);
    res.json({ draft });
  } catch (err) {
    next(err);
  }
}

export async function publishDraftHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params["id"] as string;
    const draft = await publishDraft(id, req.user!.id);
    res.json({ draft });
  } catch (err) {
    next(err);
  }
}
