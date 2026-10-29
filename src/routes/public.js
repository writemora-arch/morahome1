/** MORA HOME — public routes (SSR pages + public API). */
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const settings = require('../settings');
const auth = require('../lib/auth');
const { layout } = require('../views/layout');
const { withDefaults } = require('../theme');
const { homeBody } = require('../views/home');
const { productsBody } = require('../views/products');
const { productBody } = require('../views/product');
const { aboutBody, contactBody, legalBody } = require('../views/pages');
const { specSheetHtml } = require('../views/specsheet');
const { specPdf, cataloguePdf, mergeCover, selectedCataloguePdf } = require('../lib/pdf');
const { absFromRel } = require('../lib/media');
const ratelimit = require('../lib/ratelimit');

const router = express.Router();

function ctx(mode = 'live') {
  return {
    theme: withDefaults(settings.get('theme', mode)),
    brand: settings.get('brand', mode),
    contact: settings.get('contact', mode),
    footer: settings.get('footer', mode),
    seo: settings.get('seo', mode),
    nav: settings.get('nav', mode),
  };
}
const modeFor = (req) => (req.query.preview === '1' && auth.isAdmin(req) ? 'draft' : 'live');

/* ---------- SEO helpers: base URL, canonical, sitemap, robots ---------- */
// Set SITE_URL on Render (e.g. https://morahome.in) to force the primary domain.
// If not set, the address the visitor/Google used is detected automatically.
function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  return `${proto}://${req.get('host')}`;
}
const canon = (req, p) => siteUrl(req) + p;
const xmlEsc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const isoDate = (d) => { const t = new Date(String(d || '').replace(' ', 'T') + 'Z'); return isNaN(t) ? null : t.toISOString().slice(0, 10); };


/* ---------- brand icons for Google (square, multiples of 48px) ---------- */
const ICON_DIR = path.join(__dirname, '..', '..', 'assets', 'brand');
const ICONS = {
  '/favicon.ico': 'favicon.ico', '/favicon-48.png': 'favicon-48.png', '/favicon-96.png': 'favicon-96.png',
  '/favicon-192.png': 'favicon-192.png', '/apple-touch-icon.png': 'apple-touch-icon.png', '/logo-512.png': 'logo-512-square.png',
  '/og-banner.png': 'og-banner.png',
};
Object.entries(ICONS).forEach(([url, file]) => {
  router.get(url, (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=604800');
    res.sendFile(path.join(ICON_DIR, file));
  });
});

/* PWA manifest (audit M9) — theme colours follow the live theme */
router.get('/manifest.json', (req, res) => {
  const theme = withDefaults(settings.get('theme', 'live'));
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.json({
    name: 'MORA HOME — Wholesale Metal & Wooden Homeware',
    short_name: 'MORA HOME',
    description: 'B2B manufacturer & exporter of handcrafted brass, steel and wooden home products from Moradabad, India.',
    start_url: '/',
    scope: '/',
    display: 'minimal-ui',
    theme_color: theme.walnut || '#5C3D2E',
    background_color: theme.bgPrimary || '#FFFDF8',
    icons: [
      { src: '/favicon-48.png', sizes: '48x48', type: 'image/png' },
      { src: '/favicon-96.png', sizes: '96x96', type: 'image/png' },
      { src: '/favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  });
});

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin',
    'Disallow: /api/',
    'Disallow: /*?preview=',
    '',
    `Sitemap: ${siteUrl(req)}/sitemap.xml`,
    '',
  ].join('\n'));
});

