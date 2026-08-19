import { Resend } from "resend";
import { db } from "../db.js";
import { EMAIL_FROM, RESEND_API_KEY } from "../config.js";

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

/**
 * Always persists to outbox_emails (audit trail + the `read-outbox` dev
 * tool, plain-text only — that table doesn't need the HTML variant) and
 * logs to stdout, then — if RESEND_API_KEY is set — actually sends via
 * Resend as a multipart html+text email. Without a key it silently stays
 * outbox-only, which is how local dev and any environment without email
 * configured keep working (see README "Self-serve accounts").
 *
 * Fire-and-forget by design, same as Stripe usage reporting in
 * middleware/usage.ts: a provider hiccup shouldn't fail the request that
 * triggered the email (e.g. registration should still succeed even if the
 * confirmation email fails to send) — it just means that email needs a
 * manual resend, not that the whole action failed.
 */
export function sendEmail(params: { to: string; subject: string; text: string; html?: string }) {
  db.prepare(
    `INSERT INTO outbox_emails (to_email, subject, body, created_at) VALUES (?, ?, ?, ?)`
  ).run(params.to, params.subject, params.text, new Date().toISOString());

  console.log(`[email] to=${params.to} subject="${params.subject}"\n${params.text}`);

  if (!resend) return;

  resend.emails
    .send({ from: EMAIL_FROM, to: params.to, subject: params.subject, text: params.text, html: params.html })
    .then((result) => {
      if (result.error) {
        console.error(`Resend send failed for ${params.to}:`, result.error.message);
      }
    })
    .catch((err) => {
      console.error(`Resend send failed for ${params.to}:`, err instanceof Error ? err.message : err);
    });
}
