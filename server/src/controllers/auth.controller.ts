import type { Request, Response, NextFunction } from "express";
import { assertAuthConfig, env, oauthMode } from "../config/env.js";
import { startOauth1, startOauth2, finishOauth1, finishOauth2, fetchXUser } from "../lib/x-oauth.js";
import { connectXAccount, getSessionUser } from "../services/auth.service.js";
import { readSessionToken, tokenFromCookieHeader, sessionCookie, clearSessionCookie } from "../lib/session.js";
import { AppError } from "../lib/errors.js";

export async function startConnect(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    assertAuthConfig();
    if (oauthMode() === "oauth2") {
      const { authorizeUrl } = startOauth2(env.callbackUrl);
      res.json({ next: "x", authorizeUrl });
      return;
    }
    try {
      const { authorizeUrl } = await startOauth1(env.callbackUrl);
      res.json({ next: "x", authorizeUrl });
    } catch (err) {
      // Fallback: if callback URL is oob (dev/desktop mode), use static token from env
      const message = err instanceof Error ? err.message : "";
      const isOob = message.includes("oauth_callback value 'oob'") || message.includes('code="417"');
      if (!isOob || !env.accessToken || !env.accessTokenSecret) throw err;
      const profile = await fetchXUser(env.accessToken, env.accessTokenSecret);
      const result = await connectXAccount(
        { ...profile, token: env.accessToken, tokenSecret: env.accessTokenSecret },
        env.dashboardOrigin
      );
      res
        .setHeader("Set-Cookie", sessionCookie(result.sessionToken))
        .json({ next: "overview", redirectTo: "/overview" });
    }
  } catch (err) {
    next(err);
  }
}

export async function oauthCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, state, oauth_token, oauth_verifier, denied, error } = req.query as Record<string, string>;

    if (denied || error) {
      res.redirect(`${env.dashboardOrigin}/onboarding?error=denied`);
      return;
    }

    let profile: Awaited<ReturnType<typeof fetchXUser>> & { token: string; tokenSecret: string };

    if (code && state) {
      profile = await finishOauth2(code, state, env.callbackUrl);
    } else if (oauth_token && oauth_verifier) {
      profile = await finishOauth1(oauth_token, oauth_verifier);
    } else {
      throw AppError.badRequest("Missing OAuth callback parameters");
    }

    const result = await connectXAccount(profile, env.dashboardOrigin);
    res
      .setHeader("Set-Cookie", sessionCookie(result.sessionToken))
      .redirect(result.redirectTo);
  } catch (err) {
    const message = err instanceof Error ? err.message : "OAuth failed";
    res.redirect(`${env.dashboardOrigin}/onboarding?error=${encodeURIComponent(message)}`);
    next(err);
  }
}

export async function logout(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.setHeader("Set-Cookie", clearSessionCookie()).json({ ok: true });
  } catch (err) {
    next(err);
  }
}

export async function sessionMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = tokenFromCookieHeader(req.headers.cookie);
    const payload = readSessionToken(token);
    if (!payload) {
      res.json({ signedIn: false });
      return;
    }
    const user = await getSessionUser(payload.userId);
    if (!user) {
      res.setHeader("Set-Cookie", clearSessionCookie()).json({ signedIn: false });
      return;
    }
    res.json(user);
  } catch (err) {
    next(err);
  }
}