router.get('/sitemap.xml', (req, res) => {
  const base = siteUrl(req);
  const urls = [];
  const add = (loc, lastmod, changefreq, priority) => urls.push({ loc: base + loc, lastmod, changefreq, priority });

  const newest = db.get("SELECT MAX(updated_at) AS m FROM products WHERE status = 'published'");
  const homeMod = isoDate(newest && newest.m);
  add('/', homeMod, 'weekly', '1.0');
  add('/products', homeMod, 'daily', '0.9');
  /* NOTE (audit H5): ?cat= filter URLs are intentionally NOT listed — filtering is
     client-side, so they are near-duplicates of /products and would dilute crawl
     budget. Real category landing pages (/products/<slug>) are a future upgrade. */

  const prods = db.all ? db.all("SELECT code, updated_at FROM products WHERE status = 'published' ORDER BY code") : [];
  prods.forEach((p) => add('/products/' + encodeURIComponent(p.code), isoDate(p.updated_at), 'monthly', '0.7'));

  add('/about', null, 'monthly', '0.6');
  add('/contact', null, 'monthly', '0.6');
  add('/catalogue/latest', homeMod, 'monthly', '0.7');
  add('/privacy', null, 'yearly', '0.2');
  add('/terms', null, 'yearly', '0.2');
  add('/shipping', null, 'yearly', '0.2');

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.map((u) => '  <url>\n    <loc>' + xmlEsc(u.loc) + '</loc>\n' +
      (u.lastmod ? '    <lastmod>' + u.lastmod + '</lastmod>\n' : '') +
      '    <changefreq>' + u.changefreq + '</changefreq>\n    <priority>' + u.priority + '</priority>\n  </url>').join('\n') +
    '\n</urlset>\n';
  res.type('application/xml').send(xml);
});

router.get('/', (req, res) => {
  const mode = modeFor(req);
  const c = ctx(mode);
  res.send(layout({
    ...c, seoTitle: c.seo.home_title, seoDesc: c.seo.home_desc,
    bodyHtml: homeBody(mode, c), canonical: canon(req, '/'), page: 'home', preview: mode === 'draft',
  }));
});

router.get('/products', (req, res) => {
  const mode = modeFor(req);
  const c = ctx(mode);
  const cat = String(req.query.cat || '');
  res.send(layout({
    ...c, seoTitle: c.seo.products_title, seoDesc: c.seo.products_desc,
    bodyHtml: productsBody(cat, c),
    /* audit H5: ?cat= variants all render the same server HTML (filtering is
       client-side) → canonical everything to /products to avoid duplicates. */
    canonical: canon(req, '/products'), page: 'products', preview: mode === 'draft',
  }));
});

router.get('/products/:code/spec-sheet', (req, res) => {
  const p = db.get('SELECT * FROM products WHERE code = ?', [req.params.code]);
  if (!p) return res.status(404).send('Product not found');
  res.type('html').send(specSheetHtml(p, ctx('live')));
});

router.get('/products/:code/spec-sheet.pdf', async (req, res) => {
  const p = db.get('SELECT * FROM products WHERE code = ?', [req.params.code]);
  if (!p) return res.status(404).send('Product not found');
  try {
    const buf = await specPdf(p, ctx('live'));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Robots-Tag', 'noindex');
    res.setHeader('Content-Disposition', `${req.query.view ? 'inline' : 'attachment'}; filename="${p.code}-spec-sheet.pdf"`);
    res.send(buf);
  } catch (e) { console.error('[spec-pdf]', e); res.status(500).send('PDF generation failed.'); }
});

