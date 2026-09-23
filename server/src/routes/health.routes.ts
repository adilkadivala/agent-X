import { Router } from "express";
import { prisma } from "../prisma/client.js";
import { oauthMode } from "../config/env.js";

const router = Router();

router.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, oauthMode: oauthMode(), db: "connected" });
  } catch {
    res.status(503).json({ ok: false, db: "unreachable" });
  }
});

export default router;
