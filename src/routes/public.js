// Public routes: HTML pages (server-rendered from DB), public JSON APIs, lead capture
const express = require('express');
const path = require('path');
const fs = require('fs');
const { db, now, getSetting, DATA_DIR } = require('../db');
const R = require('../render');
const M = require('../media');
const { esc, escAttr: eA, inr, codeKey, nameMatches, phoneHref, fmtPhone, waHref, clampInt } = require('../util');
const { queueLeadEmails } = require('../email');
const { rateLimit, ipOf } = require('../auth');
const { buildSpecPdf } = require('../pdf');

const router = express.Router();

/* ---------- redirects + maintenance ---------- */
router.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const r = db.prepare('SELECT to_path, code FROM redirects WHERE from_path=? AND enabled=1').get(req.path);
  if (r) return res.redirect(r.code === 302 ? 302 : 301, r.to_path);
  next();
});
router.use((req, res, next) => {
  if (req.path.startsWith('/admin') || req.path.startsWith('/api') || req.path.startsWith('/media') || req.path.startsWith('/css') || req.path.startsWith('/js') || req.path.startsWith('/docs')) return next();
  const { sitec } = R.siteData();
  if (sitec.maintenance && !req.user) {
    const d = R.siteData();
    return res.status(503).send(R.layout(req, {
      title: 'We’ll be right back — MORA HOME', path: req.path,
      body: `<section class="sec hero-med"><div class="sec-in empty-state">
        <h1>We are polishing a few things.</h1>
        <p>MORA HOME is under scheduled maintenance. For urgent orders, write to <a href="mailto:${eA(d.business.emailPrimary)}">${eA(d.business.emailPrimary)}</a>.</p></div></section>`,
      robots: false
    }));
  }
  next();
});

/* ---------- theme.css (dynamic CSS variables + custom CSS) ---------- */
router.get('/api/public/theme.css', (req, res) => {
  const b = getSetting('brand', {});
  const c = b.colors || {};
  const custom = getSetting('advanced', {}).customCss || '';
  const fontStack = (f, serif) => `'${f}', ${f === 'Cormorant Garamond' ? 'Georgia' : 'Georgia'}, ${serif ? 'serif' : "system-ui, -apple-system, 'Segoe UI', sans-serif"}`;
  const css = `:root{
  --c-cream:${c.cream || '#FFFDF8'};--c-soft:${c.creamSoft || '#FBF9F4'};--c-white:${c.white || '#FFFFFF'};
  --c-walnut:${c.walnut || '#5C3D2E'};--c-walnutd:${c.walnutDark || '#3B2417'};--c-walnutl:${c.walnutLight || '#8A6A52'};
  --c-border:${c.border || '#D9CBBB'};--c-red:${c.red || '#8B0000'};--c-char:${c.charcoal || '#1A1A1A'};
  --c-grey:${c.grey || '#6B6B6B'};--c-ok:${c.success || '#3F6B4A'};
  --radius:${b.radius || '10px'};
  --f-head:${fontStack(b.headingFont || 'Cormorant Garamond', true)};
  --f-body:${fontStack(b.bodyFont || 'DM Sans', false)};
}\n${custom}`;
  res.set('Content-Type', 'text/css; charset=utf-8');
  res.set('Cache-Control', 'no-cache');
  res.send(css);
});

/* ---------- public product APIs ---------- */
function cardJson(p) {
  const media = p.media_id ? M.mediaUrls(db.prepare('SELECT * FROM media_assets WHERE id=?').get(p.media_id)) : null;
  return {
    id: p.id, code: p.code, name: p.name, slug: p.slug, category: p.category_name || '', categorySlug: p.category_slug || '',
    badge: p.badge || '', material: p.material, finish: p.finish, dimensions: p.dimensions,
    moq: p.moq, leadTime: p.lead_time, gst: p.gst,
    priceMode: p.price_mode, basePrice: p.base_price, showPrice: !!p.show_price,
    url: `/products/${p.slug}`, image: media ? { src: media.src, srcset: media.srcsetWebp, srcsetAvif: media.srcsetAvif, alt: p.name, w: media.width, h: media.height, blur: media.blur } : null
  };
}
const PRODUCT_BASE = `SELECT p.*, c.name category_name, c.slug category_slug,
  (SELECT pi.media_id FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) media_id
  FROM products p LEFT JOIN categories c ON c.id=p.category_id`;

