# MORA HOME — Complete B2B Website + HTML CMS (v6)

Production-grade B2B manufacturing website for **MORA HOME** (Moradabad, India) with a fully admin-controlled CMS.
**Frontend: pure HTML5 + CSS3 + vanilla JavaScript** (no React/Next/Tailwind/Bootstrap anywhere). **Backend: Node.js + Express**, database-driven everything.

> **Admin Panel = the website's control room.** Anything an owner can reasonably want to change — content, images, products, sections, layouts, navigation, branding, colours, typography, forms, emails, WhatsApp, SEO, documents, analytics, site controls — is editable from `/admin` without touching source code.

---

## 1. Architecture

```
mora-home/
├── src/
│   ├── server.js          # Express bootstrap, static/media serving, scheduled-publish worker
│   ├── db.js              # SQLite data layer + schema + seed (swap point for PostgreSQL)
│   ├── auth.js            # scrypt passwords, DB sessions, CSRF, lockout, rate limiting
│   ├── media.js           # upload pipeline: EXIF strip → WebP/AVIF responsive variants → blur placeholder
│   ├── email.js           # queue + nodemailer + 3-retry backoff (SMTP from Admin → Email)
│   ├── pdf.js             # server-side A4 product spec sheets (pdfkit)
│   ├── render.js          # SSR of public HTML from DB (sections, cards, layout, placeholders)
│   └── routes/
│       ├── public.js      # public pages, /api/public/*, lead capture, sitemap/robots
│       └── admin.js       # every /api/admin/* endpoint (auth + CSRF-guarded)
├── public/
│   ├── css/main.css       # design system (themed by CSS variables from the DB)
│   ├── js/site.js         # drawer, slider, gallery+lightbox, search/filters, enquiry list, compare, WhatsApp flow
│   └── admin/             # the admin CMS (index.html + admin.css + admin.js, all vanilla)
├── data/                  # SQLite db, uploads (originals + variants), documents, backups  [gitignore this]
├── package.json
└── .env.example
```

**Why SQLite here?** The brief allows SQLite for local development. All SQL lives in `src/db.js` prepared statements using portable constructs; moving to PostgreSQL means swapping the driver + a few dialect details (booleans, `LIKE`→`ILIKE`). No ORM lock-in.

## 2. Quick start

```bash
cd mora-home
npm install
npm start            # http://localhost:3000   ·   npm run dev for --watch
```

- **First run:** open `http://localhost:3000/admin` → the setup wizard creates the **Owner** account (there are *no default credentials*), takes business details and lets you upload the logo.
- The public site works with **zero photography** — branded HTML/CSS placeholders show wherever an image is missing. Upload real images in **Admin → Media Library** (the owner-attached `Mora-home.logo.jpeg` is auto-registered as logo/favicon/OG image on first boot if present at `data/uploads/originals/brand-logo.jpeg`).

## 3. Environment variables (`.env.example` provided)

| Var | Purpose |
|---|---|
| `PORT` | HTTP port (default 3000) |
| `DATABASE_URL` | Future Postgres; SQLite file used locally |
| `SESSION_SECRET`, `SECURE_COOKIES=1` | Cookie hardening in production |
| `MAX_UPLOAD_MB` | Upload cap (default 12) |
| `SMTP_HOST/PORT/USER/PASSWORD` | Optional env email defaults (Admin → Email is the live source of truth) |
| `STORAGE_URL/KEY/SECRET`, `RESEND_API_KEY` | Reserved for the storage/email adapters |

Media/documents live on disk under `data/` (adapter-style access in `src/media.js` keeps an S3/Supabase/Cloudinary swap simple).

## 4. Feature map (Admin)

