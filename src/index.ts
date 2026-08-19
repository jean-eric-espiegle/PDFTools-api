import cors from "cors";
import express, { type ErrorRequestHandler } from "express";
import rateLimit from "express-rate-limit";
import path from "node:path";
import "./db.js";
import { PORT } from "./config.js";
import { requireApiKey } from "./middleware/auth.js";
import { trackUsage } from "./middleware/usage.js";
import { PdfToolkitError } from "./lib/pdf.js";
import { mergeRouter } from "./routes/merge.js";
import { splitRouter } from "./routes/split.js";
import { compressRouter } from "./routes/compress.js";
import { pdfToImageRouter } from "./routes/pdfToImage.js";
import { usageRouter } from "./routes/usage.js";
import { stripeWebhookRouter } from "./routes/stripeWebhook.js";
import { authRouter } from "./routes/auth.js";
import { sendError, sendSuccess } from "./lib/response.js";

const app = express();
// Fly's edge proxy sits exactly one hop in front of this app and sets
// X-Forwarded-For itself, so trusting 1 hop back is accurate here (not
// spoofable by clients, unlike trusting the whole chain via `true`).
// Needed for express-rate-limit and req.ip to see the real client IP
// instead of Fly's internal proxy address.
app.set("trust proxy", 1);
app.use(cors());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => sendSuccess(res, 200, { healthy: true }));

// Landing page (index.html) and docs (docs.html) served directly from the
// real domain — `extensions: ["html"]` makes /docs resolve to docs.html
// without a redirect. Falls through (no match, calls next()) for every
// other path, so it can't shadow the API routes below.
app.use(express.static(path.join(process.cwd(), "site"), { extensions: ["html"] }));

// Outside /v1 deliberately: Stripe calls this without our x-api-key header,
// authenticating instead via its own signature over the raw request body.
app.use(stripeWebhookRouter);

// Coarse per-IP rate limit as a backstop against abuse, independent of the
// per-API-key monthly quota enforced in requireApiKey.
const limiter = rateLimit({ windowMs: 60_000, limit: 60 });

// Tighter than the general limiter: /auth holds password checks, email
// enumeration surfaces (forgot-password), and 2FA code guessing, all
// classic brute-force targets.
const authLimiter = rateLimit({ windowMs: 60_000, limit: 20 });
app.use("/auth", authLimiter, express.json(), authRouter);

const v1 = express.Router();
v1.use(limiter, requireApiKey);
v1.use(trackUsage("merge"), mergeRouter);
v1.use(trackUsage("split"), splitRouter);
v1.use(trackUsage("compress"), compressRouter);
v1.use(trackUsage("pdf-to-image"), pdfToImageRouter);
v1.use(usageRouter);

app.use("/v1", v1);

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof PdfToolkitError) {
    return sendError(res, err.status, err.message);
  }

  if (err instanceof Error && err.message.includes("application/pdf")) {
    return sendError(res, 400, err.message);
  }

  console.error(err);
  sendError(res, 500, "Internal server error");
};

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`pdf-toolkit-api listening on http://localhost:${PORT}`);
});