function queryProducts(qs) {
  const where = ["p.status='published'", 'p.deleted_at IS NULL'];
  const args = [];
  if (qs.category && qs.category !== 'all') { where.push('c.slug=?'); args.push(String(qs.category)); }
  const like = (col, v) => { if (v) { where.push(`COALESCE(p.${col},'') LIKE ?`); args.push(`%${v}%`); } };
  like('material', qs.material); like('ideal_for', qs.ideal_for); like('order_type', qs.order_type); like('finish', qs.finish);
  let rows = db.prepare(`${PRODUCT_BASE} WHERE ${where.join(' AND ')}`).all(...args);
  // search: code-normalised + fuzzy name
  if (qs.q) {
    const q = String(qs.q);
    const ck = codeKey(q);
    rows = rows.filter(r => (ck && codeKey(r.code) === ck) || nameMatches(r.name, q) || (r.tagline || '').toLowerCase().includes(q.toLowerCase()));
    db.prepare('INSERT INTO search_log(query,results,ip,created_at) VALUES(?,?,?,?)').run(q.slice(0, 120), rows.length, req_ip, now());
  }
  return rows;
}
let req_ip = ''; // per-request ip for search logging

const SORTS = {
  newest: (a, b) => (b.published_at || 0) - (a.published_at || 0),
  name: (a, b) => a.name.localeCompare(b.name),
  code: (a, b) => a.code.localeCompare(b.code)
};
router.get('/api/public/products', (req, res) => {
  req_ip = ipOf(req);
  let rows = queryProducts(req.query);
  const sort = SORTS[req.query.sort] || SORTS.newest;
  rows = rows.slice().sort(sort);
  const page = clampInt(req.query.page, 1, 999, 1);
  const per = 24;
  const total = rows.length;
  const out = rows.slice((page - 1) * per, page * per).map(cardJson);
  res.json({ ok: true, total, page, pages: Math.max(1, Math.ceil(total / per)), products: out });
});
router.get('/api/public/products/by-codes', (req, res) => {
  const codes = String(req.query.codes || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 50);
  if (!codes.length) return res.json({ ok: true, products: [] });
  const keys = codes.map(codeKey);
  const rows = db.prepare(`${PRODUCT_BASE} WHERE p.deleted_at IS NULL`).all()
    .filter(r => keys.includes(codeKey(r.code)));
  res.json({ ok: true, products: rows.map(cardJson) });
});
router.get('/api/public/filters', (req, res) => {
  const lists = db.prepare(`SELECT l.key, l.name, v.value, v.id FROM attribute_lists l JOIN attribute_values v ON v.list_id=l.id AND v.enabled=1 WHERE l.enabled=1 ORDER BY l.sort, v.sort`).all();
  const cats = db.prepare('SELECT name, slug, (SELECT COUNT(*) FROM products p WHERE p.category_id=categories.id AND p.status=\'published\' AND p.deleted_at IS NULL) c FROM categories WHERE active=1 AND deleted_at IS NULL ORDER BY sort').all();
  const counts = {};
  const colMap = { material: 'material', ideal_for: 'ideal_for', order_type: 'order_type', finish: 'finish' };
  const all = db.prepare("SELECT material, ideal_for, order_type, finish FROM products WHERE status='published' AND deleted_at IS NULL").all();
  for (const l of lists) {
    const col = colMap[l.key];
    counts[l.key + ':' + l.value] = col ? all.filter(r => (r[col] || '').includes(l.value)).length : 0;
  }
  res.json({ ok: true, lists, counts, categories: cats });
});

