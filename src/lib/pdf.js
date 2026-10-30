/**
 * MORA HOME — auto-generated A4 PDFs (pdfkit).
 *
 * specPdf(p, ctx)          → single-product spec sheet (1:1 copy of the printable HTML sheet)
 * cataloguePdf(ctx, opts)  → wholesale catalogue: branded cover + one spec page per
 *                            published product (audit H2 — /catalogue/latest is never a dead end)
 * selectedCataloguePdf()   → visitor shortlist: exactly 6 products per A4 page (2×3 grid),
 *                            photo + code + name + material + size + MOQ + price on every card
 *
 * Every page of BOTH catalogues carries a baked-in diagonal watermark (logo + phone +
 * email + website, tiled at ≈ −30°). The watermark is painted straight into each page's
 * content stream BEFORE the product content — it is not an optional-content layer and
 * not an annotation, so it cannot be switched off or deleted from a layer panel.
 * Its contents and opacity come from Admin → Catalogue → "Catalogue Watermark".
 *
 * Layout: crest + MORA HOME header, red code, walnut rule, title, rounded photo +
 * facts table, description, "Detailed Specifications" striped table, footer contacts.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const db = require('../db');
const settings = require('../settings');
const { absFromRel } = require('./media');

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

const MM = 72 / 25.4;                       // 1 mm in PDF points
const CREST_RATIO = 1082 / 1400;            // height/width of the official crest artwork
const C = { paper: '#FFFDF8', walnut: '#5C3D2E', dark: '#3B2417', muted: '#66625B', crimson: '#8B0000',
  line: '#E5DEC9', stripe: '#FBF9F4', photoBg: '#F4EFE6', text: '#333333', ph: '#8A6A52' };

/* pdfkit cannot read WebP and has no ₹ glyph in its built-in fonts → convert / replace */
async function imageBuffer(absPath) {
  if (!fs.existsSync(absPath)) return null;
  try {
    if (sharp) return await sharp(absPath).rotate().jpeg({ quality: 88 }).toBuffer();
    return fs.readFileSync(absPath);
  } catch { return null; }
}
const clean = (v) => String(v == null ? '' : v).replace(/₹\s*/g, 'Rs. ').replace(/[✉☎]/g, '').replace(/\s+\n/g, '\n');

async function crestBuffer(ctx) {
  const brand = ctx.brand || {};
  return imageBuffer(absFromRel(brand.crestIvoryPath || brand.crestPath || '/uploads/brand/crest-ivory.png'));
}

/* ══════════════════════════════════════════════════════════════════════════
   SINGLE EDITABLE CONTACT SOURCE (Admin → Catalogue → Catalogue Watermark)
   The catalogue header/footer used to mix contact.email1 (header) with
   contact.email2 (spec pages). Everything a catalogue prints now resolves
   through catalogueContact(): watermark setting first, global contact as
   fallback, so one edit updates every PDF.
   ══════════════════════════════════════════════════════════════════════════ */
