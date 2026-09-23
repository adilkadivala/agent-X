import { prisma } from "../prisma/client.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { createSessionToken } from "../lib/session.js";
import { AppError } from "../lib/errors.js";
import type { XProfile } from "../lib/x-oauth.js";

export interface ConnectedUserResult {
  sessionToken: string;
  userId: string;
  handle: string;
  name: string;
  profileImageUrl?: string;
  redirectTo: string;
}

/**
 * After OAuth completes, upsert the User + ConnectedAccount in DB,
 * create a session token, and return everything the controller needs.
 */
export async function connectXAccount(
  profile: XProfile & { token: string; tokenSecret: string },
  dashboardOrigin: string
): Promise<ConnectedUserResult> {
  const accessTokenEnc = encrypt(profile.token);
  const refreshTokenEnc = profile.tokenSecret ? encrypt(profile.tokenSecret) : null;

  // Upsert ConnectedAccount first (to get userId if account already exists)
  const existingAccount = await prisma.connectedAccount.findUnique({
    where: { platform_platformUserId: { platform: "X", platformUserId: profile.platformUserId } },
    select: { userId: true },
  });

  let userId: string;

  if (existingAccount) {
    userId = existingAccount.userId;
    // Update tokens & profile
    await prisma.connectedAccount.update({
      where: { platform_platformUserId: { platform: "X", platformUserId: profile.platformUserId } },
      data: {
        handle: profile.handle,
        accessTokenEnc,
        refreshTokenEnc,
        status: "CONNECTED",
        disconnectedAt: null,
      },
    });
    // Sync name on user
    await prisma.user.update({
      where: { id: userId },
      data: { name: profile.name },
    });
  } else {
    // New user — create User + ConnectedAccount + free Subscription in a transaction
    const freePlan = await prisma.plan.findUnique({ where: { tier: "FREE" } });
    if (!freePlan) throw new AppError("Plan table not seeded. Run bun run db:seed.", 500, "SEED_REQUIRED");

    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const newUser = await prisma.user.create({
      data: {
        email: `${profile.handle}@x.placeholder`, // placeholder until we have email OAuth
        name: profile.name,
        connectedAccounts: {
          create: {
            platform: "X",
            platformUserId: profile.platformUserId,
            handle: profile.handle,
            accessTokenEnc,
            refreshTokenEnc,
            scopes: ["tweet.read", "tweet.write", "users.read"],
            status: "CONNECTED",
          },
        },
        subscriptions: {
          create: {
            planId: freePlan.id,
            status: "ACTIVE",
            currentPeriodStart: now,
            currentPeriodEnd: periodEnd,
          },
        },
      },
    });
    userId = newUser.id;
  }

  const sessionToken = createSessionToken({ userId });

  return {
    sessionToken,
    userId,
    handle: profile.handle,
    name: profile.name,
    profileImageUrl: profile.profileImageUrl,
    redirectTo: `${dashboardOrigin}/overview?connected=${encodeURIComponent(profile.handle)}`,
  };
}

export async function getSessionUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      name: true,
      subscriptions: {
        where: { status: "ACTIVE" },
        include: { plan: { select: { tier: true, name: true, analysisLimitPerMonth: true, connectedAccountLimit: true } } },
        take: 1,
        orderBy: { createdAt: "desc" },
      },
      connectedAccounts: {
        where: { status: "CONNECTED" },
        select: { id: true, platform: true, handle: true, connectedAt: true },
      },
    },
  });

  if (!user) return null;

  const sub = user.subscriptions[0];
  return {
    signedIn: true,
    id: user.id,
    email: user.email,
    name: user.name,
    plan: sub?.plan.tier ?? "FREE",
    planName: sub?.plan.name ?? "Free",
    connectedAccounts: user.connectedAccounts,
  };
}

export async function getDecryptedToken(accountId: string, userId: string) {
  const account = await prisma.connectedAccount.findFirst({
    where: { id: accountId, userId, status: "CONNECTED" },
    select: { accessTokenEnc: true, refreshTokenEnc: true },
  });
  if (!account) throw AppError.notFound("Connected account not found");
  return {
    accessToken: decrypt(account.accessTokenEnc),
    refreshToken: account.refreshTokenEnc ? decrypt(account.refreshTokenEnc) : null,
  };
}
