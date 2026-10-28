/** MORA HOME — printable A4 product spec sheet (HTML version, print.css makes it A4). */
const db = require('../db');
const { esc } = require('../render');
const assets = require('../lib/assets');

function specSheetHtml(p, ctx) {
  const imgs = db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort ASC LIMIT 1', [p.id]);
  let specs = []; try { specs = JSON.parse(p.specs_json || '[]'); } catch { specs = []; }
  const cat = db.get('SELECT * FROM categories WHERE slug = ?', [p.category_slug]);
  const c = ctx.contact; const brand = ctx.brand;
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><title>${esc(p.code)} — ${esc(p.name)} · Spec Sheet</title>
<meta name="robots" content="noindex, follow">
<link rel="stylesheet" href="${assets.url('css/print.css')}">
</head>
<body>
<div class="sheet">
  <header class="sheet-head">
    <div class="sheet-crest"><img src="${esc(brand.crestIvoryPath || brand.crestPath)}" alt="MORA HOME" width="1400" height="1082"></div>
    <div class="sheet-head-text">
      <h1>MORA HOME</h1>
      <p>Manufacturer &amp; Exporter of Handcrafted Metal &amp; Wooden Home Products</p>
      <p class="sheet-contact">${esc(c.address)} · ${esc(c.phone)} · ${esc(c.email1)}</p>
    </div>
    <div class="sheet-code">${esc(p.code)}</div>
  </header>
  <h2 class="sheet-title">${esc(p.name)}</h2>
  <div class="sheet-body">
    <div class="sheet-photo">
      ${imgs[0] ? `<img src="${esc(imgs[0].path)}" alt="${esc(p.name)}" width="1200" height="1200">` : `<div class="sheet-ph">PHOTO PENDING</div>`}
    </div>
    <div class="sheet-facts">
      <table><tbody>
        <tr><th>Product Code</th><td>${esc(p.code)}</td></tr>
        <tr><th>Category</th><td>${esc(cat ? cat.name : '—')}</td></tr>
        ${p.badge ? `<tr><th>Badge</th><td>${esc(p.badge)}</td></tr>` : ''}
        <tr><th>Material</th><td>${esc(p.material)}</td></tr>
        <tr><th>Size</th><td>${esc(p.size)}</td></tr>
        <tr><th>MOQ</th><td>${esc(p.moq)}</td></tr>
      </tbody></table>
      <p class="sheet-desc">${esc(p.description)}</p>
    </div>
  </div>
  <h3 class="sheet-sub">Detailed Specifications</h3>
  <table class="sheet-specs"><tbody>
    ${specs.map((s) => `<tr><th>${esc(s.k)}</th><td>${esc(s.v)}</td></tr>`).join('')}
    <tr><th>Pricing</th><td>${p.price_on_request ? 'Price on request — wholesale quotation against order quantity.' : 'Contact us for pricing.'}</td></tr>
  </tbody></table>
  <footer class="sheet-foot">
    <p>Generated from the MORA HOME wholesale system on ${new Date().toISOString().slice(0, 10)} · For wholesale / B2B enquiries only.</p>
    <p class="sheet-foot-contact">✉ ${esc(c.email1)} · ✉ ${esc(c.email2)} · ☎ ${esc(c.phone)} · WhatsApp +${esc(c.whatsapp)}</p>
  </footer>
</div>
<div class="print-bar no-print">
  <button id="printBtn" type="button">🖨️ Print / Save as PDF</button>
  <a href="/products/${esc(p.code)}/spec-sheet.pdf">⬇️ Download generated PDF</a>
  <a href="/products/${esc(p.code)}">← Back to product</a>
</div>
<script src="${assets.url('js/print.js')}"></script>
</body></html>`;
}

module.exports = { specSheetHtml };
