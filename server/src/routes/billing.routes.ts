import { Router, type Request, type Response, type NextFunction } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getPlan, checkout, portal, stripeWebhook } from "../controllers/billing.controller.js";

const router = Router();

// Webhook MUST be before requireAuth — Stripe doesn't send a session cookie
router.post("/billing/webhook", stripeWebhook);

router.use(requireAuth);
router.get("/billing/plan", getPlan);
router.post("/billing/checkout", checkout);
router.post("/billing/portal", portal);

export default router;
