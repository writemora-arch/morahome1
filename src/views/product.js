/** MORA HOME — product detail page. */
const db = require('../db');
const { esc, icon, productCard, placeholderArt, ornament } = require('../render');

function productBody(p) {
  const imgs = db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort ASC', [p.id]);
  const cat = db.get('SELECT * FROM categories WHERE slug = ?', [p.category_slug]);
  let specs = [];
  try { specs = JSON.parse(p.specs_json || '[]'); } catch { specs = []; }
  const related = db.all("SELECT * FROM products WHERE status='published' AND id != ? AND category_slug = ? ORDER BY updated_at DESC LIMIT 4", [p.id, p.category_slug]);
  const relImgs = related.length ? db.all(`SELECT * FROM product_images WHERE product_id IN (${related.map((r) => r.id).join(',')}) ORDER BY sort ASC`) : [];
  const relById = {};
  relImgs.forEach((i) => { (relById[i.product_id] = relById[i.product_id] || []).push(i); });

  const gallery = imgs.length
    ? imgs.map((im, i) => `<div class="gal-main${i === 0 ? ' active' : ''}"><img src="${esc(im.path)}" alt="${esc(p.name)} photo ${i + 1}" width="1200" height="1200" style="object-position:${50 + ((im.focal_x || .5) - .5) * 100}% ${50 + ((im.focal_y || .5) - .5) * 100}%"></div>`).join('')
    : `<div class="gal-main active">${placeholderArt(p)}</div>`;
  const thumbs = imgs.length > 1
    ? `<div class="gal-thumbs">${imgs.map((im, i) => `<button class="gal-thumb${i === 0 ? ' active' : ''}" data-gal="${i}" type="button"><img src="${esc(im.path)}" alt="" width="120" height="120" loading="lazy"></button>`).join('')}</div>` : '';

  return `
  <section class="section product-page">
    <div class="container breadcrumbs">
      <a href="/">Home</a> <span>/</span> <a href="/products">Products</a> <span>/</span>
      ${cat ? `<a href="/products?cat=${esc(cat.slug)}">${esc(cat.name)}</a> <span>/</span>` : ''}
      <strong>${esc(p.code)}</strong>
    </div>
    <div class="container product-layout">
      <div class="product-gallery">
        <div class="gal-stage">${gallery}${p.badge ? `<span class="card-badge badge-large">${esc(p.badge)}</span>` : ''}</div>
        ${thumbs}
      </div>
      <div class="product-info">
        <div class="p-code-row large">
          <p class="p-code large">${esc(p.code)}</p>
          <span class="p-price large${p.price ? '' : ' on-req'}">${esc(p.price || 'On request')}</span>
        </div>
        <h1 class="product-title">${esc(p.name)}</h1>
        ${ornament()}
        <div class="p-specs detail-specs">
          <span class="spec-line">Material: ${esc(p.material || '—')}</span>
          <span class="spec-line">Size: ${esc(p.size || '—')}</span>
          <span class="spec-line">MOQ: ${esc(p.moq || '—')}</span>
        </div>
        <p class="product-desc">${esc(p.description)}</p>
        <div class="product-ctas">
          <button class="btn btn-crimson enquiry-open" type="button" data-code="${esc(p.code)}" data-name="${esc(p.name)}">Send Enquiry</button>
          <button class="btn btn-whatsapp wa-open" type="button" data-product="${esc(p.code + ' ' + p.name)}">${icon('whatsapp', 18)} WhatsApp</button>
          <button class="btn btn-outline" type="button" data-add-enquiry="${esc(p.code)}">${icon('plus', 16)} Add to List</button>
        </div>
        <div class="product-meta-actions">
          <a class="meta-link" href="/products/${esc(p.code)}/spec-sheet" target="_blank" rel="noopener">${icon('download', 16)} Printable A4 Spec Sheet</a>
          <a class="meta-link" href="/products/${esc(p.code)}/spec-sheet.pdf">${icon('download', 16)} Download PDF Spec Sheet</a>
          <a class="meta-link" href="/catalogue/latest">${icon('download', 16)} Wholesale Catalogue</a>
        </div>
        <div class="spec-table-wrap">
          <h2 class="spec-table-title">Detailed Specifications</h2>
          <table class="spec-table">
            <tbody>
              <tr><th>Product Code</th><td>${esc(p.code)}</td></tr>
              <tr><th>Category</th><td>${esc(cat ? cat.name : '—')}</td></tr>
              ${p.price ? `<tr><th>Wholesale Price</th><td>${esc(p.price)}</td></tr>` : ''}
              ${specs.map((s) => `<tr><th>${esc(s.k)}</th><td>${esc(s.v)}</td></tr>`).join('')}
              <tr><th>Pricing</th><td>${p.price_on_request ? 'Price on request — share your quantity for a wholesale quote.' : 'Contact us for pricing.'}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
    ${related.length ? `
    <div class="container related-wrap">
      <p class="overline">YOU MAY ALSO LIKE</p>
      <h2 class="section-title">More in ${esc(cat ? cat.name : 'this range')}</h2>
      ${ornament()}
      <div class="product-grid grid-4">${related.map((r) => productCard(r, relById[r.id] || [])).join('')}</div>
    </div>` : ''}
  </section>`;
}

module.exports = { productBody };
