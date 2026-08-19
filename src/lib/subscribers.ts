import { nanoid } from "nanoid";
import { db } from "../db.js";

/** Returns true if this is a new subscriber, false if the email was already on the list. */
export function addSubscriber(email: string, source: string | null): boolean {
  const result = db
    .prepare(`INSERT OR IGNORE INTO subscribers (id, email, source, created_at) VALUES (?, ?, ?, ?)`)
    .run(nanoid(12), email.toLowerCase(), source, new Date().toISOString());
  return result.changes > 0;
}
