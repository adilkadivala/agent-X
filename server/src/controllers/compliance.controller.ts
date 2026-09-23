import type { Request, Response, NextFunction } from "express";
import { getComplianceData, dismissFlag } from "../services/compliance.service.js";

export async function complianceData(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const data = await getComplianceData(accountId, req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function dismissFlagHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const flagId = req.params["flagId"] as string;
    await dismissFlag(flagId, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
