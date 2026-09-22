import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { complianceData, dismissFlagHandler } from "../controllers/compliance.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/compliance/:accountId", complianceData);
router.post("/compliance/flags/:flagId/dismiss", dismissFlagHandler);

export default router;
