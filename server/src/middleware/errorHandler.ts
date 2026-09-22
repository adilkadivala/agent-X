import type { Request, Response, NextFunction } from "express";
import { AppError } from "../lib/errors.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message, code: err.code });
    return;
  }
  const message = err instanceof Error ? err.message : "Unexpected server error";
  console.error("[error]", err);
  res.status(500).json({ error: message, code: "INTERNAL_ERROR" });
}
