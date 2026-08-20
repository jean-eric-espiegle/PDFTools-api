import type { NextFunction, Request, Response } from "express";
import { ADMIN_API_KEY } from "../config.js";
import { sendError } from "../lib/response.js";

/**
 * Separate from both requireApiKey (per-customer x-api-key) and
 * requireSession (per-customer login) — this gates operator-only endpoints
 * like GET /admin/stats. A single shared secret, not a user/role system:
 * there's exactly one operator today, and building real admin-user
 * management for that would be solving a problem that doesn't exist yet.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!ADMIN_API_KEY) {
    return sendError(res, 503, "Admin API is not configured");
  }

  const key = req.header("x-admin-key");
  if (!key || key !== ADMIN_API_KEY) {
    return sendError(res, 401, "Invalid or missing x-admin-key header");
  }

  next();
}
