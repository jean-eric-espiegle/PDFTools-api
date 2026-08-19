import { nanoid } from "nanoid";
import { db } from "../db.js";
import { sha256Hex } from "./hash.js";
import { generateOpaqueSecret } from "./tokens.js";

export interface UserRecord {
  id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  name: string | null;
  company: string | null;
  profile_completed_at: string | null;
  twofa_enabled: number;
  plan: string;
  billing_status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  stripe_subscription_item_id: string | null;
  created_at: string;
}

export function createUser(email: string, passwordHash: string): UserRecord {
  const id = nanoid(12);
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)`
  ).run(id, email.toLowerCase(), passwordHash, createdAt);

  return findUserById(id)!;
}

export function findUserByEmail(email: string): UserRecord | undefined {
  return db.prepare(`SELECT * FROM users WHERE email = ?`).get(email.toLowerCase()) as UserRecord | undefined;
}

export function findUserById(id: string): UserRecord | undefined {
  return db.prepare(`SELECT * FROM users WHERE id = ?`).get(id) as UserRecord | undefined;
}

/** Strips password_hash before a user record ever reaches an API response. */
export function toPublicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.email_verified_at !== null,
    name: user.name,
    company: user.company,
    profileCompleted: user.profile_completed_at !== null,
    twofaEnabled: user.twofa_enabled === 1,
    plan: user.plan,
    billingStatus: user.billing_status,
    createdAt: user.created_at,
  };
}

export function findUserByStripeSubscriptionId(subscriptionId: string): UserRecord | undefined {
  return db
    .prepare(`SELECT * FROM users WHERE stripe_subscription_id = ?`)
    .get(subscriptionId) as UserRecord | undefined;
}

export function markEmailVerified(userId: string) {
  db.prepare(`UPDATE users SET email_verified_at = ? WHERE id = ?`).run(new Date().toISOString(), userId);
}

export function updateProfile(userId: string, params: { name: string; company?: string | null }) {
  db.prepare(
    `UPDATE users SET name = ?, company = ?, profile_completed_at = COALESCE(profile_completed_at, ?) WHERE id = ?`
  ).run(params.name, params.company ?? null, new Date().toISOString(), userId);
}

export function setPasswordHash(userId: string, passwordHash: string) {
  db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).run(passwordHash, userId);
}

export function setTwofaEnabled(userId: string, enabled: boolean) {
  db.prepare(`UPDATE users SET twofa_enabled = ? WHERE id = ?`).run(enabled ? 1 : 0, userId);
}

export function setUserPlan(userId: string, plan: string) {
  db.prepare(`UPDATE users SET plan = ? WHERE id = ?`).run(plan, userId);
}

export function setUserBillingStatus(userId: string, status: string) {
  db.prepare(`UPDATE users SET billing_status = ? WHERE id = ?`).run(status, userId);
}

export function attachUserStripeSubscription(
  userId: string,
  params: { customerId: string; subscriptionId: string; subscriptionItemId: string }
) {
  db.prepare(
    `UPDATE users
     SET stripe_customer_id = ?, stripe_subscription_id = ?, stripe_subscription_item_id = ?, billing_status = 'active'
     WHERE id = ?`
  ).run(params.customerId, params.subscriptionId, params.subscriptionItemId, userId);
}

// --- Sessions ---

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export interface SessionRecord {
  id: string;
  user_id: string;
  token_hash: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
}

export function createSession(userId: string): { rawToken: string; expiresAt: string } {
  const rawToken = `pdftk_sess_${generateOpaqueSecret()}`;
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  db.prepare(
    `INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)`
  ).run(nanoid(12), userId, sha256Hex(rawToken), new Date().toISOString(), expiresAt);

  return { rawToken, expiresAt };
}

export function findUserBySessionToken(rawToken: string): UserRecord | undefined {
  const tokenHash = sha256Hex(rawToken);
  return db
    .prepare(
      `SELECT users.* FROM sessions
       JOIN users ON users.id = sessions.user_id
       WHERE sessions.token_hash = ? AND sessions.revoked_at IS NULL AND sessions.expires_at > ?`
    )
    .get(tokenHash, new Date().toISOString()) as UserRecord | undefined;
}

/** Revokes every active session for a user — used on password change/reset. */
export function revokeAllSessions(userId: string) {
  db.prepare(`UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`).run(
    new Date().toISOString(),
    userId
  );
}

// --- Auth tokens (email confirmation, password reset, 2FA codes) ---

export type AuthTokenKind = "email_confirm" | "password_reset" | "twofa_code";

export interface AuthTokenRecord {
  id: string;
  user_id: string;
  kind: AuthTokenKind;
  secret_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

/** `secret` is the raw value to email to the user — a link token or a short numeric code, caller's choice. */
export function createAuthToken(userId: string, kind: AuthTokenKind, secret: string, ttlMs: number): string {
  const id = nanoid(12);
  db.prepare(
    `INSERT INTO auth_tokens (id, user_id, kind, secret_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(id, userId, kind, sha256Hex(secret), new Date(Date.now() + ttlMs).toISOString(), new Date().toISOString());
  return id;
}

/** For links where the client only has the raw secret (email confirm, password reset). */
export function findAuthTokenBySecret(kind: AuthTokenKind, rawSecret: string): AuthTokenRecord | undefined {
  return db
    .prepare(
      `SELECT * FROM auth_tokens
       WHERE kind = ? AND secret_hash = ? AND consumed_at IS NULL AND expires_at > ?`
    )
    .get(kind, sha256Hex(rawSecret), new Date().toISOString()) as AuthTokenRecord | undefined;
}

/** For flows where the client references a specific pending attempt by id (2FA: pendingId + code). */
export function findAuthTokenById(id: string, kind: AuthTokenKind): AuthTokenRecord | undefined {
  return db
    .prepare(`SELECT * FROM auth_tokens WHERE id = ? AND kind = ? AND consumed_at IS NULL AND expires_at > ?`)
    .get(id, kind, new Date().toISOString()) as AuthTokenRecord | undefined;
}

export function consumeAuthToken(id: string) {
  db.prepare(`UPDATE auth_tokens SET consumed_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
}
