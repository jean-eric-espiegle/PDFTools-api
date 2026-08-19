# Content & SEO/UX Audit — PDF Toolkit API Site

Audited: `site/index.html` (landing, served at `/`) and `site/docs.html` (served at `/docs`), both live at `https://pdf-toolkit-api.fly.dev`.

Methodology: read both files in full, then verified every claim against the live production responses (actual HTTP headers, `/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/favicon.ico`) rather than assuming from the source. Findings are ordered by priority within each category. Nothing below has been fixed yet — this is the audit only.

---

## 🔴 Critical

### 1. Both pages are missing the entire HTML document skeleton
Neither file has `<!doctype html>`, `<html>`, `<head>`, or `<body>`. They start directly with a bare `<title>` tag. This is **not** a stylistic choice — it's a leftover from how these files were originally authored (as Claude Artifacts, which auto-wrap content in that skeleton at publish time) that never got adjusted when they were repurposed to be served directly by Express as production static files.

Browsers auto-correct this via the HTML5 parser (implied tags get inserted), so the pages *look* fine, but:
- No `<!doctype html>` → triggers **quirks mode**, which real auditing tools (Lighthouse, SEO checkers) flag as an outright error, and affects box-model/rendering consistency across browsers.
- No `<html lang="en">` → screen readers can't determine the page language (accessibility failure), and search engines use `lang` for language-targeted results.
- No explicit `<head>` → every meta tag added below technically has nowhere well-formed to live; relying on browser auto-correction to place them correctly is fragile, not spec-compliant, and some crawlers/social unfurlers are stricter than browsers.

**Fix:** wrap both files in a proper skeleton with `<!doctype html><html lang="en"><head>...</head><body>...</body></html>`.

### 2. No viewport meta tag on either page
`<meta name="viewport" content="width=device-width, initial-scale=1">` is completely absent. Verified by reading the raw source — it's not there. Without it, mobile browsers render the page at desktop width and require pinch-zoom to read anything. This is one of Google's explicit mobile-friendliness ranking factors, and a real usability failure for anyone visiting from a phone (a large share of traffic from Reddit/HN/Twitter links, which is exactly where the planned promotion is headed).

### 3. No meta description on either page
Search engines and AI answer engines both lean on this heavily for the snippet/summary they show. Without it, Google auto-generates a snippet by scraping arbitrary page text, which is unpredictable and often picks a bad fragment (e.g., a nav label or mid-sentence text).

**Suggested copy:**
- Landing: `"Merge, split, compress, and rasterize PDFs over a simple REST API. Four endpoints, one JSON response format, transparent per-operation pricing."`
- Docs: `"API reference for the PDF Toolkit API — authentication, response format, and all four endpoints with curl examples."`

### 4. No Open Graph / Twitter Card tags
When either URL is shared on X/Twitter, LinkedIn, Slack, or Discord — i.e., every channel in the current promotion plan — there's no title, description, or image preview. It shows as a bare link. This directly undercuts the free-marketing push before it even starts; it's the highest-leverage fix relative to effort on this whole list given what's coming next (Show HN, Reddit, community posts).

**Fix:** add `og:title`, `og:description`, `og:image`, `og:url`, `og:type`, plus `twitter:card` (`summary_large_image`), `twitter:title`, `twitter:description`, `twitter:image`. Needs a real OG image (1200×630) — doesn't exist yet, would need to be created.

### 5. No favicon — literally 404s
`GET /favicon.ico` returns 404. Browsers show a blank/generic icon in tabs and bookmarks. The `wordmark .mark` div (the small red-bordered "P") could be exported as an actual favicon rather than being pure CSS.