/* ---------- lead capture ---------- */
const leadLimiter = rateLimit(r => 'lead:' + ipOf(r), 20, 60e3);
function saveLead(req, type, fields, items = []) {
  const f = fields;
  if (!f.name || !String(f.name).trim()) return { ok: false, error: 'Please tell us your name.' };
  if (type !== 'whatsapp' && (!f.phone || String(f.phone).replace(/\D/g, '').length < 8)) return { ok: false, error: 'A valid phone number is required.' };
  const device = /Mobi|Android/i.test(req.headers['user-agent'] || '') ? 'mobile' : 'desktop';
  const utm = {}; ['utm_source', 'utm_medium', 'utm_campaign'].forEach(k => { if (req.query[k] || f[k]) utm[k] = req.query[k] || f[k]; });
  const r = db.prepare(`INSERT INTO leads(type,name,phone,email,business,city,product_code,product_name,quantity,message,source_page,utm,device,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    type, String(f.name).trim().slice(0, 80), String(f.phone).trim().slice(0, 24),
    String(f.email || '').trim().slice(0, 120), String(f.business || '').trim().slice(0, 120), String(f.city || '').trim().slice(0, 60),
    String(f.product_code || '').slice(0, 30), String(f.product_name || '').slice(0, 160),
    f.quantity ? clampInt(f.quantity, 1, 999999, 1) : null,
    String(f.message || '').slice(0, 2000), String(f.source_page || req.get('referer') || '').slice(0, 200), JSON.stringify(utm), device, now());
  const leadId = r.lastInsertRowid;
  const insItem = db.prepare('INSERT INTO lead_items(lead_id,product_code,product_name,quantity) VALUES(?,?,?,?)');
  for (const it of items.slice(0, 100)) insItem.run(leadId, String(it.code || '').slice(0, 30), String(it.name || '').slice(0, 160), clampInt(it.qty || it.quantity, 1, 999999, 1));
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(leadId);
  try { queueLeadEmails(lead); } catch (e) { console.warn('[email]', e.message); }
  return { ok: true, id: leadId };
}
router.post('/api/forms/whatsapp-click', leadLimiter, (req, res) => {
  const b = req.body || {};
  const r = db.prepare('INSERT INTO whatsapp_clicks(name,business,product_code,source_page,created_at) VALUES(?,?,?,?,?)')
    .run(String(b.name || '').slice(0, 80), String(b.business || '').slice(0, 120), String(b.product_code || '').slice(0, 30), String(b.source_page || '').slice(0, 200), now());
  const lead = saveLead(req, 'whatsapp', { name: b.name || 'WhatsApp visitor', phone: b.phone || '', business: b.business, product_code: b.product_code, product_name: b.product_name, message: 'Started WhatsApp chat', source_page: b.source_page });
  if (lead.ok) db.prepare('UPDATE whatsapp_clicks SET lead_id=? WHERE id=?').run(lead.id, r.lastInsertRowid);
  res.json({ ok: true });
});

router.post('/api/forms/:type', leadLimiter, (req, res) => {
  const type = ['enquiry', 'contact', 'catalogue', 'sample', 'enquiry-list'].includes(req.params.type) ? req.params.type : 'enquiry';
  const b = req.body || {};
  const items = type === 'enquiry-list' && Array.isArray(b.items) ? b.items : [];
  const out = saveLead(req, type, b, items);
  if (!out.ok) return res.status(422).json(out);
  res.json({ ok: true, id: out.id, message: getSetting('forms', {}).successMessage || 'Thank you! Our B2B team will contact you within one business day.' });
});
/* ---------- HTML pages ---------- */
router.get('/', (req, res) => {
  const { body, ld } = R.renderHome();
  res.send(R.layout(req, { path: '/', body, jsonLd: ld }));
});

router.get('/products', (req, res) => {
  const d = R.siteData();
  const ld = [{ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [
    { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://morahome.in/' },
    { '@type': 'ListItem', position: 2, name: 'Products', item: 'https://morahome.in/products' }] }];
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${R.icon('chev', 12)}<span>Products</span></nav>`;
  const body = `
  <section class="sec" style="--sec-bg:${eA(d.brand.colors?.creamSoft || '#FBF9F4')};--sec-pad:clamp(2rem,4vw,3rem);--sec-max:1240px">
    <div class="sec-in">
      ${crumbs}
      <header class="sec-head"><p class="kicker">Wholesale &amp; Gifting Catalogue</p><h1>Products</h1></header>
      <div class="plist-tools">
        <form class="plist-search" role="search" id="plist-search">
          <input name="q" type="search" placeholder="Search name or code — MH-2001, 2001…" aria-label="Search products" value="${eA(req.query.q || '')}">
          <button class="btn btn-primary" type="submit">${R.icon('search', 17)} Search</button>
        </form>
        <div class="plist-sort"><label for="sort">Sort</label>
          <select id="sort"><option value="newest">Newest</option><option value="name">Name A–Z</option><option value="code">Product Code</option></select>
        </div>
      </div>
      <div id="cat-tabs" class="cat-tabs" role="tablist"></div>
      <div class="plist-layout">
        <aside class="filters" id="filters" aria-label="Filters">
          <div class="filters-head"><h2>Filters</h2><button class="txt-link" id="filters-clear" type="button">Clear all</button></div>
          <div id="filter-groups"></div>
        </aside>
        <div class="plist-main">
          <div class="plist-bar"><span id="plist-count" aria-live="polite"></span>
            <div><a class="btn btn-small btn-ghost" href="/compare" id="compare-open" hidden>Compare <span class="pill" data-cmp-count>0</span></a>
            <button class="btn btn-small btn-primary" data-add-open-list>${R.icon('list', 15)} Enquiry List <span class="pill" data-list-count hidden>0</span></button></div>
          </div>
          <div class="pgrid" id="product-grid" aria-live="polite"></div>
          <div class="plist-more" id="plist-more" hidden><button class="btn btn-outline">Load more</button></div>
          <div class="empty-state" id="plist-empty" hidden>
            <h2>No products match your search</h2>
            <p>Try a different spelling, a shorter term, or the product code (e.g. <b>MH-1001</b>).</p>
            <p>Looking for something specific? <a class="txt-link" href="/contact">Send us an enquiry</a> — we likely make it.</p>
          </div>
        </div>
      </div>
    </div>
  </section>`;
  res.send(R.layout(req, { title: 'Products — MORA HOME', description: 'Browse the MORA HOME wholesale catalogue: handcrafted serveware, kitchenware, home décor and barware in steel, iron, brass, wood and aluminium from Moradabad.', path: '/products', body, jsonLd: ld }));
});

