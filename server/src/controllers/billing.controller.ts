import type { Request, Response, NextFunction } from "express";
import {
  getCurrentPlan,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  handleWebhookEvent,
} from "../services/billing.service.js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

export async function getPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = await getCurrentPlan(req.user!.id);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

export async function checkout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tier, interval = "month" } = req.body as { tier?: string; interval?: "month" | "year" };
    if (!tier) throw AppError.badRequest("tier is required");
    if (!["CREATOR", "PRO", "AGENCY"].includes(tier)) {
      throw AppError.badRequest("tier must be CREATOR, PRO, or AGENCY");
    }
    const result = await createCheckoutSession(
      req.user!.id,
      tier,
      interval,
      `${env.dashboardOrigin}/settings?upgraded=true`,
      `${env.dashboardOrigin}/settings`
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function portal(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await createPortalSession(
      req.user!.id,
      `${env.dashboardOrigin}/settings`
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function stripeWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const signature = req.headers["stripe-signature"];
    if (!signature || typeof signature !== "string") {
      throw AppError.badRequest("Missing Stripe signature");
    }
    // req.rawBody is attached by the rawBodyMiddleware in index.ts
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    if (!rawBody) throw AppError.badRequest("Missing raw body for webhook verification");

    const event = constructWebhookEvent(rawBody, signature);
    await handleWebhookEvent(event);
    res.json({ received: true });
  } catch (err) {
    next(err);
  }
}
