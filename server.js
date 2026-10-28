/**
 * MORA HOME — B2B website + no-code Admin CMS.
 * Zero-config boot: opens (or creates) the SQLite database, seeds demo content
 * on first run, serves the public site and the Admin Control Center.
 */
const express = require('express');
const path = require('path');
const db = require('./src/db');
const { seed } = require('./src/seed');
const { migrate } = require('./src/migrate');

const app = express();
app.disable('x-powered-by');

/* ───────────────────────── security headers (audit M3) ─────────────────────────
   Set in code (not only at the CDN) so every environment gets them.
   Notes:
   - No inline <script> anywhere: window config is a JSON island, the spec-sheet
     print button lives in /js/print.js, and admin modals use event listeners.
   - Inline <style>/style="" attributes are still allowed ('unsafe-inline' in
     style-src) because the theme CSS variables and focal-point positions are
     rendered as inline styles.                                          */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src * data: blob:",
  "connect-src 'self'",
  "frame-src https://www.google.com https://maps.google.com",
  "frame-ancestors 'self'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN'); // legacy fallback for CSP frame-ancestors
  res.setHeader('Content-Security-Policy', CSP);
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  if (proto === 'https' || req.secure) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

/* ───────────── URL normalisation: trailing slash + case (audit L1) ─────────────
   /products/ → /products, /PRODUCTS → /products (301). Product-code URLs keep
   their case (MH-2017); only the fixed page list is lowercased.                */
const FIXED_PAGES = new Set([
  '/products', '/about', '/contact', '/privacy', '/terms', '/shipping',
  '/catalogue/latest', '/admin', '/admin/login', '/admin/logout',
  '/sitemap.xml', '/robots.txt', '/manifest.json',
]);
app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  const qi = req.url.indexOf('?');
  const p = qi === -1 ? req.url : req.url.slice(0, qi);
  const search = qi === -1 ? '' : req.url.slice(qi);
  let target = p;
  if (target.length > 1 && target.endsWith('/')) target = target.replace(/\/+$/, '') || '/';
  if (FIXED_PAGES.has(target.toLowerCase())) target = target.toLowerCase();
  if (target !== p) return res.redirect(301, target + search);
  next();
});

/* static: uploaded media + front-end assets (long cache — CSS/JS URLs are
   content-hash versioned via src/lib/assets.js, upload filenames are unique) */
app.use('/uploads', express.static(db.paths.UPLOAD_DIR, { maxAge: '30d', immutable: true }));
app.use('/css', express.static(path.join(__dirname, 'public', 'css'), { maxAge: '30d' }));
app.use('/js', express.static(path.join(__dirname, 'public', 'js'), { maxAge: '30d' }));

/* routes */
app.use(require('./src/routes/admin'));   // /admin + /api/admin (auth-protected)
app.use(require('./src/routes/public')); // public site + public API

/* 404 — helpful, branded, noindex (audit L3) */
app.use((req, res) => {
  let cats = [];
  try { cats = db.all('SELECT slug, name FROM categories WHERE visible = 1 ORDER BY sort ASC LIMIT 6'); } catch { /* db not ready */ }
  res.status(404).type('html').send(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex, follow">
  <title>Page not found — MORA HOME</title>
  <link rel="stylesheet" href="/css/site.css"></head><body style="font-family:sans-serif">
  <section class="section"><div class="container" style="text-align:center;max-width:640px">
  <p class="overline">ERROR 404</p>
  <h1 class="page-title">Page not found</h1>
  <p>The page you requested does not exist. Try searching for a product code (e.g. “MH-2017”), browsing the catalogue, or contacting us directly.</p>
  <form role="search" action="/products" method="get" style="display:flex;gap:8px;justify-content:center;margin:18px 0">
    <input name="q" type="search" placeholder="Search products or MH codes…" aria-label="Search products" style="padding:10px 14px;border:1px solid #E5DEC9;border-radius:999px;min-width:240px">
    <button class="btn btn-crimson" type="submit">Search</button>
  </form>
  ${cats.length ? `<p style="font-size:14px">Popular categories: ${cats.map((c) => `<a href="/products?cat=${encodeURIComponent(c.slug)}">${c.name.replace(/</g, '&lt;')}</a>`).join(' · ')}</p>` : ''}
  <p style="margin-top:14px"><a class="btn btn-crimson" href="/">Back to Home</a> <a class="btn btn-outline" href="/contact" style="margin-left:8px">Contact Us</a></p>
  </div></section></body></html>`);
});

/* error safety net — respects error status codes and never leaks internals (audit C2) */
app.use((err, req, res, next) => {
  const status = Number(err.status || err.statusCode) || 500;
  if (status >= 500) {
    console.error('[server]', err);
    return res.status(500).json({ error: 'Server error. Please try again.' });
  }
  let message = err.message || 'Bad request.';
  if (err.type === 'entity.parse.failed') message = 'Invalid request body.';
  else if (err.type === 'entity.too.large') message = 'Request payload too large.';
  res.status(status).json({ error: message });
});

const PORT = process.env.PORT || 3000;

(async () => {
  await db.open();
  await seed(false);           // first-run automatic seed (skips when data exists)
  migrate();                   // idempotent content fixes for existing databases
  app.listen(PORT, () => {
    console.log('──────────────────────────────────────────────────');
    console.log('  MORA HOME — B2B website + Admin CMS is running');
    console.log(`  Website :  http://localhost:${PORT}/`);
    console.log(`  Admin   :  http://localhost:${PORT}/admin`);
    console.log('  ⚠ First login? Change the default password immediately');
    console.log('    in Admin → Settings (default credentials are no longer');
    console.log('    shown on the login page).');
    console.log('──────────────────────────────────────────────────');
  });
})().catch((e) => { console.error('Fatal boot error:', e); process.exit(1); });

process.on('SIGINT', () => { db.persist(true); process.exit(0); });
process.on('SIGTERM', () => { db.persist(true); process.exit(0); });
