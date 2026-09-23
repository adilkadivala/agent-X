import type { Request, Response, NextFunction } from "express";
import { getFollowerBreakdown, getActiveTimes } from "../services/audience.service.js";

export async function audienceBreakdown(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const data = await getFollowerBreakdown(accountId, req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function activeTimes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const data = await getActiveTimes(accountId, req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}