function specRows(p) {
  return [
    ['Material', p.material], ['Grade', p.grade], ['Finish', p.finish], ['Thickness', p.thickness],
    ['Dimensions', p.dimensions], ['Weight', p.weight], ['Packaging', p.packaging],
    ['Food Safe', p.food_safe ? 'Yes' : ''], ['Ideal For', p.ideal_for], ['Gifting', p.gifting],
    ['Order Type', p.order_type], ['Lead Time', p.lead_time]
  ].filter(r => r[1]);
}
router.get('/products/:slug', (req, res, next) => {
  const p = db.prepare(`${PRODUCT_BASE} WHERE p.slug=? AND p.deleted_at IS NULL AND (p.status='published' OR ? IS NOT NULL)`).get(req.params.slug, req.user ? 1 : null);
  if (!p) return next();
  db.prepare('INSERT INTO product_views(product_id,slug,created_at) VALUES(?,?,?)').run(p.id, p.slug, now());
  const imgs = db.prepare('SELECT pi.*, m.id mid FROM product_images pi JOIN media_assets m ON m.id=pi.media_id WHERE pi.product_id=? ORDER BY pi.sort').all(p.id);
  const tiers = db.prepare('SELECT qty,price FROM product_tiers WHERE product_id=? ORDER BY qty').all(p.id);
  const related = db.prepare(`${PRODUCT_BASE} WHERE p.category_id=? AND p.id<>? AND p.status='published' AND p.deleted_at IS NULL LIMIT 4`).all(p.category_id || 0, p.id);
  const d = R.siteData();

  const gal = imgs.length ? imgs.map((im, i) => {
    const m = db.prepare('SELECT * FROM media_assets WHERE id=?').get(im.mid);
    const mu = M.mediaUrls(m);
    return `<button class="gal-thumb ${i === 0 ? 'is-on' : ''}" data-full="${eA(mu.src)}" data-alt="${eA(im.alt || p.name)}">${R.pic(mu, { sizes: '90px', alt: im.alt || p.name })}</button>`;
  }).join('') : '';
  const mainImg = imgs.length ? M.mediaUrls(db.prepare('SELECT * FROM media_assets WHERE id=?').get(imgs[0].mid)) : null;

  const priceBlock = () => {
    if (!p.show_price) return `<div class="price"><b>Price on Request</b><span>Share your quantity for today’s wholesale rate</span></div>`;
    if (p.price_mode === 'tiers' && tiers.length) {
      return `<div class="price"><table class="tiers"><caption>${eA(d.commerce.pricingLabel || 'Wholesale Pricing')}</caption>
        ${tiers.map(t => `<tr><td>${t.qty}+ pcs</td><td>${inr(t.price)} / pc</td></tr>`).join('')}</table>
        ${p.gst ? `<span class="gst-note">GST ${eA(p.gst)} ${p.gst_included ? 'included' : 'extra as applicable'}</span>` : ''}</div>`;
    }
    if (p.base_price > 0) return `<div class="price"><b>${inr(p.base_price)}</b><span>per piece · wholesale${p.gst ? ` · GST ${eA(p.gst)} ${p.gst_included ? 'included' : 'extra'}` : ''}</span></div>`;
    return `<div class="price"><b>Price on Request</b><span>Share your quantity for today’s wholesale rate</span></div>`;
  };
  const specs = specRows(p).map(r => `<tr><th scope="row">${eA(r[0])}</th><td>${eA(r[1])}</td></tr>`).join('');
  const crumbs = `<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a>${R.icon('chev', 12)}<a href="/products">Products</a>${R.icon('chev', 12)}${p.category_name ? `<a href="/products?category=${eA(p.category_slug)}">${eA(p.category_name)}</a>${R.icon('chev', 12)}` : ''}<span>${eA(p.name)}</span></nav>`;

  const body = `
  <section class="sec" style="--sec-bg:${eA(d.brand.colors?.cream || '#FFFDF8')};--sec-pad:clamp(1.5rem,4vw,3rem);--sec-max:1240px">
    <div class="sec-in">
      ${crumbs}
      <div class="pd">
        <div class="pd-media">
          <div class="gal-main" id="gal-main" tabindex="0" role="button" aria-label="Open image viewer">
            ${mainImg ? R.pic(mainImg, { sizes: '(min-width:900px) 46vw, 100vw', cls: 'gal-img', eager: true, alt: p.name }) : R.ph('Product photo not uploaded', 'Admin → Products → ' + p.code)}
            <span class="gal-zoom">${R.icon('zoom', 18)} Click to zoom</span>
          </div>
          ${gal ? `<div class="gal-thumbs">${gal}</div>` : ''}
        </div>
        <div class="pd-info">
          ${p.badge ? `<span class="pcard-badge">${eA(p.badge)}</span>` : ''}
          ${p.category_name ? `<span class="pcard-cat">${eA(p.category_name)}</span>` : ''}
          <h1>${eA(p.name)}</h1>
          <p class="pd-code">Code <b>${eA(p.code)}</b>${p.moq ? ` · MOQ <b>${p.moq} pcs</b>` : ''}</p>
          ${p.tagline ? `<p class="pd-tag">${eA(p.tagline)}</p>` : ''}
          ${priceBlock()}
          <div class="pd-actions">
            <a class="btn btn-primary" href="#pd-enquiry">Send Enquiry</a>
            <button class="btn btn-wa" data-wa-open data-wa-context="product" data-code="${eA(p.code)}" data-product="${eA(p.name)}">${R.icon('whatsapp', 19)} WhatsApp</button>
            <button class="btn btn-outline" data-add-list data-code="${eA(p.code)}" data-name="${eA(p.name)}">${R.icon('list', 16)} Enquiry List</button>
          </div>
          <div class="pd-subacts">
            <a class="txt-link" href="#pd-enquiry" data-sample-link>${R.icon('gift', 15)} Request Sample</a>
            <label class="cmp"><input type="checkbox" data-compare data-code="${eA(p.code)}"> Compare</label>
            <a class="txt-link" href="/products/${eA(p.slug)}/spec.pdf" target="_blank" rel="noopener">${R.icon('download', 15)} Spec Sheet (PDF)</a>
            <button class="txt-link" data-share>${R.icon('share', 15)} Share</button>
          </div>
          ${p.description ? `<div class="pd-desc">${p.description.split(/\n+/).map(x => `<p>${eA(x)}</p>`).join('')}</div>` : ''}
        </div>
      </div>
      <div class="pd-grid2">
        ${specs ? `<table class="specs"><caption>Specifications</caption>${specs}</table>` : ''}
        ${(p.material_notes || p.care) ? `<div class="care card"><h2>Material &amp; Care</h2>${p.material_notes ? `<p>${eA(p.material_notes)}</p>` : ''}${p.care ? `<p><b>Care:</b> ${eA(p.care)}</p>` : ''}</div>` : ''}
      </div>
      <div class="pd-enquiry card" id="pd-enquiry">
        <h2>Enquire about ${eA(p.code)}</h2>
        <form class="form" data-lead-form="enquiry" data-source="product:${eA(p.code)}" novalidate>
          <input type="hidden" name="product_code" value="${eA(p.code)}"><input type="hidden" name="product_name" value="${eA(p.name)}">
          <div class="form-row">${(getSetting('forms', {}).enquiry || []).filter(f => f.visible !== false).map(f => R.formField(f)).join('')}</div>
          <button class="btn btn-primary" type="submit">Submit Enquiry</button>
          <div class="form-msg" role="status" aria-live="polite"></div>
        </form>
      </div>
      ${related.length ? `<div class="pd-related"><h2>Related Products</h2><div class="pgrid">${related.map(R.productCard).join('')}</div></div>` : ''}
      ${d.sitec.recentlyViewed !== false ? `<div class="pd-recent" id="recent-block" hidden><h2>Recently Viewed</h2><div class="pgrid" id="recent-grid"></div></div>` : ''}
    </div>
  </section>
  <div class="lightbox" id="lightbox" hidden role="dialog" aria-modal="true" aria-label="Image viewer">
    <button class="lb-close" aria-label="Close">${R.icon('close', 24)}</button>
    <figure><img id="lb-img" alt="${eA(p.name)}"><figcaption id="lb-cap"></figcaption></figure>
  </div>`;
  const ld = [{ '@context': 'https://schema.org', '@type': 'Product', name: p.name, sku: p.code, description: p.tagline || p.description || '', brand: { '@type': 'Brand', name: 'MORA HOME' }, category: p.category_name || undefined }];
  res.send(R.layout(req, {
    title: p.seo && JSON.parse(p.seo || '{}').title ? JSON.parse(p.seo).title : `${p.name} (${p.code}) — MORA HOME`,
    description: p.seo && JSON.parse(p.seo || '{}').description ? JSON.parse(p.seo).description : (p.tagline || `${p.name} — handcrafted in Moradabad. Wholesale MOQ ${p.moq || 'on request'}.`), 
    path: '/products', body, jsonLd: ld
  }));
});
router.get('/products/:slug/spec.pdf', async (req, res, next) => {
  const p = db.prepare(`${PRODUCT_BASE} WHERE p.slug=? AND p.deleted_at IS NULL`).get(req.params.slug);
  if (!p) return next();
  try { await buildSpecPdf(res, p); } catch (e) { console.error(e); res.status(500).send('PDF generation failed'); }
});

