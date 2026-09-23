import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getAccounts, deleteAccount } from "../controllers/accounts.controller.js";

const router = Router();

router.use(requireAuth);
router.get("/accounts", getAccounts);
router.delete("/accounts/:id", deleteAccount);

export default router;
