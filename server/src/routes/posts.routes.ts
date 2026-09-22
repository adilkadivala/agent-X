import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { analyzePostHandler, getPostHistoryHandler } from "../controllers/posts.controller.js";

const router = Router();

router.use(requireAuth);
router.post("/posts/analyze", analyzePostHandler);
router.get("/posts/:accountId/history", getPostHistoryHandler);

export default router;