const WM_KEY = 'catalogue-watermark';
const WM_DEFAULTS = {
  enabled: true,
  logoPath: '',                       // '' → brand crest
  phone: '+91 8171246275',
  email: 'writemora@gmail.com',
  whatsapp: '918171246275',
  website: 'morahome.in',
  opacity: 13,                        // 5 – 25 (%)
};
function watermarkSettings(ctx, mode = 'live') {
  const stored = (ctx && ctx.watermark) || settings.get(WM_KEY, mode) || {};
  const w = Object.assign({}, WM_DEFAULTS, stored);
  w.opacity = Math.min(25, Math.max(5, Number(w.opacity) || WM_DEFAULTS.opacity));
  w.enabled = w.enabled !== false && w.enabled !== 'false' && w.enabled !== 0;
  return w;
}
/** One editable source for every phone/email/website a catalogue prints. */
function catalogueContact(ctx) {
  const c = ctx.contact || {};
  const w = watermarkSettings(ctx);
  return {
    phone: String(w.phone || c.phone || '').trim(),
    whatsapp: String(w.whatsapp || c.whatsapp || '').replace(/[^\d+]/g, ''),
    email: String(w.email || c.email1 || '').trim(),
    email2: String(c.email2 || '').trim(),
    address: String(c.address || '').trim(),
    website: String(w.website || '').trim(),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   BAKED-IN DIAGONAL WATERMARK
   ══════════════════════════════════════════════════════════════════════════ */
const wmTileCache = new Map();   // rel → { mtime, buf }

/** Small alpha PNG of the watermark logo (down-scaled once, cached by mtime). */
async function watermarkLogoBuffer(rel) {
  const abs = absFromRel(rel);
  if (!fs.existsSync(abs)) return null;
  let mtime = 0;
  try { mtime = fs.statSync(abs).mtimeMs; } catch { /* ignore */ }
  const hit = wmTileCache.get(rel);
  if (hit && hit.mtime === mtime) return hit.buf;
  let buf = null;
  try {
    if (sharp) buf = await sharp(abs).rotate().resize({ width: 260, withoutEnlargement: true }).png({ quality: 80 }).toBuffer();
    else buf = fs.readFileSync(abs);
  } catch { buf = fs.readFileSync(abs); }
  wmTileCache.set(rel, { mtime, buf });
  return buf;
}

/** Paints the tiled diagonal watermark into the CURRENT page's content stream.
    Called immediately after the paper fill and before any product content, so the
    watermark always sits behind the content yet remains part of the page itself. */
async function paintWatermark(doc, ctx, wmState) {
  const wm = wmState.wm;
  if (!wm || !wm.enabled) return;
  if (wmState.img === false) return;                    // logo unavailable → skip quietly
  if (!wmState.img) {
    const rel = wm.logoPath || (ctx.brand && ctx.brand.crestPath) || '/uploads/brand/crest-transparent.png';
    const buf = await watermarkLogoBuffer(rel);
    if (!buf) { wmState.img = false; return; }
    try { wmState.img = doc.openImage(buf); } catch { wmState.img = false; return; }
  }
  const cc = wmState.cc;
  const W = doc.page.width, H = doc.page.height;
  const alpha = Math.min(0.25, Math.max(0.05, wm.opacity / 100));

  /* tile box (unrotated): logo centred above three centred contact lines */
  const TW = 64 * MM, TH = 50 * MM;
  const crestW = 15 * MM, crestH = crestW * CREST_RATIO;
  const lines = [cc.phone, cc.email, cc.website].filter(Boolean);
  const blockH = crestH + 2 * MM + lines.length * 4.1 * MM;

  doc.save();
  doc.opacity(alpha);
  doc.rotate(-30, { origin: [W / 2, H / 2] });
  const prevX = doc.x, prevY = doc.y;
  const diag = Math.hypot(W, H);
  const x0 = W / 2 - diag / 2, y0 = H / 2 - diag / 2;
  /* height:Infinity keeps pdfkit's line-wrapper from treating the rotated
     coordinates as overflow — the watermark must NEVER add a page. */
  const NB = { lineBreak: false, height: Infinity };
  for (let ty = y0; ty < y0 + diag; ty += TH) {
    for (let tx = x0; tx < x0 + diag; tx += TW) {
      const inner = ty + (TH - blockH) / 2;
      try { doc.image(wmState.img, tx + (TW - crestW) / 2, inner, { width: crestW }); } catch { /* skip tile image */ }
      let ly = inner + crestH + 2 * MM;
      doc.font('Times-Bold').fontSize(10).fillColor(C.walnut)
        .text('MORA HOME', tx, ly, Object.assign({ width: TW, align: 'center', characterSpacing: 1.2 }, NB));
      ly += 4.6 * MM;
      doc.font('Helvetica').fontSize(7);
      for (const ln of lines) { doc.text(ln, tx, ly, Object.assign({ width: TW, align: 'center' }, NB)); ly += 4.1 * MM; }
    }
  }
  doc.restore();
  doc.opacity(1);
  doc.x = prevX; doc.y = prevY;      // rotated coords must not leak into the layout flow
}
/** Per-document watermark state: settings resolved once, logo embedded once. */
function watermarkState(ctx) {
  return { wm: watermarkSettings(ctx), cc: catalogueContact(ctx), img: null };
}

/* ───────────────────────── text fitting helpers ───────────────────────── */
function fitLine(doc, text, width) {
  let t = String(text == null ? '' : text);
  if (doc.widthOfString(t, { lineBreak: false }) <= width) return t;
  while (t.length > 1 && doc.widthOfString(t + '…', { lineBreak: false }) > width) t = t.slice(0, -1);
  return t + '…';
}
function fitLines(doc, text, width, maxLines) {
  const words = String(text == null ? '' : text).split(/\s+/).filter(Boolean);
  const out = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? cur + ' ' + w : w;
    if (doc.widthOfString(next, { lineBreak: false }) <= width || !cur) cur = next;
    else { out.push(cur); cur = w; if (out.length === maxLines) break; }
  }
  if (out.length < maxLines && cur) out.push(cur);
  if (out.length > maxLines) out.length = maxLines;
  if (out.length === maxLines && cur && out[maxLines - 1] !== cur) {
    out[maxLines - 1] = fitLine(doc, out[maxLines - 1] + ' ' + cur, width);
  }
  return out;
}

/** Draws one product's spec sheet onto `doc`'s CURRENT page (may add pages for long specs). */
async function drawSpecPage(doc, p, ctx, crestBuf, wmState) {
  const c = catalogueContact(ctx);
  const cat = db.get('SELECT * FROM categories WHERE slug = ?', [p.category_slug]);
  const img = db.get('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort ASC LIMIT 1', [p.id]);
  let specs = []; try { specs = JSON.parse(p.specs_json || '[]'); } catch { specs = []; }
  specs = specs.filter((s) => s && (s.k || s.v));
  specs.push({ k: 'Pricing', v: p.price_on_request ? 'Price on request — wholesale quotation against order quantity.' : 'Contact us for pricing.' });

  const photoBuf = img ? await imageBuffer(absFromRel(img.path)) : null;

  const W = doc.page.width, H = doc.page.height;
  const L = 14 * MM, R = W - 14 * MM, CW = R - L;       // same side padding as print.css (14mm)
  const TOP = 16 * MM, FOOT_H = 46;

  const paper = () => doc.rect(0, 0, W, H).fill(C.paper);
  const footer = () => {
    const fy = H - 16 * MM - 30;
    doc.moveTo(L, fy).lineTo(R, fy).lineWidth(0.75).strokeColor(C.line).stroke();
    doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
      .text(`Generated from the MORA HOME wholesale system on ${new Date().toISOString().slice(0, 10)} · For wholesale / B2B enquiries only.`, L, fy + 8, { width: CW, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(C.walnut)
      .text(clean([c.email, c.phone, `WhatsApp +${c.whatsapp}`, c.website].filter(Boolean).join(' · ')), L, fy + 20, { width: CW, lineBreak: false });
  };

  paper();
  if (wmState) await paintWatermark(doc, ctx, wmState);   // baked in, behind everything

  /* ---------- header ---------- */
  const crestW = 30 * MM;
  if (crestBuf) { try { doc.image(crestBuf, L, TOP, { width: crestW }); } catch { /* skip */ } }
  const tx = L + crestW + 14;
  doc.font('Times-Bold').fontSize(22).fillColor(C.dark)
    .text('MORA HOME', tx, TOP + 4, { characterSpacing: 4, lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(C.muted)
    .text('Manufacturer & Exporter of Handcrafted Metal & Wooden Home Products', tx, TOP + 34, { width: CW - crestW - 90 });
  doc.fontSize(8.5).text(clean(`${c.address} · ${c.phone} · ${c.email}`), tx, doc.y + 3, { width: CW - crestW - 90 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(C.crimson)
    .text(p.code, R - 120, TOP + 6, { width: 120, align: 'right', characterSpacing: 1, lineBreak: false });
  let y = TOP + crestW + 8;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.6).strokeColor(C.walnut).stroke();

  /* ---------- title ---------- */
  y += 14;
  doc.font('Times-Bold').fontSize(19).fillColor(C.dark).text(clean(p.name), L, y, { width: CW });
  y = doc.y + 10;

  /* ---------- photo + facts ---------- */
  const ph = 52 * MM;
  doc.save(); doc.roundedRect(L, y, ph, ph, 6).clip(); doc.rect(L, y, ph, ph).fill(C.photoBg);
  if (photoBuf) { try { doc.image(photoBuf, L, y, { cover: [ph, ph], align: 'center', valign: 'center' }); } catch { /* skip */ } }
  doc.restore();
  doc.roundedRect(L, y, ph, ph, 6).lineWidth(0.75).strokeColor(C.line).stroke();
  if (!photoBuf) doc.font('Helvetica').fontSize(8).fillColor(C.ph).text('PHOTO PENDING', L, y + ph / 2 - 4, { width: ph, align: 'center', characterSpacing: 1.2 });

  const fx = L + ph + 16, fw = R - fx, labelW = fw * 0.34;
  const facts = [['Product Code', p.code], ['Category', cat ? cat.name : '—']];
  if (p.badge) facts.push(['Badge', p.badge]);
  facts.push(['Material', p.material], ['Size', p.size], ['MOQ', p.moq]);
  if (p.price) facts.push(['Wholesale Price', p.price]);
  let fy = y;
  facts.forEach(([k, v]) => {
    const val = clean(v) || '—';
    doc.font('Helvetica').fontSize(8.5);
    const h = Math.max(doc.heightOfString(val, { width: fw - labelW - 16 }), 10) + 10;
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.walnut).text(k, fx + 6, fy + 5, { width: labelW - 10 });
    doc.font('Helvetica').fillColor(C.text).text(val, fx + labelW + 6, fy + 5, { width: fw - labelW - 12 });
    fy += h;
    doc.moveTo(fx, fy).lineTo(R, fy).lineWidth(0.6).strokeColor(C.line).stroke();
  });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted).text(clean(p.description), fx, fy + 8, { width: fw });
  y = Math.max(y + ph, doc.y) + 14;

  /* ---------- specifications ---------- */
  const sub = () => { doc.font('Times-Bold').fontSize(13).fillColor(C.walnut).text('Detailed Specifications', L, y); y = doc.y + 6; };
  sub();
  const kW = CW * 0.34;
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    const k = clean(s.k), v = clean(s.v);
    doc.font('Helvetica').fontSize(8.5);
    const h = Math.max(doc.heightOfString(v, { width: CW - kW - 16 }), doc.heightOfString(k, { width: kW - 16 }), 10) + 10;
    if (y + h > H - 16 * MM - FOOT_H - 10) { footer(); doc.addPage(); paper(); if (wmState) await paintWatermark(doc, ctx, wmState); y = TOP; sub(); }
    if (i % 2 === 0) doc.rect(L, y, CW, h).fill(C.stripe);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.walnut).text(k, L + 8, y + 5, { width: kW - 16 });
    doc.font('Helvetica').fillColor(C.text).text(v, L + kW + 8, y + 5, { width: CW - kW - 16 });
    y += h;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.6).strokeColor(C.line).stroke();
  }

  footer();
}

/** Branded catalogue cover page (audit H2) — fully centred, print-professional.
    NOTE: pdfkit only honours `align` when an explicit `width` is passed, so every
    centred line goes through the `center()` helper below. */
async function drawCoverPage(doc, ctx, crestBuf, prods, opts = {}, wmState) {
  const c = catalogueContact(ctx);
  const W = doc.page.width, H = doc.page.height;
  const center = (str, y, opt = {}, width = W) =>
    doc.text(str, (W - width) / 2, y, Object.assign({ width, align: 'center' }, opt));

  doc.rect(0, 0, W, H).fill(C.paper);
  doc.rect(0, 0, W, 9 * MM).fill(C.walnut);
  doc.rect(0, H - 9 * MM, W, 9 * MM).fill(C.walnut);
  if (wmState) await paintWatermark(doc, ctx, wmState);   // cover carries the watermark too

  /* ── crest ── */
  let y = 22 * MM;
  if (crestBuf) {
    const cw = 46 * MM, ch = cw * CREST_RATIO;
    try { doc.image(crestBuf, (W - cw) / 2, y, { width: cw }); } catch { /* skip */ }
    y += ch + 6 * MM;
  }

  /* ── masthead ── */
  doc.font('Times-Bold').fontSize(34).fillColor(C.dark);
  center('MORA HOME', y, { characterSpacing: 5 });
  y = doc.y + 4.5 * MM;
  doc.font('Helvetica').fontSize(10.5).fillColor(C.muted);
  center('Manufacturer & Exporter of Handcrafted Metal & Wooden Home Products', y);
  y = doc.y + 2 * MM;
  doc.fontSize(9.5);
  center('Moradabad, Uttar Pradesh · India', y);
  y = doc.y + 7 * MM;

  /* ── ornamental rule with crimson dot ── */
  doc.moveTo(W / 2 - 35 * MM, y).lineTo(W / 2 - 4 * MM, y).lineWidth(1).strokeColor(C.walnut).stroke();
  doc.moveTo(W / 2 + 4 * MM, y).lineTo(W / 2 + 35 * MM, y).lineWidth(1).strokeColor(C.walnut).stroke();
  doc.circle(W / 2, y, 1.7).fill(C.crimson);
  y += 7 * MM;

  /* ── title block ── */
  doc.font('Helvetica-Bold').fontSize(20).fillColor(C.crimson);
  center(opts.title || 'WHOLESALE CATALOGUE', y, { characterSpacing: 4 });
  y = doc.y + 5 * MM;
  const edition = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(10.5).fillColor(C.walnut);
  center(`Edition — ${edition}`, y);
  y = doc.y + 9 * MM;

  /* ── centred contents panel ── */
  const cats = opts.cats || db.all(`SELECT c.name, c.slug, COUNT(p.id) AS n
      FROM categories c LEFT JOIN products p ON p.category_slug = c.slug AND p.status = 'published'
      WHERE c.visible = 1 GROUP BY c.id, c.name, c.slug ORDER BY c.sort ASC`);
  const listed = cats.filter((x) => x.n > 0);
  if (listed.length) {
    const PW = 132 * MM, PX = (W - PW) / 2;
    const headH = 11 * MM, rowH = 7 * MM, footH = 10 * MM;
    const PH = headH + listed.length * rowH + footH;
    doc.roundedRect(PX, y, PW, PH, 3 * MM).fillAndStroke(C.stripe, C.line);
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted);
    center('IN THIS EDITION', y + 4.2 * MM, { characterSpacing: 2.5 });
    let ry = y + headH;
    listed.forEach((x, i) => {
      doc.font('Helvetica').fontSize(10.5).fillColor(C.text)
        .text(x.name, PX + 10 * MM, ry + 2.1 * MM, { width: PW - 34 * MM, lineBreak: false });
      doc.font('Helvetica-Bold').fillColor(C.walnut)
        .text(`${x.n} design${x.n === 1 ? '' : 's'}`, PX + PW - 30 * MM, ry + 2.1 * MM, { width: 20 * MM, align: 'right', lineBreak: false });
      ry += rowH;
      if (i < listed.length - 1) {
        doc.moveTo(PX + 8 * MM, ry).lineTo(PX + PW - 8 * MM, ry).lineWidth(0.5).strokeColor(C.line).stroke();
      }
    });
    doc.font('Helvetica-Oblique').fontSize(8.8).fillColor(C.muted);
    center(`${prods.length} curated design${prods.length === 1 ? '' : 's'} shown · 500+ designs in our repertoire — tell us what you need and we will quote.`,
      y + PH - footH + 3 * MM, {}, PW - 16 * MM);
    y += PH + 9 * MM;
  }

  /* ── centred contact block ── */
  const by = H - 42 * MM;
  doc.moveTo(W / 2 - 35 * MM, by - 7 * MM).lineTo(W / 2 + 35 * MM, by - 7 * MM).lineWidth(0.75).strokeColor(C.line).stroke();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.walnut);
  center(clean(`${c.phone}   ·   WhatsApp +${c.whatsapp}`), by);
  y = doc.y + 2.4 * MM;
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted);
  center(clean(`${c.email}   ·   ${c.website}`), y);
  y = doc.y + 2.4 * MM;
  doc.fontSize(9);
  center(clean(c.address), y);

  /* ── trade note above the bottom band ── */
  doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(C.muted);
  center('Prices on request · MOQ applies per product · Custom branding & private label available', H - 17 * MM, {}, W - 40 * MM);
}