/* ---------- structured data for product pages (audit H3) ---------- */
function productLd(p, origin, firstImagePath) {
  let specs = []; try { specs = JSON.parse(p.specs_json || '[]'); } catch { specs = []; }
  const moqNum = parseInt(String(p.moq || '').replace(/\D+/g, ''), 10) || null;
  const weightSpec = specs.find((s) => s && /^weight$/i.test(String(s.k || '').trim()));
  const props = [];
  if (p.material) props.push({ '@type': 'PropertyValue', name: 'Material', value: p.material });
  if (p.size) props.push({ '@type': 'PropertyValue', name: 'Size', value: p.size });
  specs.filter((s) => s && s.k && s.v).forEach((s) => props.push({ '@type': 'PropertyValue', name: String(s.k), value: String(s.v) }));
  const offers = {
    '@type': 'AggregateOffer',
    priceCurrency: 'INR',
    availability: 'https://schema.org/InStock',
    url: origin + '/products/' + encodeURIComponent(p.code),
    offerCount: 1,
  };
  if (moqNum) offers.eligibleQuantity = { '@type': 'QuantitativeValue', minValue: moqNum, unitCode: 'C62' };
  // Real price data when the admin entered one ("₹1,249 / pc" or "₹850–₹1,100").
  const priceNums = (String(p.price || '').match(/\d[\d,]*(?:\.\d+)?/g) || [])
    .slice(0, 2)
    .map((s) => parseFloat(s.replace(/,/g, '')))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (priceNums.length) {
    offers.lowPrice = Math.min(...priceNums);
    offers.highPrice = Math.max(...priceNums);
  }
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product',
    sku: p.code, mpn: p.code,
    name: p.name,
    description: (p.description || p.name).slice(0, 500),
    brand: { '@type': 'Brand', name: 'MORA HOME' },
    manufacturer: { '@type': 'Organization', name: 'MORA HOME' },
    url: origin + '/products/' + encodeURIComponent(p.code),
    offers,
  };
  if (firstImagePath) ld.image = /^https?:/i.test(firstImagePath) ? firstImagePath : origin + firstImagePath;
  if (weightSpec && weightSpec.v) ld.weight = { '@type': 'QuantitativeValue', value: String(weightSpec.v) };
  if (props.length) ld.additionalProperty = props;
  return ld;
}
function breadcrumbLd(p, cat, origin) {
  const items = [
    { name: 'Home', url: origin + '/' },
    { name: 'Products', url: origin + '/products' },
  ];
  if (cat) items.push({ name: cat.name, url: origin + '/products?cat=' + encodeURIComponent(cat.slug) });
  items.push({ name: `${p.code} — ${p.name}` });
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, ...(it.url ? { item: it.url } : {}) })),
  };
}

router.get('/products/:code', (req, res) => {
  const mode = modeFor(req);
  const p = db.get("SELECT * FROM products WHERE code = ? AND status = 'published'", [req.params.code]);
  if (!p) return res.status(404).send(layout({
    ...ctx(mode), seoTitle: 'Not found — MORA HOME', seoDesc: '', page: '', noindex: true,
    bodyHtml: '<section class="section"><div class="container"><h1 class="page-title">Product not found</h1><p><a class="btn btn-outline" href="/products">Back to products</a></p></div></section>',
  }));
  const c = ctx(mode);
  const canonical = canon(req, '/products/' + encodeURIComponent(p.code));
  let origin = ''; try { origin = new URL(canonical).origin; } catch { /* ignore */ }
  const firstImg = db.get('SELECT path FROM product_images WHERE product_id = ? ORDER BY sort ASC LIMIT 1', [p.id]);
  const cat = db.get('SELECT * FROM categories WHERE slug = ?', [p.category_slug]);
  res.send(layout({
    ...c, seoTitle: `${p.code} — ${p.name} · MORA HOME`, seoDesc: (p.description || p.name).slice(0, 160),
    bodyHtml: productBody(p), canonical, page: 'products', ogType: 'product', preview: mode === 'draft',
    ogImage: firstImg ? firstImg.path : '',
    ld: origin ? [productLd(p, origin, firstImg && firstImg.path), breadcrumbLd(p, cat, origin)] : [],
  }));
});

router.get('/about', (req, res) => {
  const mode = modeFor(req); const c = ctx(mode);
  res.send(layout({ ...c, seoTitle: c.seo.about_title, seoDesc: c.seo.about_desc, bodyHtml: aboutBody(mode, c), canonical: canon(req, '/about'), page: 'about', preview: mode === 'draft' }));
});
router.get('/contact', (req, res) => {
  const mode = modeFor(req); const c = ctx(mode);
  res.send(layout({ ...c, seoTitle: c.seo.contact_title, seoDesc: c.seo.contact_desc, bodyHtml: contactBody(mode, c), canonical: canon(req, '/contact'), page: 'contact', preview: mode === 'draft' }));
});

