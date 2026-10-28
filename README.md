# MORA HOME — B2B Website + No-Code Visual Admin CMS

Production-ready, database-driven B2B website and beginner-friendly Admin Control Center for
**MORA HOME** (morahome.in) — manufacturer & exporter of handcrafted metal and wooden home
products, Moradabad (U.P.), India.

* **Frontend:** Semantic HTML5 + modern CSS3 (custom properties) + Vanilla ES6 JavaScript.
  No React / Next / Vue / Tailwind anywhere.
* **Backend:** Node.js + Express + SQLite (WASM build, single-file `data/mora.db`,
  swap-ready for PostgreSQL — all SQL goes through `src/db.js` helpers `all/get/run`).
* **Media:** local persistent storage in `data/uploads`, automatic square-crop + focal point,
  WebP optimisation via `sharp` (graceful fallback when sharp is unavailable).
* **Zero cloud keys required.** Runs 100% out-of-the-box.

---

## Quick start

```bash
cd mora-home
npm install          # express, sql.js, multer, sharp, pdfkit
npm start            # boots on http://localhost:3000 (first run auto-seeds demo content)
```

| Where | URL | Credentials |
|---|---|---|
| Public website | `http://localhost:3000/` | — |
| Admin Control Center | `http://localhost:3000/admin` | user `admin` · password `mora123` (change in **Settings**) |

First boot automatically seeds: theme, 8 homepage sections, 5 categories, the 6 reference
demo products (MH-2017 … MH-2024) with branded MORA placeholders, contact details,
WhatsApp template, SEO tags and footer content.

Useful scripts

```bash
npm run seed     # re-seed from scratch (wipes content!)
npm run qa       # run the audit regression battery (needs the server running on :3000)
```

---

## Security hardening (Oct 2026 audit)

Implemented in code, so every deploy and every host gets it automatically:

* **Login page leak removed** — no username prefill, no “default password” hints in the HTML;
  `/admin*` and `/api/admin*` send `X-Robots-Tag: noindex, nofollow`, and the login page also
  carries `<meta name="robots" content="noindex, nofollow">`.
* **Brute-force protection** — `/admin/login` is rate-limited to 5 attempts / 15 min / IP
  (`src/lib/ratelimit.js`, zero-dependency, proxy-aware client IP).
* **CSRF protection** — login uses a double-submit cookie token (`mora_csrf` cookie + hidden
  `_csrf` field, `SameSite=Lax`).
* **Leads API hardened** — honeypot field (`website`), server-side validation (name + valid
  phone or email), length caps, type whitelist, 10 leads / hour / IP; WhatsApp click tracking
  capped at 30 / hour / IP. Bots get a silent fake success and are never stored.
* **Security headers on every response** — CSP (`script-src 'self'` — the site ships zero
  inline scripts), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `X-Frame-Options` + `frame-ancestors 'self'`, and HSTS when served over HTTPS.
* **No internal error leakage** — the error handler honours status codes (bad JSON → 400
  “Invalid request body.”, never a raw stack/parse message, never a 500).
* **WhatsApp buttons use WCAG-safe dark teal** (`#075E54`, ≈7.5:1 with white) instead of
  `#25D366` (1.98:1); the bright green survives as an accent colour only.
* **Global `:focus-visible` outline** for keyboard users (public + admin).

Still **your** job in production: change the default password on first login (Admin →
Settings), and consider putting `/admin` behind Cloudflare Access.

---

## SEO & sharing (Oct 2026 audit)

* **Absolute `og:image` everywhere** — a branded `assets/brand/og-banner.png` (1200×630,
  ~50 KB) by default; product pages use their own photo. Plus `og:url`, `og:type`,
  `og:site_name`, `og:locale` and a full `twitter:card = summary_large_image` set.
* **Product JSON-LD** (`Product` + `BreadcrumbList` with MOQ `eligibleQuantity`, specs as
  `additionalProperty`) and homepage `WebSite` + `SearchAction` + `Organization`.
* **Sitemap hygiene** — `?cat=` duplicates removed (they are client-side filters),
  `/catalogue/latest` added; spec-sheet URLs are `noindex` instead of robots-blocked.
