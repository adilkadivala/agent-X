import type { Request, Response, NextFunction } from "express";
import { getSuggestions, acceptSuggestion, dismissSuggestion } from "../services/suggestions.service.js";
import type { SuggestionCategory } from "@prisma/client";

export async function listSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accountId = req.params["accountId"] as string;
    const { category } = req.query as { category?: SuggestionCategory };
    const suggestions = await getSuggestions(accountId, req.user!.id, category);
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
}

export async function accept(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params["id"] as string;
    const suggestion = await acceptSuggestion(id, req.user!.id);
    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
}

export async function dismiss(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params["id"] as string;
    const suggestion = await dismissSuggestion(id, req.user!.id);
    res.json({ suggestion });
  } catch (err) {
    next(err);
  }
}
