import type { Request, Response, NextFunction } from "express";
import { listAccounts, disconnectAccount } from "../services/accounts.service.js";

export async function getAccounts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const accounts = await listAccounts(req.user!.id);
    res.json({ accounts });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const id = req.params["id"] as string;
    await disconnectAccount(id, req.user!.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}
