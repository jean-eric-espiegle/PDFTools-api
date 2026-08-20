import dotenv from "dotenv";
import path from "node:path";

dotenv.config();

export const PORT = Number(process.env.PORT ?? 8787);
export const DATA_DIR = path.resolve(process.env.DATA_DIR ?? "./data");
export const FREE_TIER_MONTHLY_LIMIT = Number(process.env.FREE_TIER_MONTHLY_LIMIT ?? 100);
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB per file, generous for an MVP

export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? "";
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET ?? "";

// Used to build links embedded in emails (confirmation, password reset).
export const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL ?? `http://localhost:${PORT}`;

export const RESEND_API_KEY = process.env.RESEND_API_KEY ?? "";
// Local-part qualified with the product name (rune-tech.org is a shared
// parent-company domain used by other projects too) so recipients can tell
// at a glance which product is emailing them.
export const EMAIL_FROM = process.env.EMAIL_FROM ?? "PDF Toolkit API <noreply.pdftoolkit@rune-tech.org>";

// Shared secret for GET /admin/stats (see src/middleware/requireAdmin.ts and
// ADMIN_STATS_CONTRACT.md in AdminDash). Empty by default so the endpoint
// fails closed rather than silently accepting an empty header in an
// unconfigured environment.
export const ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "";
