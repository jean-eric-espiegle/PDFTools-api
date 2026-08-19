import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { addSubscriber } from "../lib/subscribers.js";
import { isValidEmail } from "../lib/validation.js";

export const subscribersRouter = Router();

// Landing-page "not ready yet" email capture — see the note on the
// subscribers table in src/db.ts for scope (storage only, no sending).
subscribersRouter.post(
  "/subscribers",
  asyncHandler(async (req, res) => {
    const { email, source } = req.body ?? {};

    if (!isValidEmail(email)) {
      return sendError(res, 400, "Provide a valid email address");
    }

    addSubscriber(email, typeof source === "string" ? source.slice(0, 100) : null);

    // Same response whether the email was already on the list or not —
    // no reason to leak that distinction, and it keeps the client simple.
    sendSuccess(res, 200, { subscribed: true });
  })
);
