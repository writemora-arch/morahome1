/**
 * MORA HOME — auto-generated A4 PDFs (pdfkit).
 *
 * specPdf(p, ctx)      → single-product spec sheet (1:1 copy of the printable HTML sheet)
 * cataloguePdf(ctx)    → wholesale catalogue: branded cover + one spec page per
 *                        published product (audit H2 — /catalogue/latest is never a dead end)
 *
 * Layout: crest + MORA HOME header, red code, walnut rule, title, rounded photo +
 * facts table, description, "Detailed Specifications" striped table, footer contacts.
 */
const PDFDocument = require('pdfkit');
const fs = require('fs');
const db = require('../db');
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

/** Draws one product's spec sheet onto `doc`'s CURRENT page (may add pages for long specs). */
async function drawSpecPage(doc, p, ctx, crestBuf) {
  const c = ctx.contact;
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
      .text(`${c.email1} · ${c.email2} · ${c.phone} · WhatsApp +${c.whatsapp}`, L, fy + 20, { width: CW, lineBreak: false });
  };

  paper();

  /* ---------- header ---------- */
  const crestW = 30 * MM;
  if (crestBuf) { try { doc.image(crestBuf, L, TOP, { width: crestW }); } catch { /* skip */ } }
  const tx = L + crestW + 14;
  doc.font('Times-Bold').fontSize(22).fillColor(C.dark)
    .text('MORA HOME', tx, TOP + 4, { characterSpacing: 4, lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(C.muted)
    .text('Manufacturer & Exporter of Handcrafted Metal & Wooden Home Products', tx, TOP + 34, { width: CW - crestW - 90 });
  doc.fontSize(8.5).text(clean(`${c.address} · ${c.phone} · ${c.email1}`), tx, doc.y + 3, { width: CW - crestW - 90 });
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
  specs.forEach((s, i) => {
    const k = clean(s.k), v = clean(s.v);
    doc.font('Helvetica').fontSize(8.5);
    const h = Math.max(doc.heightOfString(v, { width: CW - kW - 16 }), doc.heightOfString(k, { width: kW - 16 }), 10) + 10;
    if (y + h > H - 16 * MM - FOOT_H - 10) { footer(); doc.addPage(); paper(); y = TOP; sub(); }
    if (i % 2 === 0) doc.rect(L, y, CW, h).fill(C.stripe);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(C.walnut).text(k, L + 8, y + 5, { width: kW - 16 });
    doc.font('Helvetica').fillColor(C.text).text(v, L + kW + 8, y + 5, { width: CW - kW - 16 });
    y += h;
    doc.moveTo(L, y).lineTo(R, y).lineWidth(0.6).strokeColor(C.line).stroke();
  });

  footer();
}

/** Branded catalogue cover page (audit H2). */
function drawCoverPage(doc, ctx, crestBuf, prods) {
  const c = ctx.contact;
  const W = doc.page.width, H = doc.page.height;
  doc.rect(0, 0, W, H).fill(C.paper);
  doc.rect(0, 0, W, 9 * MM).fill(C.walnut);
  doc.rect(0, H - 9 * MM, W, 9 * MM).fill(C.walnut);

  let y = 30 * MM;
  if (crestBuf) {
    const cw = 52 * MM, ch = cw * CREST_RATIO;
    try { doc.image(crestBuf, (W - cw) / 2, y, { width: cw }); } catch { /* skip */ }
    y += ch + 8 * MM;
  }
  doc.font('Times-Bold').fontSize(36).fillColor(C.dark)
    .text('MORA HOME', 0, y, { align: 'center', characterSpacing: 6, lineBreak: false });
  y += 15 * MM;
  doc.font('Helvetica').fontSize(11).fillColor(C.muted)
    .text('Manufacturer & Exporter of Handcrafted Metal & Wooden Home Products', 0, y, { align: 'center', lineBreak: false });
  y += 7 * MM;
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
    .text('Moradabad, Uttar Pradesh · India', 0, y, { align: 'center', lineBreak: false });
  y += 12 * MM;

  /* centred walnut rule */
  doc.moveTo(W / 2 - 30 * MM, y).lineTo(W / 2 + 30 * MM, y).lineWidth(1.4).strokeColor(C.walnut).stroke();
  y += 10 * MM;

  doc.font('Helvetica-Bold').fontSize(19).fillColor(C.crimson)
    .text('WHOLESALE CATALOGUE', 0, y, { align: 'center', characterSpacing: 3, lineBreak: false });
  y += 9 * MM;
  const edition = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  doc.font('Helvetica').fontSize(10.5).fillColor(C.walnut)
    .text(`Edition — ${edition}`, 0, y, { align: 'center', lineBreak: false });
  y += 16 * MM;

  /* what's inside */
  const cats = db.all(`SELECT c.name, c.slug, COUNT(p.id) AS n
      FROM categories c LEFT JOIN products p ON p.category_slug = c.slug AND p.status = 'published'
      WHERE c.visible = 1 GROUP BY c.id, c.name, c.slug ORDER BY c.sort ASC`);
  const listed = cats.filter((x) => x.n > 0);
  if (listed.length) {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.muted)
      .text('IN THIS EDITION', 0, y, { align: 'center', characterSpacing: 2.5, lineBreak: false });
    y += 7 * MM;
    doc.font('Helvetica').fontSize(10.5).fillColor(C.text);
    listed.forEach((x) => {
      doc.text(`${x.name} — ${x.n} design${x.n === 1 ? '' : 's'}`, 0, y, { align: 'center', lineBreak: false });
      y += 5.6 * MM;
    });
    y += 2 * MM;
    doc.font('Helvetica-Oblique').fontSize(9.5).fillColor(C.muted)
      .text(`${prods.length} curated design${prods.length === 1 ? '' : 's'} · 500+ designs in our repertoire — tell us what you need and we will quote.`,
        30 * MM, y, { align: 'center', width: W - 60 * MM });
    y = doc.y + 8 * MM;
  }

  /* contact block */
  const by = H - 34 * MM;
  doc.moveTo(30 * MM, by - 6 * MM).lineTo(W - 30 * MM, by - 6 * MM).lineWidth(0.75).strokeColor(C.line).stroke();
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(C.walnut)
    .text(clean(`${c.phone}  ·  WhatsApp +${c.whatsapp}`), 0, by, { align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(9.5).fillColor(C.muted)
    .text(clean(`${c.email1}  ·  ${c.email2}`), 0, by + 5 * MM, { align: 'center', lineBreak: false });
  doc.fontSize(8.5).text(clean(c.address), 0, by + 10 * MM, { align: 'center', lineBreak: false });
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
  const doc = new PDFDocument({ size: 'A4', margin: 0, info: { Title: `${p.code} — ${p.name}`, Author: 'MORA HOME' } });
  const done = collect(doc);
  await drawSpecPage(doc, p, ctx, crestBuf);
  doc.end();
  return done;
}

/** Full wholesale catalogue PDF: cover + spec page per published product. */
async function cataloguePdf(ctx) {
  const prods = db.all("SELECT * FROM products WHERE status = 'published' ORDER BY category_slug ASC, code ASC");
  const crestBuf = await crestBuffer(ctx);
  const doc = new PDFDocument({
    size: 'A4', margin: 0,
    info: { Title: 'MORA HOME — Wholesale Catalogue', Author: 'MORA HOME', Subject: 'Auto-generated wholesale catalogue' },
  });
  const done = collect(doc);
  drawCoverPage(doc, ctx, crestBuf, prods);
  for (const p of prods) {
    doc.addPage();
    await drawSpecPage(doc, p, ctx, crestBuf);   // eslint-disable-line no-await-in-loop
  }
  doc.end();
  return done;
}

module.exports = { specPdf, cataloguePdf };
