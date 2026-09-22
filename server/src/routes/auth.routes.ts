import { Router } from "express";
import { startConnect, oauthCallback, logout, sessionMe } from "../controllers/auth.controller.js";

const router = Router();

router.post("/auth/x/connect", startConnect);
router.get("/auth/x/connect", startConnect);   // GET for direct-redirect flow
router.get("/auth/x/callback", oauthCallback);
router.post("/auth/logout", logout);
router.get("/session/me", sessionMe);

export default router;