function collect(doc) {
  const chunks = [];
  doc.on('data', (d) => chunks.push(d));
  return new Promise((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** Single-product A4 spec sheet PDF. */
async function specPdf(p, ctx) {
  const crestBuf = await crestBuffer(ctx);
  const wmState = watermarkState(ctx);
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${p.code} — ${p.name}`, Author: 'MORA HOME' } });
  const done = collect(doc);
  await drawSpecPage(doc, p, ctx, crestBuf, wmState);
  doc.end();
  return done;
}

/** Full wholesale catalogue PDF.
    opts.catSlug      → only that category's products (range catalogue)
    opts.includeCover → draw the built-in cover (false when a custom cover page
                        will be merged in front by mergeCover())            */
async function cataloguePdf(ctx, opts = {}) {
  const where = opts.catSlug ? "status = 'published' AND category_slug = ?" : "status = 'published'";
  const params = opts.catSlug ? [opts.catSlug] : [];
  const prods = db.all(`SELECT * FROM products WHERE ${where} ORDER BY category_slug ASC, code ASC`, params);
  const crestBuf = await crestBuffer(ctx);
  const wmState = watermarkState(ctx);
  let cat = null;
  if (opts.catSlug) cat = db.get('SELECT * FROM categories WHERE slug = ?', [opts.catSlug]);
  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: {
      Title: cat ? `MORA HOME — ${cat.name} Range Catalogue` : 'MORA HOME — Wholesale Catalogue',
      Author: 'MORA HOME', Subject: 'Auto-generated wholesale catalogue',
    },
  });
  const done = collect(doc);
  if (opts.includeCover !== false) {
    await drawCoverPage(doc, ctx, crestBuf, prods, cat
      ? { title: `${cat.name.toUpperCase()} RANGE`, cats: [{ name: cat.name, slug: cat.slug, n: prods.length }] }
      : {}, wmState);
  }
  for (let i = 0; i < prods.length; i++) {
    if (i > 0 || opts.includeCover !== false) doc.addPage();
    await drawSpecPage(doc, prods[i], ctx, crestBuf, wmState);   // eslint-disable-line no-await-in-loop
  }
  doc.end();
  return done;
}

/** Prepend an uploaded/branded cover PDF (e.g. the designed front page) to a
    generated body PDF. Uses pdf-lib — pure JS, no external binaries.
    The merged-in cover page is a page of the finished catalogue, so it gets the
    baked watermark stamped on top of it (behind nothing — the cover art is the
    page; the watermark tiles stay at 13 % so the design stays the focus). */
async function mergeCover(coverBuf, bodyBuf, ctx) {
  const { PDFDocument: Lib } = require('pdf-lib');
  const out = await Lib.create();
  const cover = await Lib.load(coverBuf, { ignoreEncryption: true });
  const body = await Lib.load(bodyBuf, { ignoreEncryption: true });
  for (const pg of await out.copyPages(cover, cover.getPageIndices())) out.addPage(pg);
  for (const pg of await out.copyPages(body, body.getPageIndices())) out.addPage(pg);
  if (ctx) await stampMergedPages(out, ctx);
  return Buffer.from(await out.save());
}

/** Stamps the baked watermark onto pages that arrived from an uploaded cover
    PDF (those pages carry no pdfkit content stream of ours). Each element is a
    normal content-stream draw op on the page — not a layer, not an annotation.
    Tile origins are laid out on an unrotated grid, then every point is mapped
    through a +30° rotation about the page centre so the pattern runs diagonally
    (visually identical to the pdfkit pages' rotate(-30)). */
async function stampMergedPages(pdf, ctx) {
  const { StandardFonts, degrees } = require('pdf-lib');
  const wm = watermarkSettings(ctx);
  if (!wm.enabled) return;
  const rel = wm.logoPath || (ctx.brand && ctx.brand.crestPath) || '/uploads/brand/crest-transparent.png';
  const buf = await watermarkLogoBuffer(rel);
  if (!buf) return;
  let wmImg = null;
  try { wmImg = await pdf.embedPng(buf); } catch { return; }
  const cc = catalogueContact(ctx);
  const fontB = await pdf.embedStandardFont(StandardFonts.HelveticaBold);
  const font = await pdf.embedStandardFont(StandardFonts.Helvetica);
  const alpha = Math.min(0.25, Math.max(0.05, wm.opacity / 100));
  const lines = [cc.phone, cc.email, cc.website].map(clean).filter(Boolean);
  const TW = 64 * MM, TH = 50 * MM;
  const crestW = 15 * MM, crestH = crestW * (wmImg.height / wmImg.width);
  const blockH = crestH + 2 * MM + lines.length * 4.1 * MM;

  for (const page of pdf.getPages()) {
    const { width: W, height: H } = page.getSize();
    const cx = W / 2, cy = H / 2;
    const phi = 30 * Math.PI / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    /* conceptual y-down tile point → mapped y-up page coordinates */
    const P = (tx, ty) => {
      const u = tx, v = H - ty;
      return [cx + (u - cx) * cos - (v - cy) * sin, cy + (u - cx) * sin + (v - cy) * cos];
    };
    const diag = Math.hypot(W, H);
    for (let ty = cy - diag / 2; ty < cy + diag / 2; ty += TH) {
      for (let tx = cx - diag / 2; tx < cx + diag / 2; tx += TW) {
        const inner = ty + (TH - blockH) / 2;
        const [ix, iy] = P(tx + (TW - crestW) / 2, inner + crestH);   // image bottom-left
        page.drawImage(wmImg, { x: ix, y: iy, width: crestW, height: crestH, opacity: alpha, rotate: degrees(30) });
        let ly = inner + crestH + 2 * MM;
        const [mx, my] = P(tx + 6 * MM, ly + 8);
        page.drawText('MORA HOME', { x: mx, y: my, size: 10, font: fontB, opacity: alpha, rotate: degrees(30) });
        ly += 4.6 * MM;
        for (const ln of lines) {
          const [lx, lyy] = P(tx + 6 * MM, ly + 6);
          page.drawText(ln, { x: lx, y: lyy, size: 7, font, opacity: alpha, rotate: degrees(30) });
          ly += 4.1 * MM;
        }
      }
    }
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   SELECTED-PRODUCTS CATALOGUE — exactly 6 products per A4 page (2 cols × 3 rows)
   Every card: photo · code · wholesale price (or "Price on request") · name ·
   material · size · MOQ. Products are chunked 6-per-page so a card is never
   cut across a page break; the last page may hold fewer.
   ══════════════════════════════════════════════════════════════════════════ */
const SEL = {
  cols: 2, rows: 3, perPage: 6,
  gapX: 7 * MM, gapY: 6 * MM,
  cellH: 66 * MM,          // fixed so the grid is identical on every page
  pad: 4 * MM,
  photo: 34 * MM,
};

function selHeader(doc, c, crestBuf, first) {
  const W = doc.page.width;
  const L = 14 * MM, R = W - 14 * MM, CW = R - L;
  const TOP = 14 * MM;
  if (crestBuf) { try { doc.image(crestBuf, L, TOP, { width: 24 * MM }); } catch { /* skip */ } }
  const tx = L + 24 * MM + 10;
  doc.font('Times-Bold').fontSize(19).fillColor(C.dark)
    .text('MORA HOME', tx, TOP + 2, { characterSpacing: 3, lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor(C.muted)
    .text(clean([c.address, c.phone, c.email, `WhatsApp +${c.whatsapp}`, c.website].filter(Boolean).join(' · ')), tx, TOP + 26, { width: CW - 24 * MM - 40 * MM });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(C.crimson)
    .text('SELECTED PRODUCTS CATALOGUE', R - 62 * MM, TOP + 4, { width: 62 * MM, align: 'right', characterSpacing: 1, lineBreak: false });
  let y = TOP + 24 * MM + 6;
  doc.moveTo(L, y).lineTo(R, y).lineWidth(1.4).strokeColor(C.walnut).stroke();
  if (first) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(C.muted)
      .text(`Your shortlisted designs · generated ${new Date().toISOString().slice(0, 10)} · wholesale prices shown per design, "Price on request" where not listed`, L, y + 6, { width: CW, lineBreak: false });
    y += 20;
  } else {
    y += 10;
  }
  return y + 6;
}

function selFooter(doc, c) {
  const W = doc.page.width, H = doc.page.height;
  const L = 14 * MM, R = W - 14 * MM, CW = R - L;
  const fy = H - 14 * MM;
  doc.moveTo(L, fy - 6).lineTo(R, fy - 6).lineWidth(0.6).strokeColor(C.line).stroke();
  doc.font('Helvetica').fontSize(7.5).fillColor(C.muted)
    .text(clean([c.phone, `WhatsApp +${c.whatsapp}`, c.email, c.website, c.address].filter(Boolean).join(' · ')), L, fy, { width: CW, lineBreak: false });
}

function drawSelCard(doc, p, photoBuf, x, y, w, h) {
  const pad = SEL.pad, PS = SEL.photo;
  const bx = x + pad, bw = w - 2 * pad;

  /* measure first so the whole content block can be centred in the card
     (a 1-line and a 2-line title both sit balanced, never top-stuck) */
  doc.font('Times-Bold').fontSize(10);
  const nameLines = fitLines(doc, clean(p.name), bw, 2);
  const nameLH = doc.currentLineHeight(true) + 0.6 * MM;
  doc.font('Helvetica').fontSize(7.4);
  const factLH = doc.currentLineHeight(true) + 1.1 * MM;
  const contentH = 3 * MM + PS + nameLines.length * nameLH + 0.8 * MM + 3 * factLH;
  const base = y + Math.max(pad, (h - contentH) / 2);

  /* card plate */
  doc.roundedRect(x, y, w, h, 2.5 * MM).fillAndStroke(C.stripe, C.line);

  /* photo (or neat branded placeholder when none uploaded) */
  doc.save(); doc.roundedRect(bx, base, PS, PS, 2 * MM).clip();
  doc.rect(bx, base, PS, PS).fill(C.photoBg);
  if (photoBuf) {
    try { doc.image(photoBuf, bx, base, { cover: [PS, PS], align: 'center', valign: 'center' }); } catch { /* skip */ }
  }
  doc.restore();
  doc.roundedRect(bx, base, PS, PS, 2 * MM).lineWidth(0.6).strokeColor(C.line).stroke();
  if (!photoBuf) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.ph)
      .text(String(p.code), bx, base + PS / 2 - 9, { width: PS, align: 'center', lineBreak: false });
    doc.font('Helvetica').fontSize(5.6).fillColor(C.ph)
      .text('PHOTO PENDING', bx, base + PS / 2 + 3, { width: PS, align: 'center', lineBreak: false });
  }

  /* code + price pill to the right of the photo */
  const tx = bx + PS + 4 * MM, tw = w - (tx - x) - pad;
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.crimson)
    .text(fitLine(doc, String(p.code), tw), tx, base + 1 * MM, { lineBreak: false });
  const price = String(p.price || '').trim();
  const priceTxt = price ? clean(price) : 'Price on request';
  doc.font('Helvetica-Bold').fontSize(7.2);
  const pillW = Math.min(tw, doc.widthOfString(priceTxt, { lineBreak: false }) + 6 * MM);
  const pillH = 6 * MM, pillY = base + 6.5 * MM;
  doc.roundedRect(tx, pillY, pillW, pillH, pillH / 2)
    .fillAndStroke(price ? C.walnut : C.photoBg, price ? C.walnut : C.line);
  doc.font('Helvetica-Bold').fontSize(7.2).fillColor(price ? '#FFFDF8' : C.muted)
    .text(fitLine(doc, priceTxt, pillW - 6 * MM), tx + 3 * MM, pillY + 1.9 * MM, { lineBreak: false });

  /* title + facts below the photo, full card width.
     NOTE: pdfkit only advances doc.y for wrapped (width) text — single-line
     text must advance the cursor manually, so the facts use an explicit
     line-height step instead of doc.y. */
  let by = base + PS + 3 * MM;
  doc.font('Times-Bold').fontSize(10).fillColor(C.dark);
  for (const ln of nameLines) { doc.text(ln, bx, by, { width: bw, lineBreak: false, height: Infinity }); by += nameLH; }
  by += 0.8 * MM;
  doc.font('Helvetica').fontSize(7.4).fillColor(C.text);
  for (const [k, v] of [['Material', p.material], ['Size', p.size], ['MOQ', p.moq]]) {
    doc.text(fitLine(doc, `${k}:  ${clean(v) || '—'}`, bw), bx, by, { lineBreak: false });
    by += factLH;
  }
}

async function selectedCataloguePdf(ctx, prods) {
  const c = catalogueContact(ctx);
  const crestBuf = await crestBuffer(ctx);
  const wmState = watermarkState(ctx);
  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: 'MORA HOME — Selected Products Catalogue', Author: 'MORA HOME', Subject: 'Visitor-selected product shortlist' },
  });
  const done = collect(doc);
  const W = doc.page.width, H = doc.page.height;
  const L = 14 * MM, R = W - 14 * MM, CW = R - L;
  const contentBottom = H - 16 * MM;

  /* preload every photo once so page breaks stay synchronous & fast */
  const photoOf = {};
  for (const p of prods) {
    const img = db.get('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort ASC LIMIT 1', [p.id]);
    photoOf[p.id] = img ? await imageBuffer(absFromRel(img.path)) : null;   // eslint-disable-line no-await-in-loop
  }

  const pages = [];
  for (let i = 0; i < prods.length; i += SEL.perPage) pages.push(prods.slice(i, i + SEL.perPage));

  for (let pi = 0; pi < pages.length; pi++) {
    if (pi > 0) doc.addPage();
    doc.rect(0, 0, W, H).fill(C.paper);
    await paintWatermark(doc, ctx, wmState);            // baked in, behind the grid
    const yTop = selHeader(doc, c, crestBuf, pi === 0);
    selFooter(doc, c);

    const cellW = (CW - SEL.gapX * (SEL.cols - 1)) / SEL.cols;
    const rows = Math.ceil(pages[pi].length / SEL.cols);
    const gridH = SEL.cellH * rows + SEL.gapY * (rows - 1);
    const gridTop = yTop + Math.max(0, (contentBottom - yTop - gridH) / 2);

    pages[pi].forEach((p, i) => {
      const col = i % SEL.cols, row = Math.floor(i / SEL.cols);
      const x = L + col * (cellW + SEL.gapX);
      const y = gridTop + row * (SEL.cellH + SEL.gapY);
      drawSelCard(doc, p, photoOf[p.id], x, y, cellW, SEL.cellH);
    });
  }
  doc.end();
  return done;
}

module.exports = { specPdf, cataloguePdf, mergeCover, selectedCataloguePdf, catalogueContact, watermarkSettings, WM_DEFAULTS, WM_KEY };
