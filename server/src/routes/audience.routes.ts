import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { audienceBreakdown, activeTimes } from "../controllers/audience.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/audience/:accountId", audienceBreakdown);
router.get("/active-times/:accountId", activeTimes);

export default router;
