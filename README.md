# PDF Toolkit API (MVP)

A small REST API for common PDF operations: merge, split, compress, and PDF-to-image. Built as the first microservice from [`Brainstorm_2026-08-18.md`](../Brainstorm/Brainstorm_2026-08-18.md) — see that doc for the product/business rationale, competitors, and pricing plan.

## Scope of this MVP

- 4 endpoints only: `merge`, `split`, `compress`, `pdf-to-image`. No OCR, no e-signing (planned as v2 if there's demand).
- Files go in and come back out directly in the HTTP response (no signed URLs / async job queue) — simplest thing that works for files this size.
- API keys + usage metering stored in SQLite (`data/pdf-toolkit.sqlite`), not Postgres — trivial to swap later, but there's no reason to run a hosted database for local dev or a first deploy.
- Compression is real but modest: PDFs are re-saved with object streams enabled (dedupes shared objects, compresses xref data). Deep image-recompression is a deliberately deferred v1.1 feature, not required to ship.

## Setup

```bash
npm install
cp .env.example .env
npm run create-key -- --name "my-test-key"   # prints an API key, save it
npm run dev                                   # starts the server on :8787
```

## Authentication & quotas

Every `/v1/*` route (except `/health`) requires an `x-api-key` header. Keys are created either via this admin `create-key` script, or self-serve through `/auth/api-keys` (see "Self-serve accounts" below). Each key has a monthly request quota; requests over quota get `429`.

```bash
# free plan
npm run create-key -- --name "my-test-key" --limit 100

# paid plan — see "Billing" below for what this actually does
npm run create-key -- --name "acme corp" --plan pro --email "billing@acme.example"
```

There's also a coarse per-IP rate limit (60 req/min) as an abuse backstop, independent of the per-key quota.

Since [Self-serve accounts](#self-serve-accounts) below, this CLI is really the *admin* path now — keys it creates have no `user_id`, so they're billed/blocked at the key level rather than through a user's account. Real customers go through `/auth/register` instead.

## Self-serve accounts

Register → confirm email → fill profile → create keys / subscribe, all as JSON endpoints under `/auth` (rate-limited tighter than `/v1` — 20 req/min/IP — since login, password reset, and 2FA-code checks are classic brute-force targets). There's no web UI in this project; these are endpoints a future frontend (or the existing landing page) would call.

**Email delivery via Resend.** Domain `rune-tech.org` is verified there; `EMAIL_FROM` is `noreply.pdftoolkit@rune-tech.org` — the qualified local part matters because `rune-tech.org` is a shared parent-company domain used by other projects too, so a plain `noreply@` wouldn't tell a recipient which product actually emailed them. Both the root-domain-vs-subdomain question and the qualified local part were verified empirically by test-sending to Resend's `delivered@resend.dev` before wiring either into code, since the DNS records Resend shows for a domain (a `send.` subdomain for MX/SPF, DKIM at the root) are easy to misread as meaning the *subdomain* is the sendable address when it's actually the root. Without `RESEND_API_KEY` set, `sendEmail()` (`src/lib/email.ts`) silently falls back to outbox-only — this is what keeps local dev working without needing real credentials.

**HTML templates** (`src/lib/emailTemplates.ts`) mirror the landing page's design system (`site/index.html`) for brand consistency: same paper/ink/registration-red palette, same "P" wordmark, same sharp 4px radius. Deliberately table-based with inline styles rather than a `<style>` block or flexbox/grid — Outlook desktop's rendering engine ignores most modern CSS, and table+inline-style is the one layout technique that's reliably consistent across Gmail/Apple Mail/Outlook/mobile. Doesn't load the actual Sora/Public Sans/IBM Plex Mono webfonts (most clients block external font loading in HTML mail); falls back to safe system-font stacks instead. `<meta name="color-scheme" content="light">` prevents Apple Mail/Outlook's automatic dark-mode inversion from clashing with the explicit brand colors. One template function (`renderEmail()`) produces both the HTML and a plain-text fallback from the same structured content, so nothing has to be written twice.

Every email is still written to the `outbox_emails` table and logged to stdout regardless of whether Resend is configured — useful for debugging without leaving the terminal, or for any environment that hasn't got `RESEND_API_KEY` set:

```bash
npm run read-outbox -- someone@example.com     # or npm run read-outbox:prod against a deployed instance
```

Sending is fire-and-forget (same pattern as Stripe usage reporting in `middleware/usage.ts`) — a Resend hiccup logs an error but doesn't fail the request that triggered it, so e.g. registration still succeeds even if the confirmation email doesn't go out.

```bash
# 1. Register — returns a session token immediately, no need to confirm first
curl -X POST http://localhost:8787/auth/register -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"at-least-8-chars"}'

# 2. Confirm — grab the token from the outbox
npm run read-outbox -- you@example.com
curl "http://localhost:8787/auth/confirm?token=..."

# 3. Fill profile
curl -X POST http://localhost:8787/auth/profile -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" -d '{"name":"Your Name","company":"Optional Co"}'

# 4. Create a key on your own account (requires confirmed email, not a completed profile)
curl -X POST http://localhost:8787/auth/api-keys -H "Authorization: Bearer $SESSION" \
  -H "Content-Type: application/json" -d '{"name":"my app"}'
```

**Login** (`POST /auth/login`) returns a session token directly, or `{twoFactorRequired: true, pendingId}` if the account has 2FA enabled (`POST /auth/2fa/enable`, toggle with `/auth/2fa/disable`) — a 6-digit code goes to the outbox, submitted back via `POST /auth/login/2fa {pendingId, code}`. Codes are single-use and expire in 10 minutes.

**Password reset**: `POST /auth/forgot-password {email}` always returns the same generic response regardless of whether the email exists (classic enumeration vector, worth getting right even though `/auth/register`'s "email already registered" doesn't bother — that trade-off is deliberate, see the comments in `src/routes/auth.ts`). `POST /auth/reset-password {token, newPassword}` consumes the link and revokes every existing session for that account, not just the one that requested the reset.

**Sessions** are opaque DB-backed tokens (`pdftk_sess_...`, same hash-and-lookup pattern as API keys — see `src/lib/users.ts`), not JWTs: simpler, consistent with the rest of this codebase, and trivially revocable (password reset just marks the rows `revoked_at`, no token-version bookkeeping needed). Sent as `Authorization: Bearer <token>`, separate from the `x-api-key` header used for the PDF endpoints.

**Billing moved to the user account** for self-serve signups: `POST /auth/subscribe {plan}` (requires confirmed email) creates the Stripe subscription on the *user*, not a specific key — reusing the exact same `subscribeToPlan()` helper (`src/lib/billing.ts`) as the admin CLI's `--plan` flag, so the two paths can't drift apart. Keys created via `/auth/api-keys` inherit their monthly limit from the user's plan at creation time (not live-updated if the user upgrades later — recreate the key to pick up a new limit, a deliberate MVP simplification). `requireApiKey` (`src/middleware/auth.ts`) checks billing status at the *user* level for keys with a `user_id`, and at the *key* level for admin-CLI keys without one — the Stripe webhook (`src/routes/stripeWebhook.ts`) updates whichever one actually has the matching subscription id.

**Passwords**: Node's built-in `scrypt` (`src/lib/passwords.ts`), no extra dependency. Minimum 8 characters, no other complexity rules for this MVP.

## Billing (Stripe)

Free-plan keys (`--plan free`, the default) are pure local quota enforcement — no Stripe involvement. Paid plans (`starter`/`pro`/`scale`) get a real Stripe subscription: a flat monthly price plus a metered price with graduated tiers, so usage within the plan's included quota is $0 and usage beyond it bills at $0.002/operation automatically. See `src/billingPlans.ts` for the actual numbers per tier.

**One-time setup**, per Stripe account/mode (test vs. live have separate price IDs):

```bash
npm run setup-stripe-products          # local — writes ./data/billing-price-ids.json
npm run setup-stripe-products:prod     # or against a deployed instance's compiled build
```

This creates one Product, one Billing Meter (`pdf_toolkit_operation`, shared across all paid tiers — see the comment in `billingPlans.ts` for why), and 6 Prices (a flat + metered pair per paid tier) in whatever Stripe account `STRIPE_SECRET_KEY` points at. Price IDs are environment-specific, so they're written to `<DATA_DIR>/billing-price-ids.json` (same volume as the SQLite DB in production) rather than committed — re-running without `--force` refuses to run again to avoid creating duplicates.

> **Don't delete `data/billing-price-ids.json` casually.** It's the only local record of which Stripe Price/Meter IDs already exist — losing it (without also cleaning up the corresponding objects in Stripe) makes the setup script's dedup guard useless and the next run will create a duplicate set. If you do lose it, pull the authoritative copy back from wherever it's actually running: `fly ssh sftp get /data/billing-price-ids.json data/billing-price-ids.json`.

**Creating a paid key** (`create-key --plan starter|pro|scale --email ...`) finds-or-creates a Stripe customer by email, attaches Stripe's test Visa card (`pm_card_visa`) as the default payment method, and creates the subscription. That test-card attach is a sandbox convenience for this admin-only CLI flow — real self-serve signup would collect a real payment method via Stripe Elements/Checkout instead.

**Usage reporting**: every successful (< 300) request from a key with a Stripe subscription reports one meter event, best-effort (a Stripe hiccup logs an error but doesn't affect the response already sent — see the comment in `src/middleware/usage.ts`).

**Webhook**: `POST /webhooks/stripe` (outside `/v1`, no `x-api-key` — Stripe authenticates via its own signature over the raw body) listens for `customer.subscription.updated`/`.deleted` and syncs `billing_status` on the matching key. Any status other than `active` blocks that key with `402` (see `requireApiKey` in `src/middleware/auth.ts`). Register it once per environment:

```bash
# via the Stripe CLI, or the API directly — url must be the deployed instance,
# Stripe needs to reach it over the public internet
stripe webhook_endpoints create \
  --url https://pdf-toolkit-api.fly.dev/webhooks/stripe \
  --enabled-events customer.subscription.updated,customer.subscription.deleted
# then: fly secrets set STRIPE_WEBHOOK_SECRET=whsec_... (the "secret" it returns)
```

## Response format

`merge`, `split`, `compress`, and `pdf-to-image` return the file itself as raw binary on success (`Content-Type: application/pdf`, `image/png`, or `application/zip`) — that's the actual product, and keeping it as raw bytes is what makes `curl ... -o file.pdf` work without a decoding step.

Every other response — `/health`, `/v1/usage`, and all errors (auth failures, validation failures, 500s) — uses a standard JSON envelope:

```json
{ "code": 200, "status": "success", "data": { "...": "..." } }
{ "code": 400, "status": "error", "data": { "error": "Upload at least 2 PDF files under the 'files' field" } }
```

## Endpoints

All endpoints are under `/v1` and require the `x-api-key` header. Uploads are `multipart/form-data`.

### `POST /v1/merge`

Merge 2+ PDFs, in order, into one.

```bash
curl -H "x-api-key: $KEY" \
  -F "files=@a.pdf" -F "files=@b.pdf" \
  http://localhost:8787/v1/merge -o merged.pdf
```

### `POST /v1/split`

Split a PDF. Omit `ranges` to get one PDF per page (returned as a zip). Pass `ranges` (e.g. `1-3,5`) to extract just those pages into a single PDF.

```bash
# one PDF per page, zipped
curl -H "x-api-key: $KEY" -F "file=@doc.pdf" http://localhost:8787/v1/split -o pages.zip

# just pages 1-3 and 5
curl -H "x-api-key: $KEY" -F "file=@doc.pdf" -F "ranges=1-3,5" http://localhost:8787/v1/split -o excerpt.pdf
```

### `POST /v1/compress`

```bash
curl -H "x-api-key: $KEY" -F "file=@doc.pdf" http://localhost:8787/v1/compress -o compressed.pdf
```

Response headers `X-Original-Size-Bytes` / `X-Compressed-Size-Bytes` report the before/after size.

### `POST /v1/pdf-to-image`

Rasterize pages to PNG or JPEG. Fields: `format` (`png` default, or `jpeg`), `ranges` (optional, same syntax as split), `scale` (optional, default `2.0` ≈ 144 DPI). Returns a single image if one page is requested, otherwise a zip.

```bash
curl -H "x-api-key: $KEY" -F "file=@doc.pdf" -F "ranges=1" http://localhost:8787/v1/pdf-to-image -o page1.png
```

### `GET /v1/usage`

Current month's usage against your key's quota.

```bash
curl -H "x-api-key: $KEY" http://localhost:8787/v1/usage
# {"code":200,"status":"success","data":{"plan":"free","monthlyLimit":100,"usedThisMonth":3,"remaining":97}}
```

## Testing

```bash
npm test          # unit tests for the pure PDF operations (merge/split/compress)
```

The `pdf-to-image` path (pdfjs-dist + `@napi-rs/canvas` rendering) is covered by manual smoke testing rather than unit tests — rendering correctness is easiest to eyeball as an actual image. If you change `src/lib/pdfToImage.ts`, manually re-verify: start the server, hit the endpoint with a real PDF, and open the resulting image.

## Notable implementation detail: pdfjs-dist on older Node

`pdfjs-dist`'s Node code path relies on `process.getBuiltinModule`, added in Node 20.16/22.3. On older Node (this was built/tested against 20.11), that function doesn't exist, and pdfjs-dist silently falls back to broken canvas globals and blank text rendering instead of erroring. `src/lib/pdfToImage.ts` imports `./canvasPolyfill.js` first to patch `process.getBuiltinModule` before pdfjs-dist's module code runs. Also note: pdf.js's Node font-loading path passes `standardFontDataUrl`/`cMapUrl` straight to `fs.promises.readFile()`, so those must be plain filesystem paths, not `file://` URLs.

If you upgrade to Node ≥20.16, the polyfill becomes a no-op (guarded by a `typeof` check) — safe to leave in place.

## Deployment

Live at **https://pdf-toolkit-api.fly.dev** (Fly.io, app `pdf-toolkit-api`, region `iad`). `Dockerfile` is a two-stage build (`node:20-slim`); `fly.toml` pins the app to a single always-on machine with a persistent volume (`pdf_toolkit_data`, mounted at `/data`) for the SQLite file — deliberately not scaled beyond 1 machine, since SQLite needs a single writer.

```bash
fly deploy                                  # redeploy after code changes
fly ssh console -C "node dist/scripts/create-key.js --name X"   # issue a key against production
fly logs                                    # tail production logs
```

**Required Fly secrets** (`fly secrets set KEY=value`, or via `fly secrets list` to check what's set): `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (see "Billing" above), `PUBLIC_BASE_URL` (must be the real `https://pdf-toolkit-api.fly.dev` — without it, links in confirmation/reset emails default to `localhost:8787` and are useless. Caught this exact bug on first deploy of the self-serve auth feature; if you fork this to a different domain, don't forget to reset it), and `RESEND_API_KEY`/`EMAIL_FROM` (see "Self-serve accounts" above — without `RESEND_API_KEY`, email falls back to outbox-only, which silently breaks real signups in production even though everything still returns 200).

Verified end to end against the live instance: all 4 PDF endpoints, auth rejection, usage metering, and the full self-serve flow (register → confirm → subscribe → create key → cancel via Stripe → webhook correctly blocks the key).

## Site

[`site/index.html`](site/index.html) and [`site/docs.html`](site/docs.html) are a self-contained landing page and API reference, hand-authored (no build step). Served directly by the Express app itself (`app.use(express.static(...))` in `src/index.ts`, `extensions: ["html"]` so `/docs` resolves to `docs.html` without a redirect) — the real domain is canonical:

- Landing: https://pdf-toolkit-api.fly.dev/
- Docs: https://pdf-toolkit-api.fly.dev/docs

They started as standalone Claude Artifacts (separate `claude.ai/code/artifact/...` URLs) before being wired into the actual app; all internal links use absolute `https://pdf-toolkit-api.fly.dev/...` URLs rather than relative paths so they keep working correctly if the files are ever republished as artifacts again, not just when served from Fly.

Pricing/quota numbers on the landing page mirror `FREE_TIER_MONTHLY_LIMIT` and the tiers from the brainstorm doc's Deep Dive section — update both places together if pricing changes. The docs page's Quickstart and a new "Account" section now describe the real `/auth/register` → confirm → create-key flow (see "Self-serve accounts" above) — keep them in sync if those endpoints change shape.

## Next steps toward a real launch

See the brainstorm doc's "Deep Dive" section for the full plan. Not yet done:
- A real payment-collection UI — `/auth/subscribe` activates instantly via Stripe's test card, fine for sandbox, not for taking real money
- Updating the landing/docs site copy to point at self-serve signup instead of the admin CLI