| Area | What’s inside |
|---|---|
| **Dashboard** | Live stats, missing-content warnings, 14-point Go-Live checklist, quick actions |
| **Leads Inbox** | Tabs (All/Enquiries/Catalogue/WhatsApp/Samples), table + Kanban, statuses (customizable), notes, assignee, follow-up, email-delivery state, CSV export |
| **Products** | Full editor: basic, material & care, details, pricing (fixed/tiers/on-request + MOQ + GST), up to 8 photos with reorder/alt/replace, SEO, draft/published/scheduled, featured/new/badge |
| **Categories & Filters** | Category CRUD (delete guarded), image picker, filter attribute lists (Materials, Ideal For, Order Type, Finish, Business Type) |
| **Media Library** | Drag-drop bulk upload, EXIF-strip, WebP+AVIF at 400–2400w, blur placeholders, focal point, crop (keeps same Media ID), **replace-in-place**, alt/tags, usage tracking, delete protection, storage meter |
| **Documents** | Multi-version catalogue PDFs (`/catalogue/latest` serves active one), spec-sheet PDF settings |
| **Homepage Builder** | All 15 sections: show/hide, reorder, duplicate, delete, per-section layout (width/columns/align/spacing/bg/watermark), hero slider (up to 8 slides, desktop+mobile images), **Save Draft → Preview → Publish**, version history (20) |
| **Pages → Page Builder** | Unlimited custom pages from 12 block types, SEO, draft/publish, core legal pages seeded (marked as starter drafts for lawyer review) |
| **Navigation & Footer** | Menu links (order/visibility/new-tab), header buttons + search, footer columns/contact/catalogue/copyright/disclaimer/background |
| **Content** | FAQs, Testimonials (with optional photos), By-the-Numbers (auto product count option), Trust & Clients |
| **Forms Builder** | 5 forms’ fields: visible/required/label/placeholder/help/options/order (name+phone enforced) |
| **Brand & Theme** | Logos (primary/dark/favicon/OG), 11-token colour system with pickers + WCAG AA warnings + “Reset to MORA Classic”, font selection, radius, watermark system, owner-only Custom CSS |
| **Business Info** | Single source of truth for phone/WhatsApp/emails/address/hours/GST/social/map |
| **Commerce** | Currency, price visibility, GST defaults, MOQ + sample policy copy |
| **WhatsApp** | Enable, button labels, message templates with live preview; number derives from Business Info |
| **Email** | SMTP, routing per lead type, templates with placeholders, test email, delivery queue w/ retry |
| **SEO & Analytics** | Global meta, robots index toggle, 404 content, redirects, owner-only GA4/Meta Pixel/Search Console/scripts |
| **Site Controls** | Maintenance mode, announcement bar, action dock toggles, checklist confirmations, **Delete Demo Data** |
| **Security & Users** | Roles (Owner/Manager/Editor/Sales), password change, sign-out-everywhere, lockout |
| **Backup & Restore** | One-click JSON database backup, download, typed-confirmation restore, history |
| **Audit Log** | Who/changed/what/when with before→after, searchable |
| **Admin Guide** | In-app how-tos for every common task |
| **Global search** | `Ctrl/⌘+K` across screens, products, leads, media |

## 5. Public website

Home (15 CMS sections incl. hero slider), `/products` (search normalizing `MH-2001`/`mh2001`/`2001`, fuzzy names, zero-result logging, category tabs, filters, sort, load-more), `/products/{slug}` (gallery+zoom+lightbox, specs, tiers/MOQ/GST, enquiry+WhatsApp+sample+PDF+share, related + recently-viewed), `/contact` (full form + catalogue request + map), `/enquiry-list` (localStorage 30 days, paste codes, MOQ hints, combined enquiry), `/compare` (≤4), `/p/{slug}` custom pages, editable 404, `sitemap.xml`, `robots.txt`, Product/Org/Breadcrumb/FAQ JSON-LD, `/catalogue/latest`.

**Placeholders, never broken images:** any missing image shows a styled MORA-brand placeholder (“Image not uploaded — Admin → Media Library”). No stock/AI photography ships with the product.

## 6. Security

scrypt password hashing · DB-backed httpOnly SameSite sessions (12 h idle / 30-day remember) · per-session CSRF tokens required on all mutations · 5-strike 15-min login lockout + rate limits on login/forms · role-based authorization (Owner/Manager/Editor/Sales) · MIME+size upload validation · parameterized SQL only · escaped output everywhere in SSR · nosniff/frame/referrer headers · secrets only via env.

## 7. Production checklist

1. `SECURE_COOKIES=1` behind HTTPS (nginx/Caddy) and a real domain.
2. Point uploads volume at durable storage (or swap adapter to S3-compatible).
3. Configure SMTP in **Admin → Email** and send a test.
4. Run **Backup** weekly (Owner): JSON dump + copy `data/uploads/`.
5. Re-mount/backup `data/` before redeploys (it holds the database).

## 8. QA notes (verified in this build)

- Draft stays hidden until Publish; changes appear publicly in ≤ 5 s (cache invalidation).
- Search treats MH-2001 / mh2001 / MH 2001 / 2001 identically; zero-result queries are logged to Admin.
- Leads persist even with SMTP unconfigured (jobs queue as `unconfigured`, one-click retry after SMTP setup).
- Deleting an in-use image is blocked with its usage list; replace-in-place keeps the ID so every usage updates.
- MOQ rejects 0/negative; ₹0 is never rendered (always “Price on Request”).

## 9. Assumptions documented (per brief Rule 6)

- SQLite for dev per §3.3 of the brief; Postgres noted as the production target with the swap point isolated in `db.js`.
- Local-disk storage adapter default; S3-style adapter reserved via env + `media.js` seam.
- Watermark artwork = built-in MORA monogram SVG (no artificial logo generation; owner’s real logo is uploaded/replaceable).
- Hero slides live inside the Hero section config (simpler single-editor UX) instead of a separate table.
- Email “Ask MORA” routing exists for the asktomora@gmail.com mailbox; public forms currently route to Enquiry/Catalogue pipelines.
- TOTP 2FA: session/lockout/reset primitives are implemented; TOTP enrollment UI is left as a documented extension (audit + sessions groundwork is in place).
- Auth covers the whole `/api/admin` surface; the static `/admin` assets are public but inert without a session.
