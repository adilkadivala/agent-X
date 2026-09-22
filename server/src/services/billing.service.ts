import Stripe from "stripe";
import { prisma } from "../prisma/client.js";
import { AppError } from "../lib/errors.js";
import { env } from "../config/env.js";

// Lazy singleton — only instantiated if STRIPE_SECRET_KEY is set
let _stripe: Stripe | null = null;

function stripe(): Stripe {
  if (!_stripe) {
    if (!env.stripeSecretKey) throw new AppError("Stripe not configured. Set STRIPE_SECRET_KEY in .env.", 503, "STRIPE_NOT_CONFIGURED");
    _stripe = new Stripe(env.stripeSecretKey, { apiVersion: "2025-02-24.acacia" });
  }
  return _stripe;
}

// Plan tier → Stripe price IDs (populated after seeding with real price IDs)
async function getPriceId(tier: string, interval: "month" | "year"): Promise<string> {
  const plan = await prisma.plan.findUnique({
    where: { tier: tier as "FREE" | "CREATOR" | "PRO" | "AGENCY" },
    select: { stripePriceIdMonthly: true, stripePriceIdAnnual: true },
  });
  const priceId = interval === "year" ? plan?.stripePriceIdAnnual : plan?.stripePriceIdMonthly;
  if (!priceId) throw AppError.badRequest(`No Stripe price configured for plan ${tier} (${interval})`);
  return priceId;
}

export async function getCurrentPlan(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      subscriptions: {
        where: { status: { in: ["ACTIVE", "TRIALING", "PAST_DUE"] } },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      usageCounters: {
        orderBy: { period: "desc" },
        take: 1,
      },
    },
  });

  if (!user) throw AppError.notFound("User not found");

  const sub = user.subscriptions[0];
  const usage = user.usageCounters[0];

  return {
    plan: sub?.plan ?? null,
    subscription: sub
      ? {
          status: sub.status,
          currentPeriodStart: sub.currentPeriodStart,
          currentPeriodEnd: sub.currentPeriodEnd,
          cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
        }
      : null,
    usage: usage
      ? { analysesUsed: usage.analysesUsed, period: usage.period, resetAt: usage.resetAt }
      : null,
  };
}

export async function createCheckoutSession(
  userId: string,
  tier: string,
  interval: "month" | "year",
  successUrl: string,
  cancelUrl: string
) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw AppError.notFound("User not found");

  const priceId = await getPriceId(tier, interval);

  // Ensure Stripe customer exists
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe().customers.create({ email: user.email, metadata: { userId } });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  const session = await stripe().checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { userId, tier },
  });

  return { url: session.url };
}

export async function createPortalSession(userId: string, returnUrl: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripeCustomerId: true } });
  if (!user?.stripeCustomerId) throw AppError.badRequest("No Stripe customer found. Subscribe first.");

  const session = await stripe().billingPortal.sessions.create({
    customer: user.stripeCustomerId,
    return_url: returnUrl,
  });
  return { url: session.url };
}

// ── Webhook handlers ──────────────────────────────────────────────────────────

export function constructWebhookEvent(payload: Buffer, signature: string): Stripe.Event {
  if (!env.stripeWebhookSecret) throw new AppError("STRIPE_WEBHOOK_SECRET not set", 503, "STRIPE_NOT_CONFIGURED");
  return stripe().webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
}

export async function handleWebhookEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") break;
      const { userId, tier } = session.metadata ?? {};
      if (!userId || !tier) break;
      await activateSubscription(userId, tier, session.subscription as string);
      break;
    }
    case "customer.subscription.updated": {
      const sub = event.data.object as Stripe.Subscription;
      await syncSubscription(sub);
      break;
    }
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.subscription.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { status: "CANCELED", cancelAtPeriodEnd: true },
      });
      break;
    }
    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const stripeSubId = typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription?.id;
      if (stripeSubId) {
        await prisma.subscription.updateMany({
          where: { stripeSubscriptionId: stripeSubId },
          data: { status: "PAST_DUE" },
        });
      }
      break;
    }
    default:
      // Ignore other events
      break;
  }
}

async function activateSubscription(userId: string, tier: string, stripeSubscriptionId: string): Promise<void> {
  const plan = await prisma.plan.findUnique({ where: { tier: tier as "CREATOR" | "PRO" | "AGENCY" } });
  if (!plan) throw new AppError(`Unknown plan tier: ${tier}`, 400, "UNKNOWN_TIER");

  const stripeSub = await stripe().subscriptions.retrieve(stripeSubscriptionId);
  const now = new Date();
  const periodStart = new Date(stripeSub.current_period_start * 1000);
  const periodEnd = new Date(stripeSub.current_period_end * 1000);

  await prisma.$transaction([
    // Cancel any active subscriptions
    prisma.subscription.updateMany({
      where: { userId, status: { in: ["ACTIVE", "TRIALING"] } },
      data: { status: "CANCELED", cancelAtPeriodEnd: false },
    }),
    // Create new subscription
    prisma.subscription.create({
      data: {
        userId,
        planId: plan.id,
        stripeSubscriptionId,
        status: "ACTIVE",
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
      },
    }),
  ]);
}

async function syncSubscription(stripeSub: Stripe.Subscription): Promise<void> {
  const status = stripeSub.status === "active" ? "ACTIVE"
    : stripeSub.status === "trialing" ? "TRIALING"
    : stripeSub.status === "past_due" ? "PAST_DUE"
    : "CANCELED";

  await prisma.subscription.updateMany({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      status,
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd: new Date(stripeSub.current_period_end * 1000),
      cancelAtPeriodEnd: stripeSub.cancel_at_period_end,
    },
  });
}