const LEGAL = {
  '/privacy': ['Privacy Policy', [
    'MORA HOME respects your privacy. Information you submit through enquiry forms (name, company, email, phone, requirement) is stored in our internal lead system solely to respond to your wholesale enquiry.',
    'We never sell or share your contact details with third parties. Data is retained until you ask us to delete it by emailing writemora@gmail.com.',
  ], 'How MORA HOME handles the business contact details you submit via enquiry forms, WhatsApp and catalogue requests on morahome.in — and your rights.'],
  '/terms': ['Terms & Conditions', [
    'MORA HOME operates on a business-to-business (B2B) basis. All quotations are wholesale quotations and are valid for 15 days unless stated otherwise.',
    'Minimum order quantities (MOQ) apply per product. Customisation, branding and packaging requests are confirmed in writing before production begins.',
  ], 'Wholesale trading terms for MORA HOME — B2B quotation validity, minimum order quantities, customisation approvals and production timelines.'],
  '/shipping': ['Shipping Policy', [
    'We dispatch pan-India through trusted logistics partners. Orders are packed in export-grade cartons with protective inner packing.',
    'Lead times quoted per product begin after order confirmation and advance payment. Dispatch details and invoice are shared on WhatsApp and email.',
  ], 'Dispatch details for MORA HOME wholesale orders — export-grade packing, per-product lead times, logistics partners and WhatsApp delivery updates.'],
};
Object.entries(LEGAL).forEach(([url, [title, paras, desc]]) => {
  router.get(url, (req, res) => {
    const c = ctx('live');
    res.send(layout({ ...c, seoTitle: `${title} — MORA HOME`, seoDesc: desc, bodyHtml: legalBody(title, paras), canonical: canon(req, url), page: '' }));
  });
});

/* Catalogue (audit H2 + range catalogues): serves the uploaded master PDF when
   present; otherwise auto-generates a branded wholesale catalogue — designed
   cover page (admin-uploadable) merged in front, then one spec page per
   published product. ?cat=<slug> produces a single-range catalogue.
   Cached in memory; rebuilt when products or the cover change. */
