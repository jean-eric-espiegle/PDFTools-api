import { Router } from "express";
import { asyncHandler } from "../lib/asyncHandler.js";
import { sendError, sendSuccess } from "../lib/response.js";
import { sendEmail } from "../lib/email.js";
import { renderEmail } from "../lib/emailTemplates.js";
import { sha256Hex } from "../lib/hash.js";
import { hashPassword, isPasswordStrongEnough, verifyPassword } from "../lib/passwords.js";
import { generateNumericCode, generateOpaqueSecret } from "../lib/tokens.js";
import {
  attachUserStripeSubscription,
  consumeAuthToken,
  createAuthToken,
  createSession,
  createUser,
  findAuthTokenById,
  findAuthTokenBySecret,
  findUserByEmail,
  findUserById,
  markEmailVerified,
  revokeAllSessions,
  revokeSessionByToken,
  setPasswordHash,
  setTwofaEnabled,
  setUserPlan,
  toPublicUser,
  updateProfile,
} from "../lib/users.js";
import { attachStripeSubscription, createApiKey, listApiKeysForUser } from "../lib/apiKeys.js";
import { FREE_TIER_MONTHLY_LIMIT, PUBLIC_BASE_URL } from "../config.js";
import { requireSession, requireVerifiedEmail } from "../middleware/requireSession.js";
import { subscribeToPlan, BillingError } from "../lib/billing.js";
import { isPaidPlan, PLANS } from "../billingPlans.js";

export const authRouter = Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
const TWOFA_CODE_TTL_MS = 10 * 60 * 1000;

function isValidEmail(email: unknown): email is string {
  return typeof email === "string" && EMAIL_RE.test(email);
}

// --- Register -> confirm -> fill profile ---

authRouter.post(
  "/register",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email)) {
      return sendError(res, 400, "Provide a valid email address");
    }
    if (!isPasswordStrongEnough(password)) {
      return sendError(res, 400, "Password must be at least 8 characters");
    }
    if (findUserByEmail(email)) {
      return sendError(res, 409, "Email already registered");
    }

    const passwordHash = await hashPassword(password);
    const user = createUser(email, passwordHash);

    const secret = generateOpaqueSecret();
    createAuthToken(user.id, "email_confirm", secret, EMAIL_CONFIRM_TTL_MS);
    sendEmail({
      to: user.email,
      subject: "Confirm your PDF Toolkit API account",
      ...renderEmail({
        preheader: "Confirm your email address to finish setting up your account.",
        heading: "Confirm your email address",
        paragraphs: [
          "Thanks for signing up for the PDF Toolkit API. Confirm your email address to finish setting up your account.",
        ],
        cta: { label: "Confirm email", url: `${PUBLIC_BASE_URL}/auth/confirm?token=${secret}` },
        footerNote: "This link expires in 24 hours. If you didn't create this account, you can ignore this email.",
      }),
    });

    const session = createSession(user.id);

    sendSuccess(res, 201, {
      user: toPublicUser(user),
      sessionToken: session.rawToken,
      message: "Check your email to confirm your address, then fill in your profile.",
    });
  })
);

authRouter.get(
  "/confirm",
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === "string" ? req.query.token : undefined;
    if (!token) {
      return sendError(res, 400, "Missing token");
    }

    const authToken = findAuthTokenBySecret("email_confirm", token);
    if (!authToken) {
      return sendError(res, 400, "Invalid or expired confirmation link");
    }

    consumeAuthToken(authToken.id);
    markEmailVerified(authToken.user_id);

    sendSuccess(res, 200, { confirmed: true });
  })
);

authRouter.post(
  "/profile",
  requireSession,
  asyncHandler(async (req, res) => {
    const { name, company } = req.body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return sendError(res, 400, "name is required");
    }

    updateProfile(req.user!.id, { name: name.trim(), company: typeof company === "string" ? company.trim() : null });

    sendSuccess(res, 200, { user: toPublicUser(findUserById(req.user!.id)!) });
  })
);