* **One H1 per page** — hero slides 2+ are H2; `/contact` promotes its heading to H1.
* **Real variable font weights** (no more synthetic bold) and only the two fonts actually
  selected in the theme are downloaded.
* **Cache strategy** — CSS/JS URLs carry a content-hash (`?v=…`) and are cached 30 days;
  uploads are cached 30 days `immutable`; `manifest.json` served for “Add to Home Screen”.
* **Catalogue dead-end fixed** — when no master PDF is uploaded, `/catalogue/latest`
  auto-generates a branded wholesale catalogue PDF (cover + one spec page per published
  product), cached until products change.

---

## Deployment & data safety — read before hosting

The database (`data/mora.db`) and all uploads live in the **`data/` directory of the machine
running Node** (`DATA_DIR` env var overrides the location).

* **Render free tier:** the filesystem is **ephemeral** — every deploy, restart or idle
  spin-down **wipes leads, products and uploads**. Either attach a Render **persistent disk**
  mounted at `DATA_DIR`, or treat Render free as a staging box only. Download a backup
  (Admin → Backup & Restore) before every deploy.
* **Hostinger:** Node.js does **not** run on shared web-hosting plans (those are PHP). You need
  a **KVM VPS** plan. There, run `npm i -g pm2`, `pm2 start server.js --name morahome`, put
  nginx in front with SSL, and point `DATA_DIR` at a folder on the VPS disk — data then
  survives restarts naturally.
* Either way: **`git` never contains your data** (`data/` is git-ignored); move sites by
  uploading a backup .zip through Admin → Restore.

---

## What the owner can do without code (Admin → left sidebar)

1. **Customize Design & Layout** — split-screen live editor.
   * 1-click **“Reset to MORA Classic Theme”**.
   * Colour pickers for every token (backgrounds, walnut browns, blood-red CTA, footer, WhatsApp
     green…) with automatic **contrast warnings**.
   * Heading/body font dropdowns (Playfair Display / Cormorant Garamond / DM Sans / Inter),
     text-size scale slider (90–115 %), card & button roundness sliders, section spacing,
     mobile grid 2/1 columns, gifting-banner watermark toggle + opacity (3–20 %).
   * Live iframe preview with **📱 Mobile /  Desktop** toggle and **click-to-edit**:
     clicking a heading/section inside the preview opens its exact edit box.
   * Brand & Logo: crest / wordmark / both, crest + ivory-crest uploads (the dark footer always
     shows the crest on an ivory luxury badge — no invisible-logo bug).
2. **Homepage Section Builder** — drag ⋮ to reorder, ON/OFF switch, ✏️ Edit Content (only the
   fields of that section, with hints & examples), 📄 Duplicate.
3. **Products** — visual editor with drag-&-drop photo uploader (max 8), automatic **1:1 square
   crop + click-to-set focal point**, unique-code validation, badge dropdown, category dropdown,
   the three card lines (Material / Size / MOQ), unlimited spec-table rows, price-on-request,
   featured & status toggles, and a **live mobile-card + detail-page preview while typing**.
4. **Categories** — name, subtitle, photo, order, visibility.
5. **Leads Inbox (CRM)** — every enquiry / bulk list / catalogue request / WhatsApp click is
   stored in the database *first*; status board (New → Contacted → Quoted → Won → Closed),
   internal notes, 1-click WhatsApp/call links, **Export to Excel/CSV**.
6. **Contact & WhatsApp Manager** — phone, WhatsApp, both emails, address, map link/embed and
   the WhatsApp message template (`{name} {company} {product} {code}`) edited once, published
   everywhere (header, contact, footer, floating dock, PDF spec sheets).
7. **SEO & Navigation** — per-page titles/descriptions + editable header nav links.
8. **Footer & Social Links** — tagline, about blurb, catalogue card text, registered-business
   line (GSTIN etc. — shown above the copyright when filled), B2B disclaimer, quick/legal link
   editors and social profile URLs (Instagram, Facebook, LinkedIn, YouTube, IndiaMART, Google
   Business, WhatsApp). Icons appear in the footer only for profiles you fill in.