router.get('/catalogue/latest', (req, res) => {
  const c = db.prepare('SELECT * FROM catalogue_files WHERE active=1 ORDER BY id DESC LIMIT 1').get();
  if (!c) {
    return res.status(404).send(R.layout(req, {
      title: 'Catalogue — coming soon', path: req.path,
      body: `<section class="sec hero-med"><div class="sec-in empty-state"><h1>Catalogue coming soon</h1>
        <p>Our latest catalogue is being prepared. Share your details and we will send it over WhatsApp or email.</p>
        <a class="btn btn-primary" href="/contact">Request Catalogue</a></div></section>`
    }));
  }
  db.prepare('UPDATE catalogue_files SET downloads=downloads+1 WHERE id=?').run(c.id);
  res.download(path.join(DATA_DIR, 'documents', c.file), `MORA-HOME-Catalogue-v${c.version}.pdf`);
});

function pageShell(req, res, slug, { title, desc } = {}) {
  const page = db.prepare('SELECT * FROM pages WHERE slug=? AND deleted_at IS NULL AND status=\'published\'').get(slug);
  if (!page) return null;
  const seo = JSON.parse(page.seo || '{}');
  const body = `<div class="page-body"><div class="page-hero"><div class="sec-in"><h1>${eA(page.title)}</h1></div></div>${R.renderPageBlocks(page)}</div>`;
  res.send(R.layout(req, { title: seo.title || title || page.title + ' — MORA HOME', description: seo.description || desc || '', path: '/' + slug, body }));
  return true;
}
router.get('/about', (req, res, next) => { if (!pageShell(req, res, 'about')) return next(); });
router.get('/p/:slug', (req, res, next) => { if (!pageShell(req, res, req.params.slug)) return next(); });

