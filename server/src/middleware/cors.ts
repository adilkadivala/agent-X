import cors from "cors";
import { env } from "../config/env.js";

export const corsMiddleware = cors({
  origin: env.dashboardOrigin,
  credentials: true,
  methods: ["GET", "POST", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
});
