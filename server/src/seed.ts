/**
 * Seeds the Plan table with all 4 pricing tiers.
 * Run with: bun run db:seed
 * 
 * Stripe price IDs are left blank — fill them in after creating products in Stripe dashboard.
 */
import { prisma } from "./prisma/client.js";

const plans = [
  {
    tier: "FREE" as const,
    name: "Free",
    monthlyPriceCents: 0,
    annualPriceCents: 0,
    analysisLimitPerMonth: 4,
    connectedAccountLimit: 1,
    seatLimit: 1,
    stripePriceIdMonthly: null,
    stripePriceIdAnnual: null,
  },
  {
    tier: "CREATOR" as const,
    name: "Creator",
    monthlyPriceCents: 1900,   // $19/mo
    annualPriceCents: 19000,   // $190/yr
    analysisLimitPerMonth: 60,
    connectedAccountLimit: 1,
    seatLimit: 1,
    stripePriceIdMonthly: process.env["STRIPE_PRICE_CREATOR_MONTHLY"] ?? null,
    stripePriceIdAnnual: process.env["STRIPE_PRICE_CREATOR_ANNUAL"] ?? null,
  },
  {
    tier: "PRO" as const,
    name: "Pro",
    monthlyPriceCents: 5900,   // $59/mo
    annualPriceCents: 50000,   // $500/yr
    analysisLimitPerMonth: null, // unlimited
    connectedAccountLimit: 3,
    seatLimit: 1,
    stripePriceIdMonthly: process.env["STRIPE_PRICE_PRO_MONTHLY"] ?? null,
    stripePriceIdAnnual: process.env["STRIPE_PRICE_PRO_ANNUAL"] ?? null,
  },
  {
    tier: "AGENCY" as const,
    name: "Agency",
    monthlyPriceCents: 19900,  // $199/mo
    annualPriceCents: 190000,  // $1900/yr
    analysisLimitPerMonth: null, // unlimited
    connectedAccountLimit: 25,
    seatLimit: 5,
    stripePriceIdMonthly: process.env["STRIPE_PRICE_AGENCY_MONTHLY"] ?? null,
    stripePriceIdAnnual: process.env["STRIPE_PRICE_AGENCY_ANNUAL"] ?? null,
  },
];

console.log("[seed] Seeding Plan table...");
for (const plan of plans) {
  await prisma.plan.upsert({
    where: { tier: plan.tier },
    create: plan,
    update: {
      name: plan.name,
      monthlyPriceCents: plan.monthlyPriceCents,
      annualPriceCents: plan.annualPriceCents,
      analysisLimitPerMonth: plan.analysisLimitPerMonth,
      connectedAccountLimit: plan.connectedAccountLimit,
      seatLimit: plan.seatLimit,
      ...(plan.stripePriceIdMonthly && { stripePriceIdMonthly: plan.stripePriceIdMonthly }),
      ...(plan.stripePriceIdAnnual && { stripePriceIdAnnual: plan.stripePriceIdAnnual }),
    },
  });
  console.log(`  ✓ ${plan.tier} — ${plan.name}`);
}

console.log("[seed] Done.");
await prisma.$disconnect();