router.get('/contact', (req, res) => {
  const d = R.siteData();
  const forms = getSetting('forms', {});
  const mapNote = d.business.mapUrl ? `<div class="map-embed card"><iframe src="${eA(d.business.mapUrl)}" title="Map — MORA HOME" loading="lazy" referrerpolicy="no-referrer"></iframe></div>` : '';
  const preCode = String(req.query.product || '').toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const preType = String(req.query.type || '');
  const msgDefault = preCode ? `I am interested in product ${preCode}. Please share wholesale pricing and MOQ.` : (preType === 'gifting' ? 'We are planning corporate / return gifting. Please share options and pricing.' : '');
  const cf = (forms.contact || []).filter(f => f.visible !== false).map(f => R.formField(f, f.key === 'message' ? msgDefault : '')).join('');
  const catF = (forms.catalogue || []).filter(f => f.visible !== false).map(f => R.formField(f)).join('');
  const body = `
  <section class="sec" style="--sec-bg:${eA(d.brand.colors?.creamSoft || '#FBF9F4')};--sec-pad:clamp(2.5rem,5vw,4.5rem);--sec-max:1240px">
    <div class="sec-in">
      <header class="sec-head"><p class="kicker">We reply within one business day</p><h1>Contact MORA HOME</h1></header>
      <div class="contact-split">
        <div>
          <div class="card contact-cards">
            <h2>Reach us directly</h2>
            <ul class="contact-facts">
              <li>${R.icon('phone', 18)}<div><b>Phone / WhatsApp</b><a href="${phoneHref(d.business.phone)}">${fmtPhone(d.business.phone)}</a></div></li>
              <li>${R.icon('mail', 18)}<div><b>Enquiries</b><a href="mailto:${eA(d.business.emailPrimary)}">${eA(d.business.emailPrimary)}</a></div></li>
              <li>${R.icon('mail', 18)}<div><b>Ask MORA</b><a href="mailto:${eA(d.business.emailSecondary)}">${eA(d.business.emailSecondary)}</a></div></li>
              <li>${R.icon('pin', 18)}<div><b>Workshop</b><span>${eA(d.business.address)}</span></div></li>
              ${d.business.hours ? `<li>${R.icon('star', 18)}<div><b>Hours</b><span>${eA(d.business.hours)}</span></div></li>` : ''}
            </ul>
            <button class="btn btn-wa" data-wa-open data-wa-context="contact-page">${R.icon('whatsapp', 19)} Chat on WhatsApp</button>
          </div>
          <div class="card cat-request">
            <h2>Get the Latest Catalogue</h2>
            <form class="form" data-lead-form="catalogue" data-source="contact" novalidate>
              ${catF}
              <button class="btn btn-outline" type="submit">${R.icon('download', 16)} Request Catalogue</button>
              <div class="form-msg" role="status" aria-live="polite"></div>
            </form>
          </div>
          ${mapNote}
        </div>
        <form class="form card" data-lead-form="contact" data-source="contact" novalidate>
          <h2>Send Your Enquiry</h2>
          ${preCode ? `<input type="hidden" name="product_code" value="${eA(preCode)}">` : ''}
          ${cf}
          <button class="btn btn-primary btn-block" type="submit">Submit</button>
          <div class="form-msg" role="status" aria-live="polite"></div>
        </form>
      </div>
    </div>
  </section>`;
  res.send(R.layout(req, { title: 'Contact — MORA HOME', description: 'Contact MORA HOME Moradabad for wholesale homeware, corporate gifting and bulk orders. Phone, WhatsApp and enquiry form.', path: '/contact', body }));
});

