import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { listSuggestions, accept, dismiss } from "../controllers/suggestions.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/suggestions/:accountId", listSuggestions);
router.post("/suggestions/:id/accept", accept);
router.post("/suggestions/:id/dismiss", dismiss);

export default router;
