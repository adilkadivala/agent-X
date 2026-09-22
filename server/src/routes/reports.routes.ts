import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { latestReport, reportHistory, refreshReport } from "../controllers/reports.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/reports/:accountId/latest", latestReport);
router.get("/reports/:accountId/history", reportHistory);
router.post("/reports/:accountId/refresh", refreshReport);

export default router;