authRouter.get("/me", requireSession, (req, res) => {
  sendSuccess(res, 200, { user: toPublicUser(req.user!) });
});

authRouter.post("/logout", requireSession, (req, res) => {
  // Server-side revoke, not just "the client deletes its copy" — a session
  // that's merely forgotten client-side stays valid on the server until it
  // naturally expires (up to the 1-hour idle window).
  revokeSessionByToken(req.sessionToken!);
  sendSuccess(res, 200, { loggedOut: true });
});

// --- Login (+ optional email 2FA) ---

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!isValidEmail(email) || typeof password !== "string") {
      return sendError(res, 400, "Provide email and password");
    }

    const user = findUserByEmail(email);
    const valid = user ? await verifyPassword(password, user.password_hash) : false;

    if (!user || !valid) {
      // Deliberately identical response whether the email doesn't exist or
      // the password is wrong — don't help an attacker enumerate accounts.
      return sendError(res, 401, "Invalid email or password");
    }

    if (user.twofa_enabled) {
      const code = generateNumericCode();
      const pendingId = createAuthToken(user.id, "twofa_code", code, TWOFA_CODE_TTL_MS);
      sendEmail({
        to: user.email,
        subject: "Your PDF Toolkit API login code",
        ...renderEmail({
          preheader: `Your login code is ${code}.`,
          heading: "Your login code",
          paragraphs: ["Enter this code to finish signing in."],
          code,
          footerNote: "This code expires in 10 minutes. If you didn't try to log in, you can ignore this email.",
        }),
      });
      return sendSuccess(res, 200, { twoFactorRequired: true, pendingId });
    }

    const session = createSession(user.id);
    sendSuccess(res, 200, { sessionToken: session.rawToken, user: toPublicUser(user) });
  })
);

authRouter.post(
  "/login/2fa",
  asyncHandler(async (req, res) => {
    const { pendingId, code } = req.body ?? {};

    if (typeof pendingId !== "string" || typeof code !== "string") {
      return sendError(res, 400, "Provide pendingId and code");
    }

    const authToken = findAuthTokenById(pendingId, "twofa_code");
    if (!authToken || authToken.secret_hash !== sha256Hex(code)) {
      return sendError(res, 401, "Invalid or expired code");
    }

    consumeAuthToken(authToken.id);
    const user = findUserById(authToken.user_id)!;
    const session = createSession(user.id);

    sendSuccess(res, 200, { sessionToken: session.rawToken, user: toPublicUser(user) });
  })
);

// --- Password reset ---

authRouter.post(
  "/forgot-password",
  asyncHandler(async (req, res) => {
    const { email } = req.body ?? {};
    if (!isValidEmail(email)) {
      return sendError(res, 400, "Provide a valid email address");
    }

    const user = findUserByEmail(email);
    if (user) {
      const secret = generateOpaqueSecret();
      createAuthToken(user.id, "password_reset", secret, PASSWORD_RESET_TTL_MS);
      sendEmail({
        to: user.email,
        subject: "Reset your PDF Toolkit API password",
        ...renderEmail({
          preheader: "Reset your password.",
          heading: "Reset your password",
          paragraphs: ["We received a request to reset your password. Click below to choose a new one."],
          cta: { label: "Reset password", url: `${PUBLIC_BASE_URL}/auth/reset-password?token=${secret}` },
          footerNote: "This link expires in 1 hour. If you didn't request this, you can ignore this email — your password won't change.",
        }),
      });
    }

    // Same response whether or not the email exists — this endpoint is a
    // classic account-enumeration vector.
    sendSuccess(res, 200, { message: "If that email is registered, a reset link has been sent." });
  })
);

