import type { Request, Response, NextFunction } from "express";
import { prisma } from "../prisma/client.js";
import { readSessionToken, tokenFromCookieHeader } from "../lib/session.js";
import { AppError } from "../lib/errors.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  plan: string;
}

// Extend Express Request to carry the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const token = tokenFromCookieHeader(req.headers.cookie);
    const payload = readSessionToken(token);
    if (!payload) throw AppError.unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, email: true, name: true, subscriptions: { where: { status: "ACTIVE" }, include: { plan: { select: { tier: true } } }, take: 1 } },
    });

    if (!user) throw AppError.unauthorized("Session expired. Please reconnect.");

    const activeSub = user.subscriptions[0];
    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      plan: activeSub?.plan.tier ?? "FREE",
    };

    next();
  } catch (err) {
    next(err);
  }
}