router.get('/enquiry-list', (req, res) => {
  const forms = getSetting('forms', {});
  const f = (forms.enquiry || []).filter(x => x.visible !== false).map(x => R.formField(x)).join('');
  const body = `
  <section class="sec" style="--sec-bg:#FBF9F4;--sec-pad:clamp(2rem,4vw,3.5rem);--sec-max:1000px">
    <div class="sec-in">
      <header class="sec-head"><p class="kicker">One combined enquiry for everything you shortlisted</p><h1>Enquiry List</h1></header>
      <div class="elist-paste card"><h2>Paste product codes</h2>
        <div class="elist-paste-row"><input id="paste-codes" placeholder="e.g. MH-1001, MH1002, 1003" aria-label="Paste product codes"><button class="btn btn-outline" id="paste-add" type="button">Add Codes</button></div>
      </div>
      <div id="elist-items" class="elist-items"></div>
      <div class="empty-state" id="elist-empty"><h2>Your enquiry list is empty</h2>
        <p>Add products from the <a class="txt-link" href="/products">Products page</a> and submit one combined enquiry.</p></div>
      <form class="form card" id="elist-form" data-lead-form="enquiry-list" data-source="enquiry-list" hidden novalidate>
        <h2>Submit Combined Enquiry</h2>${f}
        <button class="btn btn-primary btn-block" type="submit">Send Combined Enquiry</button>
        <div class="form-msg" role="status" aria-live="polite"></div>
      </form>
    </div>
  </section>`;
  res.send(R.layout(req, { title: 'Enquiry List — MORA HOME', description: 'Combine shortlisted MORA HOME products into a single wholesale enquiry.', path: '/enquiry-list', body, robots: false }));
});
router.get('/compare', (req, res) => {
  const body = `
  <section class="sec" style="--sec-bg:#FBF9F4;--sec-pad:clamp(2rem,4vw,3.5rem);--sec-max:1240px">
    <div class="sec-in">
      <header class="sec-head"><p class="kicker">Side by side</p><h1>Compare Products</h1></header>
      <div class="empty-state" id="cmp-empty"><h2>Nothing to compare yet</h2>
        <p>Tick “Compare” on up to 4 products from the <a class="txt-link" href="/products">Products page</a>.</p></div>
      <div id="cmp-wrap" class="cmp-wrap" hidden></div>
    </div>
  </section>`;
  res.send(R.layout(req, { title: 'Compare — MORA HOME', description: 'Compare MORA HOME product specifications side by side.', path: '/compare', body, robots: false }));
});