authRouter.post(
  "/reset-password",
  asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body ?? {};

    if (typeof token !== "string") {
      return sendError(res, 400, "Missing token");
    }
    if (!isPasswordStrongEnough(newPassword)) {
      return sendError(res, 400, "Password must be at least 8 characters");
    }

    const authToken = findAuthTokenBySecret("password_reset", token);
    if (!authToken) {
      return sendError(res, 400, "Invalid or expired reset link");
    }

    consumeAuthToken(authToken.id);
    setPasswordHash(authToken.user_id, await hashPassword(newPassword));
    // Changing the password invalidates every existing session, including
    // any an attacker may have obtained.
    revokeAllSessions(authToken.user_id);

    sendSuccess(res, 200, { reset: true });
  })
);

// --- 2FA toggle ---

authRouter.post(
  "/2fa/enable",
  requireSession,
  asyncHandler(async (_req, res) => {
    setTwofaEnabled(_req.user!.id, true);
    sendSuccess(res, 200, { twofaEnabled: true });
  })
);

authRouter.post(
  "/2fa/disable",
  requireSession,
  asyncHandler(async (req, res) => {
    setTwofaEnabled(req.user!.id, false);
    sendSuccess(res, 200, { twofaEnabled: false });
  })
);

// --- Self-serve API keys ---

authRouter.post(
  "/api-keys",
  requireSession,
  requireVerifiedEmail,
  asyncHandler(async (req, res) => {
    const { name } = req.body ?? {};
    const user = req.user!;

    const plan = PLANS[user.plan as keyof typeof PLANS] ?? PLANS.free;
    const limit = isPaidPlan(user.plan) ? plan.safetyCapOps : FREE_TIER_MONTHLY_LIMIT;

    const key = createApiKey(typeof name === "string" && name.trim() ? name.trim() : "default", user.plan, limit, user.id);

    if (isPaidPlan(user.plan) && user.stripe_subscription_id && user.stripe_subscription_item_id) {
      // This key rides on the account's existing subscription rather than
      // creating a new one — billing status is checked at the user level
      // for keys with a user_id (see requireApiKey in middleware/auth.ts).
      attachStripeSubscription(key.id, {
        customerId: user.stripe_customer_id!,
        subscriptionId: user.stripe_subscription_id,
        subscriptionItemId: user.stripe_subscription_item_id,
      });
    }

    sendSuccess(res, 201, {
      id: key.id,
      name: key.name,
      plan: key.plan,
      monthlyLimit: key.monthlyLimit,
      apiKey: key.rawKey,
      message: "Store this key now — only its hash is kept in the database.",
    });
  })
);

authRouter.get("/api-keys", requireSession, (req, res) => {
  const keys = listApiKeysForUser(req.user!.id).map((k) => ({
    id: k.id,
    name: k.name,
    plan: k.plan,
    monthlyLimit: k.monthly_limit,
    createdAt: k.created_at,
  }));
  sendSuccess(res, 200, { keys });
});

// --- Self-serve plan subscription ---

authRouter.post(
  "/subscribe",
  requireSession,
  requireVerifiedEmail,
  asyncHandler(async (req, res) => {
    const { plan } = req.body ?? {};
    const user = req.user!;

    if (typeof plan !== "string" || !isPaidPlan(plan)) {
      return sendError(res, 400, `plan must be one of: starter, pro, scale`);
    }

    let subscription;
    try {
      subscription = await subscribeToPlan({ email: user.email, name: user.name ?? user.email, planId: plan });
    } catch (err) {
      if (err instanceof BillingError) {
        return sendError(res, err.status, err.message);
      }
      throw err;
    }

    setUserPlan(user.id, plan);
    attachUserStripeSubscription(user.id, {
      customerId: subscription.customerId,
      subscriptionId: subscription.subscriptionId,
      subscriptionItemId: subscription.subscriptionItemId,
    });

    sendSuccess(res, 200, {
      plan,
      stripeSubscriptionId: subscription.subscriptionId,
      status: subscription.status,
    });
  })
);
