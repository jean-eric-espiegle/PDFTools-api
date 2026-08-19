import type { NextFunction, Request, Response } from "express";
import { currentMonthUsageCount, findApiKeyByRawKey, type ApiKeyRecord } from "../lib/apiKeys.js";
import { findUserById } from "../lib/users.js";
import { sendError } from "../lib/response.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: ApiKeyRecord;
    }
  }
}

export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.header("x-api-key");

  if (!rawKey) {
    return sendError(res, 401, "Missing x-api-key header");
  }

  const apiKey = findApiKeyByRawKey(rawKey);

  if (!apiKey) {
    return sendError(res, 401, "Invalid or revoked API key");
  }

  // Self-serve keys (user_id set) ride on their account's subscription, so
  // the ACCOUNT's billing_status gates access, not the key's own column
  // (which stays unused for these — see POST /auth/api-keys). Admin/CLI
  // keys with no user_id keep the original per-key check.
  const billingStatus = apiKey.user_id ? findUserById(apiKey.user_id)?.billing_status : apiKey.billing_status;

  // Any non-"active" billing status (past_due, canceled, unpaid) blocks
  // access. Simpler and safer than a grace period for an MVP; revisit if
  // Stripe's dunning retries make this too aggressive in practice.
  if (billingStatus !== "active") {
    return sendError(res, 402, `Subscription is ${billingStatus}, payment required to continue`);
  }

  const used = currentMonthUsageCount(apiKey.id);

  if (used >= apiKey.monthly_limit) {
    return sendError(res, 429, `Monthly quota exceeded (${used}/${apiKey.monthly_limit})`);
  }

  req.apiKey = apiKey;
  next();
}
