import type { NextFunction, Request, Response } from "express";
import { findUserBySessionToken, type UserRecord } from "../lib/users.js";
import { sendError } from "../lib/response.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}

export function requireSession(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : undefined;

  if (!token) {
    return sendError(res, 401, "Missing Authorization: Bearer <session token> header");
  }

  const user = findUserBySessionToken(token);
  if (!user) {
    return sendError(res, 401, "Invalid or expired session");
  }

  req.user = user;
  next();
}

/** Gate for actions that require a confirmed email (creating keys, subscribing). */
export function requireVerifiedEmail(req: Request, res: Response, next: NextFunction) {
  if (!req.user!.email_verified_at) {
    return sendError(res, 403, "Confirm your email address first");
  }
  next();
}
