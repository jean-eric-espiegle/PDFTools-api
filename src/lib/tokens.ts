import crypto from "node:crypto";

/** Long random opaque secret for links: email confirmation, password reset, sessions. */
export function generateOpaqueSecret(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Short numeric code for email-delivered 2FA, easy to type back in. */
export function generateNumericCode(digits = 6): string {
  const max = 10 ** digits;
  return crypto.randomInt(0, max).toString().padStart(digits, "0");
}
