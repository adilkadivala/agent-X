import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getDrafts, createDraftHandler, approveDraftHandler, publishDraftHandler } from "../controllers/drafts.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/drafts/:accountId/queue", getDrafts);
router.post("/drafts/:accountId", createDraftHandler);
router.post("/drafts/:id/approve", approveDraftHandler);
router.post("/drafts/:id/publish", publishDraftHandler);

export default router;