const catCache = new Map(); // key → { sig, buf, building }
function catalogueSignature(catSlug) {
  const row = catSlug
    ? db.get("SELECT COUNT(*) c, MAX(updated_at) m FROM products WHERE status = 'published' AND category_slug = ?", [catSlug])
    : db.get("SELECT COUNT(*) c, MAX(updated_at) m FROM products WHERE status = 'published'");
  let coverM = '';
  const cov = settings.get('catalogue_cover', 'live') || {};
  if (cov.path) {
    const abs = absFromRel(cov.path);
    if (fs.existsSync(abs)) coverM = String(fs.statSync(abs).mtimeMs);
  }
  return `${row ? row.c : 0}|${row && row.m ? row.m : ''}|${coverM}`;
}
function coverBuffer() {
  const cov = settings.get('catalogue_cover', 'live') || {};
  if (!cov.path) return null;
  const abs = absFromRel(cov.path);
  if (!fs.existsSync(abs)) return null;
  try { return fs.readFileSync(abs); } catch { return null; }
}
async function buildCatalogue(catSlug) {
  const sig = catalogueSignature(catSlug);
  const key = catSlug || '__all';
  let e = catCache.get(key);
  if (!e || e.sig !== sig || !e.buf) {
    if (!e || !e.building) {
      const promise = (async () => {
        const cover = coverBuffer();
        const body = await cataloguePdf(ctx('live'), { catSlug: catSlug || undefined, includeCover: !cover });
        return cover ? mergeCover(cover, body) : body;
      })();
      e = { sig, buf: (e && e.buf) || null, building: promise };
      catCache.set(key, e);
      promise.then((buf) => { const cur = catCache.get(key); catCache.set(key, { sig, buf, building: null }); })
        .catch((err) => { catCache.set(key, { sig: '', buf: null, building: null }); console.error('[catalogue] generation failed:', err.message); });
    }
    await e.building;
    e = catCache.get(key);
  }
  return e && e.buf ? e.buf : null;
}
router.get('/catalogue/latest', async (req, res) => {
  const cat = settings.get('catalogue', 'live') || {};
  const catSlug = String(req.query.cat || '').trim();
  let catRow = null;
  if (catSlug) {
    catRow = db.get('SELECT * FROM categories WHERE slug = ? AND visible = 1', [catSlug]);
    if (!catRow) return res.status(404).send('Unknown product range.');
    const n = db.get("SELECT COUNT(*) c FROM products WHERE status = 'published' AND category_slug = ?", [catSlug]);
    if (!n || !n.c) return res.status(404).send('No published products in this range yet.');
  }
  if (cat.path && !catSlug) {
    const abs = absFromRel(cat.path);
    if (fs.existsSync(abs)) {
      /* v8.3: always attachment — one tap must SAVE the file (mobile Chrome
         used to open/land on the PDF when served inline). */
      return res.download(abs, 'MORA-HOME-Catalogue.pdf');
    }
  }
  const publishedTotal = db.get("SELECT COUNT(*) c FROM products WHERE status = 'published'");
  if (!catSlug && (!publishedTotal || !publishedTotal.c)) {
    const c = ctx('live');
    return res.send(layout({
      ...c, seoTitle: 'Wholesale Catalogue — MORA HOME', seoDesc: 'Request the MORA HOME wholesale catalogue PDF with current ranges, MOQ and bulk pricing — sent within one working day on WhatsApp or email.',
      page: '', bodyHtml: `<section class="section"><div class="container catalogue-fallback">
        <img class="contact-crest" src="${c.brand.crestPath}" alt="" width="1400" height="1082">
        <h1 class="page-title">Wholesale Catalogue</h1>
        <p class="section-intro">The PDF catalogue is being updated. Request it on WhatsApp or email and we will send the latest edition within one working day.</p>
        <div class="contact-actions">
          <button class="btn btn-whatsapp wa-open" type="button">Chat on WhatsApp</button>
          <a class="btn btn-crimson" href="mailto:${c.contact.email1}?subject=Catalogue%20Request">Request by Email</a>
        </div></div></section>`,
    }));
  }
  try {
    const buf = await buildCatalogue(catSlug || null);
    if (buf) {
      const fname = catRow
        ? `MORA-HOME-${catRow.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-')}-Range-Catalogue.pdf`
        : 'MORA-HOME-Wholesale-Catalogue.pdf';
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      /* v8.3: always attachment (was inline unless ?dl=1 — the root cause of
         "clicking only opens the PDF instead of downloading it"). */
      res.setHeader('Content-Disposition', `attachment; filename="${fname}"`);
      return res.send(buf);
    }
  } catch (e) { console.error('[catalogue] generation failed:', e.message); /* fall through */ }
  const c = ctx('live');
  res.send(layout({
    ...c, seoTitle: 'Wholesale Catalogue — MORA HOME', seoDesc: 'Request the MORA HOME wholesale catalogue PDF with current ranges, MOQ and bulk pricing — sent within one working day on WhatsApp or email.',
    page: '', bodyHtml: `<section class="section"><div class="container catalogue-fallback">
      <img class="contact-crest" src="${c.brand.crestPath}" alt="" width="1400" height="1082">
      <h1 class="page-title">Wholesale Catalogue</h1>
      <p class="section-intro">The PDF catalogue is being updated. Request it on WhatsApp or email and we will send the latest edition within one working day.</p>
      <div class="contact-actions">
        <button class="btn btn-whatsapp wa-open" type="button">Chat on WhatsApp</button>
        <a class="btn btn-crimson" href="mailto:${c.contact.email1}?subject=Catalogue%20Request">Request by Email</a>
      </div></div></section>`,
  }));
});

/* Public product lookup — powers the WhatsApp modal's auto product details */
router.get('/api/product-lookup', (req, res) => {
  const q = require('../render').normCode(req.query.code);
  if (!q || q.length < 2) return res.status(404).json({ error: 'Not found' });
  let p = db.get("SELECT code, name, description, price FROM products WHERE status = 'published' AND REPLACE(REPLACE(UPPER(code), '-', ''), ' ', '') = ?", [q]);
  if (!p) p = db.get("SELECT code, name, description, price FROM products WHERE status = 'published' AND REPLACE(REPLACE(UPPER(code), '-', ''), ' ', '') LIKE ?", ['%' + q]);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.json({ code: p.code, name: p.name, description: String(p.description || '').slice(0, 400), price: p.price || '' });
});

/* v8.3 — custom catalogue PDF containing ONLY the products the visitor selected
   on the Products page (✓ button). Selection travels as product codes; the PDF
   is built on demand with pdfkit (logo + contact header on page 1). */
