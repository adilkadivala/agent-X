import type { Request, Response, NextFunction } from "express";
import { getLatestReport, getReportHistory, triggerReportRefresh } from "../services/reports.service.js";

export async function latestReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const report = await getLatestReport(accountId, req.user!.id);
    res.json({ report });
  } catch (err) {
    next(err);
  }
}

export async function reportHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const page = Number(req.query.page) || 1;
    const result = await getReportHistory(accountId, req.user!.id, page);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function refreshReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const report = await triggerReportRefresh(accountId, req.user!.id);
    res.status(202).json({ report, message: "Report refresh queued" });
  } catch (err) {
    next(err);
  }
}
