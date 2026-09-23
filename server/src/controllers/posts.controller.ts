import type { Request, Response, NextFunction } from "express";
import { analyzePost, getPostHistory } from "../services/posts.service.js";
import { AppError } from "../lib/errors.js";

export async function analyzePostHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { url, accountId } = req.body as { url?: string; accountId?: string };
    if (!url) throw AppError.badRequest("url is required");
    if (!accountId) throw AppError.badRequest("accountId is required");
    const result = await analyzePost(url, accountId, req.user!.id, req.user!.plan);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getPostHistoryHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const posts = await getPostHistory(accountId, req.user!.id);
    res.json({ posts });
  } catch (err) {
    next(err);
  }
}