router.post('/api/selected-catalogue', express.json({ limit: '8kb' }), async (req, res) => {
  const raw = (req.body && Array.isArray(req.body.codes)) ? req.body.codes : [];
  const codes = raw.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim()).slice(0, 60);
  if (!codes.length) return res.status(400).json({ error: 'No products selected — tap ✓ on at least one product.' });
  const ph = codes.map(() => '?').join(',');
  const prods = db.all(`SELECT * FROM products WHERE status = 'published' AND code IN (${ph})`, codes);
  if (!prods.length) return res.status(400).json({ error: 'None of the selected products are published any more — please refresh.' });
  try {
    const buf = await selectedCataloguePdf(ctx('live'), prods);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="MORA-HOME-Selected-Catalogue.pdf"');
    res.send(buf);
  } catch (e) {
    console.error('[selected-catalogue] generation failed:', e.message);
    res.status(500).json({ error: 'Could not build the PDF — please try again.' });
  }
});

/* ---------------- public API ---------------- */
/* Leads endpoint hardened per audit C2: honeypot, server-side validation,
   length caps, type whitelist and per-IP rate limiting. Errors are friendly
   400s — internal exception text never reaches the client (see server.js). */
const LEAD_TYPES = new Set(['enquiry', 'bulk', 'catalogue', 'whatsapp_click']);
const PHONE_RE = /^[\d+\-\s()]{8,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

router.post('/api/leads', express.json({ limit: '32kb' }), (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'Invalid request.' });

  /* honeypot: bots fill every field — silently "accept" and store nothing */
  if (String(b.website || '').trim()) return res.status(201).json({ ok: true, id: 0 });

  const ip = ratelimit.clientIp(req);
  const rl = ratelimit.hit('leads:' + ip, 60 * 60 * 1000, 10); // 10 leads / hour / IP
  if (!rl.allowed) {
    return res.status(429).json({ error: 'Too many enquiries from your connection. Please try again later or message us on WhatsApp.' });
  }

  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const type = LEAD_TYPES.has(b.type) ? b.type : 'enquiry';
  const name = s(b.name, 120);
  const company = s(b.company, 160);
  const email = s(b.email, 160);
  const phone = s(b.phone, 32);
  const city = s(b.city, 120);
  const message = s(b.message, 4000);
  const source = s(b.source, 60) || 'website';

  if (!name) return res.status(400).json({ error: 'Please tell us your name.' });
  const phoneOk = PHONE_RE.test(phone);
  const emailOk = EMAIL_RE.test(email);
  if (!phoneOk && !emailOk) {
    return res.status(400).json({ error: 'Please provide a valid phone number (8–15 digits) or an email address.' });
  }
  if (phone && !phoneOk) return res.status(400).json({ error: 'That phone number does not look right — please use 8 to 15 digits.' });
  if (email && !emailOk) return res.status(400).json({ error: 'That email address does not look right.' });

  let items = [];
  if (Array.isArray(b.items)) items = b.items.slice(0, 200).map((i) => s(i, 40)).filter(Boolean);

  const info = db.run(`INSERT INTO leads (type,name,company,email,phone,city,message,items_json,source,status) VALUES (?,?,?,?,?,?,?,?,?,'New')`,
    [type, name, company, email, phone, city, message, JSON.stringify(items), source]);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.post('/api/track/whatsapp', express.json({ limit: '8kb' }), (req, res) => {
  const b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return res.status(400).json({ error: 'Invalid request.' });
  if (String(b.website || '').trim()) return res.status(201).json({ ok: true, id: 0 }); // honeypot
  const ip = ratelimit.clientIp(req);
  const rl = ratelimit.hit('wa:' + ip, 60 * 60 * 1000, 30); // 30 clicks / hour / IP
  if (!rl.allowed) return res.status(201).json({ ok: true, id: 0 }); // never block the buyer's chat — just stop tracking
  const s = (v, n) => String(v == null ? '' : v).trim().slice(0, n);
  const info = db.run(`INSERT INTO leads (type,name,company,message,source,status) VALUES ('whatsapp_click',?,?,?,?,'New')`,
    [s(b.name, 120) || 'WhatsApp visitor', s(b.company, 160), b.product ? `Opened WhatsApp chat about: ${s(b.product, 160)}` : 'Opened WhatsApp chat from website', 'website']);
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

module.exports = router;