### 6. No robots.txt
`GET /robots.txt` returns 404 (Express's default error page, not even a proper 404 body). Not strictly required — absence defaults to "crawl everything" — but a real product site should have one, if only to declare the sitemap location and signal intentional, non-accidental crawl access. Near-zero effort to add.

### 7. No sitemap.xml
`GET /sitemap.xml` returns 404. Low-impact today at 2 pages, but trivial to add now and becomes actually necessary if docs ever gets split into per-endpoint pages (see #10).

### 8. No `/llms.txt`
`GET /llms.txt` returns 404. This is the emerging (informally standardized, increasingly adopted) convention for AI-SEO: a plain markdown file giving AI crawlers/agents a clean, structured summary of what the site is and where the key content lives, written for LLM consumption rather than human browsing or classic keyword crawling. Given this product is exactly the kind of thing that gets discovered via "is there a PDF API for X" questions asked directly to ChatGPT/Perplexity/Claude, this is cheap and directly on-target for the "AI-SEO" half of the ask.

---

## 🟠 High priority

### 9. No structured data (JSON-LD)
Zero `<script type="application/ld+json">` anywhere. Schema.org markup is one of the clearest signals both classic search engines (rich snippets: pricing, ratings) and AI answer engines (LLMs strongly prefer unambiguous machine-readable facts over parsing prose) can use. Concrete candidates already have real data to back them:
- `SoftwareApplication` + `Offer` (×4) for the pricing tiers — real numbers already exist in `billingPlans.ts`, just need mirroring into schema
- `FAQPage` (pairs with #11 below)
- `Organization` for the product/brand identity

### 10. Docs content lives entirely behind hash anchors, not real URLs
Every endpoint (`#merge`, `#split`, `#compress`, `#pdf-to-image`) is a section on one long page, not its own crawlable URL. Consequence: Google can't index and directly rank "PDF Toolkit API merge endpoint" as its own result with a matching title/snippet, and long-tail searches like "pdf merge api curl example" can't land precisely on that content. This is the biggest lift on this list — not a metadata fix, an actual information-architecture change (real routes per endpoint, or at minimum unique `<title>`/meta-description per section if staying single-page isn't negotiable). Worth a deliberate decision rather than doing reflexively: might be premature before there's real traffic data showing which endpoints people actually search for individually.

### 11. No FAQ / question-shaped content anywhere
AI-SEO increasingly rewards content phrased as direct Q&A — "How do I merge PDFs via API?", "What's the free tier limit?", "Is there a PDF API with per-operation pricing?" — because that's literally the shape of what gets fed back verbatim in an AI answer. Every sentence on the current site is product-description prose, not question-shaped. A dedicated FAQ section (which also carries `FAQPage` JSON-LD, see #9) is probably the single highest-leverage content addition specifically for AI-SEO.

### 12. No comparison/"alternative to X" content
The original brainstorm doc's own SEO plan called for exactly this ("PDFShift alternative", "PDF.co pricing" style content) targeting people already comparison-shopping. None of it exists on-site. This is a content-writing task, not a technical fix, but it's a documented plan that never got executed and is worth resurfacing now that promotion is actually starting.

### 13. Differentiation claims are vague
The headline ("Four PDF operations. One clean API.") is accurate but doesn't say *why this over PDF.co, PDFShift, or Cloudmersive*. The actual competitive edges — transparent flat-rate-plus-overage pricing, a single predictable JSON envelope, no vendor lock-in complexity — were articulated clearly in the original brainstorm doc but never made it onto the site itself. An AI summarizing "best PDF APIs" has nothing concrete to quote about what makes this one different.

---

## 🟡 Medium priority (UX/content)

### 14. Primary CTA dumps every visitor into raw curl commands
"Get started" (appears 6 times across the landing page) goes straight to `/docs#quickstart` — 100% curl/JSON examples, no web form. Anyone not comfortable in a terminal bounces immediately. This is a real conversion problem, not just a docs gap: the button promises "get started" but delivers "read technical documentation." (Building an actual web signup form is a bigger scope question — flagging the mismatch here, not prescribing the fix.)

### 15. No lead capture for not-ready-yet visitors
No email signup, no "notify me." Given the promotion plan is slow/organic (SEO, community answers, one-shot launches), most first-time visitors won't convert same-day. Right now that traffic is just gone rather than nurtured.

### 16. No social proof section
Deliberate and correct as of today — there are no real customers yet, so fabricating testimonials/logos would be dishonest, and the site correctly doesn't. Flagging this as a "the moment you have 2-3 real users, add this" item, not a current defect.

### 17. Stale, internal-sounding footer copy on the docs page
`"Built as the first release from a microservices brainstorm."` — reads like a leaked planning note, not customer-facing copy. A real visitor has no context for what "a microservices brainstorm" means and it undercuts the professional tone the rest of the page works hard for. Replace with something normal (a copyright line, or nothing).

### 18. No "copy" button on code blocks
Every curl/JSON example requires manual select-and-copy. Minor, but it's a near-universal convention on modern docs sites at this point and its absence is noticeable.

### 19. Pricing tier buttons don't reflect the tier clicked
All four plan cards' CTAs say "Get started" and go to the identical `/docs#quickstart` regardless of which plan was clicked — someone clicking "Scale ($99/mo)" lands on the same generic quickstart as someone clicking "Free," with no plan context carried through. Minor, but slightly misleading given the buttons visually imply "start this plan."

### 20. No `<h1>` anywhere on the docs page
Verified directly — zero `<h1>` elements in `docs.html`. The page jumps straight to `<h2>` section headings. Every page should have exactly one `<h1>` describing its main topic; this is both an SEO and accessibility gap (screen reader users rely on `<h1>` to confirm they've landed on the right page).

---

## 🟢 Low priority / polish

### 21. `Cache-Control: public, max-age=0`
Verified via response headers on both pages. Every repeat visit revalidates with the server (an extra round-trip) instead of using a short local cache. Minor — pages are already small (~20KB) and fast — but a `max-age` of a few minutes costs nothing and shaves latency for anyone navigating back and forth.

### 22. Google Fonts loading — already correctly configured, no action needed
Checked the actual `<link>` tag: `&display=swap` is present on both pages, so this isn't blocking text rendering while fonts load. Noting it here only so it's clear this was checked, not overlooked.

### 23. No images on either page — not a current defect
Both pages use CSS-drawn code panels instead of raster images, so there's no CLS (layout shift) risk and nothing to add `alt` text to today. Worth keeping in mind if a hero image or OG image asset gets added later (#4).

---

## Summary: what to actually do first

If prioritizing by (impact ÷ effort), roughly in order:
1. Wrap both files in a proper `<!doctype html>`/`<html>`/`<head>`/`<body>` skeleton, add viewport + meta description + OG/Twitter tags (#1–4) — one focused pass, fixes the biggest and cheapest wins together
2. Add a real favicon, `robots.txt`, `sitemap.xml`, `llms.txt` (#5–8) — all near-zero-effort, currently all literally 404ing
3. Add an `<h1>` to the docs page (#20) — a one-line fix
4. Write an FAQ section with `FAQPage` JSON-LD (#9, #11) — highest-leverage content addition for AI-SEO specifically
5. Everything else (comparison content, per-endpoint URLs, lead capture, CTA rework) is either a content-writing project or a real scope decision, not a quick fix — worth discussing before starting.
