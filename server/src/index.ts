import express, { type Request, type Response, type NextFunction } from "express";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRoutes from "./routes/auth.routes.js";
import accountsRoutes from "./routes/accounts.routes.js";
import postsRoutes from "./routes/posts.routes.js";
import reportsRoutes from "./routes/reports.routes.js";
import audienceRoutes from "./routes/audience.routes.js";
import complianceRoutes from "./routes/compliance.routes.js";
import suggestionsRoutes from "./routes/suggestions.routes.js";
import draftsRoutes from "./routes/drafts.routes.js";
import billingRoutes from "./routes/billing.routes.js";
import healthRoutes from "./routes/health.routes.js";
import { env } from "./config/env.js";

const app = express();

// ── CORS — must be before all routes ──────────────────────────────────────────
app.use(corsMiddleware);
app.options("*", corsMiddleware);

// ── Raw body for Stripe webhook signature verification ────────────────────────
app.use(
  (req: Request & { rawBody?: Buffer }, res: Response, next: NextFunction) => {
    if (req.path === "/billing/webhook") {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        req.rawBody = Buffer.concat(chunks);
        next();
      });
    } else {
      next();
    }
  }
);

// ── Standard body parsers ─────────────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use(healthRoutes);
app.use(authRoutes);
app.use(accountsRoutes);
app.use(postsRoutes);
app.use(reportsRoutes);
app.use(audienceRoutes);
app.use(complianceRoutes);
app.use(suggestionsRoutes);
app.use(draftsRoutes);
app.use(billingRoutes);

// ── 404 catch-all ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found", code: "NOT_FOUND" });
});

// ── Central error handler (must be last) ─────────────────────────────────────
app.use(errorHandler);

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(env.port, () => {
  console.log(`[gateway] listening on http://127.0.0.1:${env.port}`);
  console.log(`[gateway] dashboard origin: ${env.dashboardOrigin}`);
});

export default app;