9. **Catalogue & PDF Spec Sheets** — upload the master wholesale PDF (served at
   `/catalogue/latest`; with none uploaded the site auto-generates a branded catalogue PDF
   from your live products); every product auto-generates a printable A4 spec sheet
   (`/products/<code>/spec-sheet`) **and** a real PDF (`/products/<code>/spec-sheet.pdf`)
   with logo, specs, MOQ and contact block.
10. **Backup & Restore** — 1-click `Download Full Website Backup (.zip)` (database + uploads)
    and 1-click restore uploader.
11. **📘 How to Use This Admin** — plain-English step-by-step checklists.
12. **Settings & Demo Data** — change login, **🗑️ Clear All Demo Data**, re-add samples.

Every draft edit shows “● Unpublished changes” in the top bar; **🚀 Publish** pushes draft →
live atomically, **↩️ Revert** discards drafts.

---

## Reference-layout QA implemented

* `/products`: sticky rounded search bar with **code normalisation** (`mh2017`, `MH 2017`,
  `2017` all match `MH-2017`); two-zone filter row — swipeable category tabs (masked fade) +
  fixed `Filter & Sort` button that can never overlap tab text; results counter
  “Showing X of Y products” with clearable filter chips; grid **2 cols mobile / 3 tablet /
  4 desktop**.
* Product cards: uniform heights, square media, **solid cream pill badge** (top-left, 96 %
  opacity, dark walnut text — legible over any photo), quick-add circle top-right, code /
  2-line-clamped title / 3-line spec block / full-width blood-red **Send Enquiry** that
  pre-fills the enquiry modal with that exact name + code.
* Floating dock (`Send Enquiry` pill + WhatsApp circle) sits above an 88 px mobile body padding
  and auto-hides while the contact form is on screen or any modal is open.
* Signature section headers everywhere: uppercase letter-spaced overline, serif heading,
  ornamental `──── ❧ ────` botanical divider.
* Blood-red gifting banner with mandala watermark (opacity admin-controlled), dark walnut
  footer with ivory crest badge, catalogue request card, legal links and B2B disclaimer.

---

## Project structure

```
mora-home/
├─ server.js                 # zero-config boot: db open → auto-seed → migrate → express
│                            # + security headers, URL normalisation, cache policy, 404
├─ package.json
├─ scripts/qa-verify.js      # audit regression battery (npm run qa)
├─ assets/brand/             # processed official crest PNGs + og-banner.png + source PDFs
├─ data/                     # runtime (git-ignored): mora.db, uploads/, backups/
├─ public/
│  ├─ css/site.css           # public design system (all tokens via CSS variables)
│  ├─ css/admin.css          # admin CMS styling
│  ├─ css/print.css          # A4 spec-sheet print styles
│  └─ js/site.js · admin.js · preview.js · print.js · header-fx.js
└─ src/
   ├─ db.js                  # SQLite (sql.js) + schema + persist + settings live/draft
   ├─ migrate.js             # idempotent content fixes for databases seeded by old versions
   ├─ seed.js                # demo content seed (products MH-2017…MH-2024, theme, sections)
   ├─ schemas.js             # section registry: fields + defaults (drives admin forms)
   ├─ theme.js               # default theme, CSS variable builder, contrast maths
   ├─ settings.js            # settings accessor with fallbacks
   ├─ render.js              # esc, ornament divider, icons, placeholders, product card
   ├─ lib/  auth.js · media.js (sharp crop/WebP) · pdf.js (spec sheets + auto catalogue)
   │        zip.js (backup/restore) · ratelimit.js · assets.js (cache-busted URLs)
   ├─ routes/ public.js · admin.js
   └─ views/ layout.js · home.js · products.js · product.js · pages.js · specsheet.js · admin.js
```

### Swapping SQLite → PostgreSQL
All queries are plain SQL executed through `src/db.js` (`all/get/run/getSetting…`).
Replace those helpers with a `pg` pool implementation and the rest of the app is unchanged.

### Default content IDs
Demo products: `MH-2017, MH-2020, MH-2021, MH-2022, MH-2023, MH-2024` (flagged `demo = 1`,
removed by **Clear All Demo Data**). Categories: `kitchenware, home-decor, serveware-utensils,
pooja-items, corporate-gifting`.
