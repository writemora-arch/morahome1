# Deploying MORA HOME — Render (recommended) / Railway

This app is a **persistent Node.js server with an on-disk database and uploads folder**, so it deploys to hosts that run real servers (Render, Railway, Fly.io, VPS) — not to pure static/serverless hosts like Netlify without a re-architecture.

Everything below assumes the project is at `mora-home/` as built. Total time: ≈ 20 minutes.

---

## A. Prepare the repository (one time, local)

```bash
cd mora-home
git init
git add .
git commit -m "MORA HOME v6"
# create an empty repo at github.com/yourname/mora-home, then:
git remote add origin https://github.com/yourname/mora-home.git
git push -u origin main
```

> `.gitignore` already excludes `data/`, `node_modules/`, `.env` — your database never leaves your machine. The app self-seeds on first boot (including the bundled `assets/brand-logo.jpeg`, which auto-registers as the logo/favicon/OG image).

---

## B. Deploy on Render

### B1. One-click (Blueprint)
1. Go to **dashboard.render.com → New → Blueprint Instance**.
2. Connect your GitHub repo. Render reads `render.yaml` and proposes the service — confirm.
3. It creates: a Node web service (`npm ci` → `node src/server.js`), a **1 GB persistent disk** mounted at `/var/data`, and env vars (`DATA_DIR`, `SESSION_SECRET` auto-generated, `SECURE_COOKIES=1`).
4. Wait for the deploy (first one takes ~3–5 min while sharp installs). Health check: `GET /healthz`.

### B2. Manual (same result, if you skip the blueprint)
- **New → Web Service** → your repo → Runtime: Node
  - Build Command: `npm ci`
  - Start Command: `node src/server.js`
  - Instance Type: **Starter** *(required — free instances cannot mount disks, and without a disk the database resets on every restart/redeploy)*
  - **Add Disk**: Name `mora-data`, Mount Path `/var/data`, Size 1 GB
  - Environment Variables:

| Key | Value |
|---|---|
| `NODE_VERSION` | `20` |
| `DATA_DIR` | `/var/data` |
| `SECURE_COOKIES` | `1` |
| `SESSION_SECRET` | (generate — any long random string) |
| `MAX_UPLOAD_MB` | `12` |
| `APP_URL` | `https://morahome.in` |

  - Health Check Path: `/healthz`

### B3. First run on Render
1. Open your service URL (`https://mora-home.onrender.com/admin`).
2. The **setup wizard** runs (no default credentials): create the Owner account → business details → logo (already seeded from the bundle; replace anytime under Media Library).
3. Done — the site is live with your content.

### B4. Custom domain + HTTPS
1. Service → **Settings → Custom Domains → Add** `morahome.in` (and `www.morahome.in`).
2. At your DNS provider add the records Render shows (CNAME `www` → your onrender URL; ANAME/ALIAS or CNAME for the apex per provider; with Cloudflare a CNAME works).
3. Render provisions **free Let's Encrypt certificates automatically** (a few minutes after DNS resolves). `SECURE_COOKIES=1` already ensures auth cookies are HTTPS-only.

### B5. Email (lead notifications)
Admin → **Email**: for Gmail use an **App Password** (Google Account → Security → 2-Step → App passwords):
`SMTP Host: smtp.gmail.com · Port: 587 · User: you@gmail.com · Pass: <app password>` → **Send Test Email**. Leads are always saved to the DB even before email works; use **Retry queued** after configuring.

### B6. Moving your existing local content to the production server
No copying of files needed:
1. Locally: Admin → **Backup & Restore → Create Backup → Download** (JSON).
2. On the deployed site: Admin → **Backup & Restore → Restore** → upload the JSON, type `RESTORE`.
3. Re-upload product/category photos in **Media Library** (Restore covers the database; media files transfer by upload, and each media keeps working whether old or new).

### B7. Ongoing ops
- **Updates:** `git push` → auto-deploys (data persists on the disk).
- **Backups:** weekly Admin → Backup download + Render dashboard → disk snapshot (Add-on available) / or `render.com` disk export.
- **Logs:** Render dashboard → Logs tab (server errors print here).
- **Spindown:** the Starter plan stays always-on; free plans can't have disks anyway, so stay on Starter+.
- **Scale storage:** dashboard → Disks → resize (photos are auto-optimized to WebP/AVIF, so 1 GB holds thousands of products).

---

## C. Deploy on Railway (alternative, same idea)

1. `npm i -g @railway/cli && railway login` *(or use the GitHub-connected dashboard)*
2. `railway init` → **Deploy from GitHub repo** (or `railway up`).
3. Add a **Volume**: service → Settings → Volumes → Mount Path `/var/data`.
4. Variables: `DATA_DIR=/var/data`, `SECURE_COOKIES=1`, `SESSION_SECRET=<random>`, `NODE_VERSION=20`.
5. Set **Healthcheck** `/healthz` (optional) and generate a public domain → add `morahome.in` as custom domain → HTTPS is automatic.
Railway’s Hobby plan (~$5/mo) includes volumes; the persistent process runs unchanged.

---

## D. Troubleshooting

| Symptom | Fix |
|---|---|
| Setup wizard keeps re-appearing | The data dir isn’t persistent — confirm the disk/volume is mounted at `/var/data` and `DATA_DIR=/var/data` is set. |
| 502 after deploy | Check logs for the build; ensure Start Command is `node src/server.js` and health check succeeded. |
| `sharp` build error on old Node | `NODE_VERSION=20` is set (see `render.yaml` / `.node-version`). |
| Cookies not persisting (logged out often) | You’re not on HTTPS — add the custom domain and wait for the cert; `SECURE_COOKIES=1` needs HTTPS. |
| Images return 404 after redeploy without disk | uploads lived in the container, not the disk → attach disk to `/var/data`. |

**Why not Netlify (recap):** Netlify = static + serverless; an Express server with SQLite + on-disk uploads loses its database and media on every function cold start. The workable Netlify variant requires moving the DB to hosted Postgres and uploads to S3/Cloudinary (a real migration) — Render/Railway run this exact codebase with zero changes and a persistent disk, so they are the correct home for it.
