# Content & SEO/UX Audit — PDF Toolkit API Site

Audited: `site/index.html` (landing, served at `/`) and `site/docs.html` (served at `/docs`), both live at `https://pdf-toolkit-api.fly.dev`.

Methodology: read both files in full, then verified every claim against the live production responses (actual HTTP headers, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/favicon.ico`) rather than assuming from the source.

**Update:** all 8 Critical and 3 of 5 High Priority items are fixed and deployed (see commit `d72877b`, "Initial commit: PDF Toolkit API MVP + SEO/AI-SEO fixes"). Fixed items have been removed from this file — this now tracks only what's still open. Two High Priority items were deliberately deferred rather than silently done or skipped; they're kept below with the reasoning.

---

## 🟠 High priority — still open

### Docs content lives entirely behind hash anchors, not real URLs
Every endpoint (`#merge`, `#split`, `#compress`, `#pdf-to-image`) is a section on one long page, not its own crawlable URL. Consequence: Google can't index and directly rank "PDF Toolkit API merge endpoint" as its own result with a matching title/snippet, and long-tail searches like "pdf merge api curl example" can't land precisely on that content.

**Deferred deliberately**, not a quick fix — this is a real information-architecture change (real routes per endpoint, or at minimum unique `<title>`/meta-description per section if staying single-page isn't negotiable). Worth deciding once there's real traffic data showing which endpoints people actually search for individually, rather than restructuring reflexively now.

### No comparison/"alternative to X" content
The original brainstorm doc's own SEO plan called for exactly this ("PDFShift alternative", "PDF.co pricing" style content) targeting people already comparison-shopping. None of it exists on-site.

**Deferred deliberately** — this needs researched, verified, accurate claims about competitors' actual current pricing and features. Writing comparison content without solid, current research risks making inaccurate claims about competitors, which is a real risk, not just an incompleteness. Worth doing once there's time to actually research current competitor offerings properly.

---

## 🟡 Medium priority (UX/content) — not yet addressed

### Primary CTA dumps every visitor into raw curl commands
"Get started" (appears 6 times across the landing page) goes straight to `/docs#quickstart` — 100% curl/JSON examples, no web form. Anyone not comfortable in a terminal bounces immediately. This is a real conversion problem, not just a docs gap: the button promises "get started" but delivers "read technical documentation." (Building an actual web signup form is a bigger scope question — flagging the mismatch here, not prescribing the fix.)

### No lead capture for not-ready-yet visitors
No email signup, no "notify me." Given the promotion plan is slow/organic (SEO, community answers, one-shot launches), most first-time visitors won't convert same-day. Right now that traffic is just gone rather than nurtured.

### No social proof section
Deliberate and correct as of today — there are no real customers yet, so fabricating testimonials/logos would be dishonest, and the site correctly doesn't. Flagging this as a "the moment you have 2-3 real users, add this" item, not a current defect.

### Stale, internal-sounding footer copy on the docs page
`"Built as the first release from a microservices brainstorm."` — reads like a leaked planning note, not customer-facing copy. A real visitor has no context for what "a microservices brainstorm" means and it undercuts the professional tone the rest of the page works hard for. Replace with something normal (a copyright line, or nothing).

### No "copy" button on code blocks
Every curl/JSON example requires manual select-and-copy. Minor, but it's a near-universal convention on modern docs sites at this point and its absence is noticeable.

### Pricing tier buttons don't reflect the tier clicked
All four plan cards' CTAs say "Get started" and go to the identical `/docs#quickstart` regardless of which plan was clicked — someone clicking "Scale ($99/mo)" lands on the same generic quickstart as someone clicking "Free," with no plan context carried through. Minor, but slightly misleading given the buttons visually imply "start this plan."

---

## 🟢 Low priority / polish — not yet addressed

### `Cache-Control: public, max-age=0`
Verified via response headers on both pages. Every repeat visit revalidates with the server (an extra round-trip) instead of using a short local cache. Minor — pages are already small (~20KB) and fast — but a `max-age` of a few minutes costs nothing and shaves latency for anyone navigating back and forth.

---

## Fixed (for reference — commit `d72877b`)

**Critical:** HTML document skeleton (doctype/html/head/body) on both pages · viewport meta tag · meta descriptions · Open Graph + Twitter Card tags with a generated 1200×630 OG image (`site/og-image.png`) · favicon (SVG + PNG, `site/favicon.svg` + `site/favicon.ico`) · `robots.txt` · `sitemap.xml` · `llms.txt`.

**High priority:** JSON-LD structured data (`SoftwareApplication` + `Offer` ×4 for pricing, `FAQPage`, `TechArticle` on docs) · new FAQ section on the landing page with real Q&A content, paired with the `FAQPage` schema · new "Why this instead of a general document platform" section articulating the actual competitive edges (transparent pricing, one response shape, no lock-in) that existed in the brainstorm doc but never made it onto the site · missing `<h1>` on the docs page (added visually-hidden, to avoid disrupting the dense reference-page layout).
