import crypto from "node:crypto";

const KEY_LENGTH = 64;

/** Format: scrypt:<saltHex>:<hashHex> */
export function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString("hex")}`);
    });
  });
}

export function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hashHex) return Promise.resolve(false);

  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      const stored = Buffer.from(hashHex, "hex");
      // Guard against timingSafeEqual throwing on mismatched lengths, which
      // would otherwise leak length information via a thrown exception.
      if (stored.length !== derivedKey.length) return resolve(false);
      resolve(crypto.timingSafeEqual(stored, derivedKey));
    });
  });
}

const MIN_PASSWORD_LENGTH = 8;

export function isPasswordStrongEnough(password: string): boolean {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
}