/* ---------- sitemap / robots ---------- */
router.get('/sitemap.xml', (req, res) => {
  const urls = ['/', '/products', '/contact', '/enquiry-list', '/about'];
  for (const p of db.prepare("SELECT slug FROM pages WHERE status='published' AND deleted_at IS NULL").all()) urls.push('/p/' + p.slug);
  for (const p of db.prepare("SELECT slug, updated_at FROM products WHERE status='published' AND deleted_at IS NULL").all()) urls.push('/products/' + p.slug);
  res.set('Content-Type', 'application/xml');
  res.send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `\n <url><loc>https://morahome.in${u}</loc></url>`).join('')}\n</urlset>`);
});
router.get('/robots.txt', (req, res) => {
  const seo = getSetting('seo', {});
  res.set('Content-Type', 'text/plain');
  res.send(seo.robotsIndex === false
    ? 'User-agent: *\nDisallow: /\n'
    : 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\nDisallow: /compare\nDisallow: /enquiry-list\n\nSitemap: https://morahome.in/sitemap.xml\n');
});

/* ---------- 404 (admin-editable) ---------- */
router.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const nf = getSetting('notfound', {});
  const body = `<section class="sec hero-med" style="--sec-bg:#FBF9F4"><div class="sec-in empty-state">
    <p class="kicker">404</p><h1>${eA(nf.heading || 'This page seems to have moved.')}</h1>
    <p>${eA(nf.text || 'The link you followed may be old — or the piece has found a new home.')}</p>
    <form class="hero-search" role="search" action="/products" method="get"><input name="q" type="search" placeholder="Search products…" aria-label="Search"><button class="btn btn-primary">Search</button></form>
    <div class="hero-ctas"><a class="btn btn-outline" href="/products">Browse Products</a>
    <a class="btn btn-ghost" href="/contact">Contact Us</a>
    <button class="btn btn-wa" data-wa-open data-wa-context="404">${R.icon('whatsapp', 18)} WhatsApp</button></div></div></section>`;
  res.status(404).send(R.layout(req, { title: 'Page not found — MORA HOME', path: req.path, body, robots: false }));
});

module.exports = router;
