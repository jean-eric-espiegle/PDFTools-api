/**
 * End-to-end smoke test against a running instance. Codifies the manual
 * curl-based verification pattern used throughout this project's history
 * (register -> confirm via outbox -> create key -> exercise the 4 PDF
 * endpoints -> check auth rejection) into something CI can run on every
 * push/PR against the actual built Docker image, not just unit tests.
 *
 * Deliberately runs with no STRIPE_SECRET_KEY / RESEND_API_KEY configured —
 * both features no-op safely when unset (see src/lib/stripe.ts,
 * src/lib/email.ts), so this never touches real Stripe objects or sends
 * real email just by running in CI.
 *
 * Usage: BASE_URL=http://localhost:8787 DATA_DIR=./ci-data npx tsx scripts/smoke-test.ts
 */
import Database from "better-sqlite3";
import path from "node:path";
import { PDFDocument } from "pdf-lib";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:8787";
const DATA_DIR = process.env.DATA_DIR ?? "./data";

let failures = 0;

// Node's fetch/Response types this as unknown (not `any`), since it can't
// know the shape of arbitrary JSON. Every call site here already knows
// what shape to expect (the {code,status,data} envelope), so this is just
// a typing convenience, not a safety loss.
async function json(res: Response): Promise<any> {
  return res.json();
}

function check(condition: boolean, description: string, context?: unknown) {
  if (condition) {
    console.log(`  ok: ${description}`);
  } else {
    failures++;
    console.error(`  FAIL: ${description}`);
    if (context !== undefined) console.error(`    context: ${JSON.stringify(context)}`);
  }
}

async function waitForHealth(timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/health`);
      if (res.ok) return;
    } catch {
      // not up yet, keep polling
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server did not become healthy within ${timeoutMs}ms`);
}

async function makeTestPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage([100, 100]);
  return Buffer.from(await doc.save());
}

function readOutboxToken(email: string, pattern: RegExp): string {
  const db = new Database(path.join(DATA_DIR, "pdf-toolkit.sqlite"), { readonly: true });
  const row = db
    .prepare(`SELECT body FROM outbox_emails WHERE to_email = ? ORDER BY id DESC LIMIT 1`)
    .get(email) as { body: string } | undefined;
  db.close();
  if (!row) throw new Error(`No outbox email found for ${email}`);
  const match = row.body.match(pattern);
  if (!match) throw new Error(`Couldn't extract token from email body: ${row.body}`);
  return match[1];
}

async function main() {
  console.log(`Smoke testing ${BASE_URL} (DATA_DIR=${DATA_DIR})`);

  console.log("\n1. Health check");
  await waitForHealth(30_000);
  const health = await json(await fetch(`${BASE_URL}/health`));
  check(health.code === 200 && health.data.healthy === true, "GET /health returns healthy envelope");

  console.log("\n2. Self-serve signup flow");
  const email = `smoketest+${Date.now()}@example.com`;
  const registerRes = await fetch(`${BASE_URL}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "correcthorse123" }),
  });
  const registerBody = await json(registerRes);
  check(registerRes.status === 201, "POST /auth/register returns 201");
  check(typeof registerBody.data?.sessionToken === "string", "register response includes a session token");
  const sessionToken = registerBody.data.sessionToken;

  const confirmToken = readOutboxToken(email, /token=([A-Za-z0-9_-]+)/);
  const confirmRes = await fetch(`${BASE_URL}/auth/confirm?token=${confirmToken}`);
  check(confirmRes.status === 200, "GET /auth/confirm with the emailed token succeeds");

  console.log("\n3. Self-serve API key creation");
  const keyRes = await fetch(`${BASE_URL}/auth/api-keys`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "smoke-test-key" }),
  });
  const keyBody = await json(keyRes);
  check(keyRes.status === 201, "POST /auth/api-keys returns 201 once email is confirmed");
  const apiKey = keyBody.data?.apiKey;
  check(typeof apiKey === "string" && apiKey.startsWith("pdftk_"), "response includes a usable API key");

  console.log("\n4. Auth rejection");
  const noKeyRes = await fetch(`${BASE_URL}/v1/usage`);
  check(noKeyRes.status === 401, "GET /v1/usage without x-api-key returns 401");

  console.log("\n5. PDF endpoints");
  const pdfA = await makeTestPdf();
  const pdfB = await makeTestPdf();

  const mergeForm = new FormData();
  mergeForm.append("files", new Blob([pdfA], { type: "application/pdf" }), "a.pdf");
  mergeForm.append("files", new Blob([pdfB], { type: "application/pdf" }), "b.pdf");
  const mergeRes = await fetch(`${BASE_URL}/v1/merge`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: mergeForm,
  });
  const mergeBuf = Buffer.from(await mergeRes.arrayBuffer());
  check(mergeRes.status === 200, "POST /v1/merge returns 200", {
    status: mergeRes.status,
    body: mergeBuf.subarray(0, 200).toString(),
  });
  check(mergeBuf.subarray(0, 4).toString() === "%PDF", "merge response is a valid PDF");

  const compressForm = new FormData();
  compressForm.append("file", new Blob([pdfA], { type: "application/pdf" }), "a.pdf");
  const compressRes = await fetch(`${BASE_URL}/v1/compress`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: compressForm,
  });
  const compressBuf = Buffer.from(await compressRes.arrayBuffer());
  check(compressRes.status === 200, "POST /v1/compress returns 200");
  check(compressBuf.subarray(0, 4).toString() === "%PDF", "compress response is a valid PDF");

  const imageForm = new FormData();
  imageForm.append("file", new Blob([pdfA], { type: "application/pdf" }), "a.pdf");
  imageForm.append("ranges", "1");
  const imageRes = await fetch(`${BASE_URL}/v1/pdf-to-image`, {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: imageForm,
  });
  const imageBuf = Buffer.from(await imageRes.arrayBuffer());
  check(imageRes.status === 200, "POST /v1/pdf-to-image returns 200");
  check(imageBuf[0] === 0x89 && imageBuf[1] === 0x50, "pdf-to-image response is a valid PNG");

  console.log("\n6. Usage reporting");
  const usageRes = await fetch(`${BASE_URL}/v1/usage`, { headers: { "x-api-key": apiKey } });
  const usageBody = await json(usageRes);
  check(usageRes.status === 200 && usageBody.data?.usedThisMonth > 0, "GET /v1/usage reflects the calls just made");

  console.log("\n7. Static site");
  const landingRes = await fetch(`${BASE_URL}/`);
  check(landingRes.status === 200, "GET / (landing page) returns 200");
  const docsRes = await fetch(`${BASE_URL}/docs`);
  check(docsRes.status === 200, "GET /docs returns 200");

  console.log(`\n${failures === 0 ? "All checks passed." : `${failures} check(s) failed.`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exit(1);
});
