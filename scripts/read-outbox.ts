import "../src/db.js";
import { db } from "../src/db.js";

// No real email provider is wired up (see README "Self-serve accounts") —
// this is how to actually read the confirmation link / reset link / 2FA
// code that a real inbox would have received.
const to = process.argv[2];
const limit = Number(process.argv[3] ?? 5);

const rows = to
  ? db
      .prepare(`SELECT * FROM outbox_emails WHERE to_email = ? ORDER BY id DESC LIMIT ?`)
      .all(to, limit)
  : db.prepare(`SELECT * FROM outbox_emails ORDER BY id DESC LIMIT ?`).all(limit);

if (rows.length === 0) {
  console.log(to ? `No emails found for ${to}` : "Outbox is empty");
  process.exit(0);
}

for (const row of rows as { id: number; to_email: string; subject: string; body: string; created_at: string }[]) {
  console.log(`--- #${row.id} to=${row.to_email} at=${row.created_at} ---`);
  console.log(`Subject: ${row.subject}`);
  console.log(row.body);
  console.log();
}
