/** MORA HOME — shared server-side render helpers (esc, icons, ornament, placeholders, product card). */

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Signature ornamental divider: ──── ❧ ─── */
function ornament() {
  return `<div class="ornament" aria-hidden="true">
    <span class="ornament-line"></span>
    <svg class="ornament-motif" viewBox="0 0 48 24" width="46" height="23" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round">
      <path d="M24 4c-3.4 2.6-5.2 5.4-5.2 8.4 0 3.4 2.3 6 5.2 7.6 2.9-1.6 5.2-4.2 5.2-7.6 0-3-1.8-5.8-5.2-8.4z"/>
      <path d="M24 8.6c-1.6 1.4-2.4 2.8-2.4 4.2 0 1.7 1 3 2.4 3.9 1.4-.9 2.4-2.2 2.4-3.9 0-1.4-.8-2.8-2.4-4.2z"/>
      <path d="M15.5 12c-2.6-.6-4.8-.2-6.6 1.2M32.5 12c2.6-.6 4.8-.2 6.6 1.2"/>
      <circle cx="24" cy="2.6" r="1.1" fill="currentColor" stroke="none"/>
    </svg>
    <span class="ornament-line"></span>
  </div>`;
}

function sectionHeader(overline, heading, opts = {}) {
  return `<div class="section-head${opts.light ? ' light' : ''}">
    ${overline ? `<p class="overline">${esc(overline)}</p>` : ''}
    <h2 class="section-title" ${opts.edit ? `data-edit="${opts.edit}"` : ''}>${esc(heading)}</h2>
    ${ornament()}
  </div>`;
}

/* ---------------- inline icon set (line style, walnut) ---------------- */
const ICONS = {
  factory: '<path d="M4 20V9l6 4V9l6 4V9l6 4v7H4z"/><path d="M8 20v-4h3v4M15 20v-4h3v4"/>',
  hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12"/><path d="M11 12V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M14 12V5.5a1.5 1.5 0 0 1 3 0V13"/><path d="M17 13v-1.5a1.5 1.5 0 0 1 3 0V16a6 6 0 0 1-6 6h-2c-3 0-4.6-1.2-6.2-3.6L4 15c-.8-1.2.6-2.8 2-2l2 1.6"/>',
  gift: '<rect x="4" y="10" width="16" height="10" rx="1.5"/><path d="M4 10h16M12 10v10"/><path d="M12 10s-4.5-.6-4.5-3.4C7.5 4.6 9 4 10 4c2 0 2 3.4 2 6zM12 10s4.5-.6 4.5-3.4C16.5 4.6 15 4 14 4c-2 0-2 3.4-2 6z"/>',
  truck: '<path d="M3 16V6h11v10"/><path d="M14 9h4l3 3v4h-3"/><circle cx="7.5" cy="17.5" r="1.8"/><circle cx="16.5" cy="17.5" r="1.8"/><path d="M9.3 17.5H14.7M3 16h2.7M18.3 16H21"/>',
  tag: '<path d="M12.6 3H20v7.4L11 19.4a2 2 0 0 1-2.8 0L3.6 14.8a2 2 0 0 1 0-2.8L12.6 3z"/><circle cx="16" cy="7" r="1.6"/>',
  shield: '<path d="M12 3l7 3v6c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  phone: '<path d="M6 3h4l1.5 4.5-2.2 1.6a12 12 0 0 0 5.6 5.6l1.6-2.2L21 14v4a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3z"/>',
  pin: '<path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  whatsapp: '<path d="M12 3a9 9 0 0 0-7.8 13.5L3 21l4.6-1.2A9 9 0 1 0 12 3z"/><path d="M8.8 9.2c.3-.7.6-.7 1-.7l.8.1c.3.1.5.7.7 1.2.2.4.1.7-.1 1l-.5.6c-.2.2-.2.4 0 .7a6 6 0 0 0 2.9 2.6c.3.1.5.1.7-.1l.6-.7c.2-.3.5-.3.8-.2l1.5.7c.3.2.4.4.4.7 0 .9-.7 1.6-1.5 1.7-1.4.2-3.5-.6-5.3-2.2-1.6-1.5-2.6-3.3-2.5-4.6 0-.4.2-.8.5-1.1z" fill="currentColor" stroke="none"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4 18-7z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
  sliders: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  list: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.3" cy="6.7" r="0.9" fill="currentColor" stroke="none"/>',
  facebook: '<path d="M15.5 4H13a3.5 3.5 0 0 0-3.5 3.5V10H7v3.5h2.5V21h3.5v-7.5H16l.6-3.5h-3.1V8a1 1 0 0 1 1-1h1.5V4z"/>',
  linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7.2 10v7M7.2 7.1v.1"/><path d="M11 17v-4.2a2.4 2.4 0 0 1 4.8 0V17"/>',
  youtube: '<rect x="2.8" y="6" width="18.4" height="12" rx="3.4"/><path d="M10.4 9.4l5 2.6-5 2.6z"/>',
  store: '<path d="M4 10.5V20h16v-9.5"/><path d="M3 6l1.8-3h14.4L21 6c0 1.9-1.4 3-2.8 3S15.4 7.9 15.4 6c0 1.9-1.4 3-3.4 3S8.6 7.9 8.6 6C8.6 7.9 7.2 9 5.8 9S3 7.9 3 6z"/><path d="M9.5 20v-5h5v5"/>',
};
function icon(name, size = 24, cls = '') {
  return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

/** Branded CSS/SVG placeholder used whenever no photo has been uploaded yet. */
function placeholderArt(p, opts = {}) {
  const code = esc(p && p.code ? p.code : 'MORA HOME');
  const label = opts.label || 'Photo Pending — Upload in Admin';
  return `<div class="ph-frame" role="img" aria-label="MORA HOME branded placeholder for ${code}">
    <svg viewBox="0 0 200 200" class="ph-svg" aria-hidden="true">
      <rect x="6" y="6" width="188" height="188" rx="14" fill="none" stroke="currentColor" stroke-width="1.4"/>
      <rect x="14" y="14" width="172" height="172" rx="10" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="3 4"/>
      <g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round">
        <path d="M100 46c-16 12-24 25-24 39 0 16 11 28 24 35 13-7 24-19 24-35 0-14-8-27-24-39z"/>
        <path d="M100 66c-7.5 6.5-11.5 13-11.5 19.5 0 8 4.8 14 11.5 18.3 6.7-4.3 11.5-10.3 11.5-18.3 0-6.5-4-13-11.5-19.5z"/>
        <path d="M62 100c-10-3-19-1.5-26 4M138 100c10-3 19-1.5 26 4"/>
        <circle cx="100" cy="38" r="2.4" fill="currentColor" stroke="none"/>
        <path d="M52 52c6 2 10 6 12 12M148 52c-6 2-10 6-12 12M52 148c6-2 10-6 12-12M148 148c-6-2-10-6-12-12"/>
      </g>
      <text x="100" y="146" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="17" letter-spacing="2" fill="currentColor" stroke="none">${code}</text>
      <text x="100" y="163" text-anchor="middle" font-family="Verdana, sans-serif" font-size="7.4" letter-spacing="1" fill="currentColor" stroke="none" opacity=".8">${esc(label.toUpperCase())}</text>
    </svg>
  </div>`;
}

function productImage(p, imgs) {
  const img = imgs && imgs.length ? imgs[0] : null;
  if (img) {
    const fx = 50 + ((img.focal_x || 0.5) - 0.5) * 100;
    const fy = 50 + ((img.focal_y || 0.5) - 0.5) * 100;
    return `<img class="card-img" src="${esc(img.path)}" alt="${esc(p.name)}" width="1200" height="1200" loading="lazy" style="object-position:${fx}% ${fy}%">`;
  }
  return placeholderArt(p);
}

/** The pixel-perfect product card used on /products and homepage Featured. */
function productCard(p, imgs = []) {
  const badge = p.badge && p.badge.trim()
    ? `<span class="card-badge">${esc(p.badge)}</span>` : '';
  return `<article class="p-card" data-code="${esc(p.code)}">
    <div class="p-card-media">
      ${badge}
      <button class="card-quick-add" type="button" data-add-enquiry="${esc(p.code)}" title="Add to Enquiry List" aria-label="Add ${esc(p.name)} to enquiry list">${icon('plus', 16)}</button>
      <a class="card-media-link" href="/products/${encodeURIComponent(p.code)}" aria-label="View ${esc(p.name)}">${productImage(p, imgs)}</a>
    </div>
    <div class="p-card-body">
      <div class="p-code-row">
        <p class="p-code">${esc(p.code)}</p>
        <span class="p-price${p.price ? '' : ' on-req'}" title="${p.price ? 'Wholesale price' : 'Price on request'}">${esc(p.price || 'On request')}</span>
      </div>
      <h3 class="p-title"><a href="/products/${encodeURIComponent(p.code)}">${esc(p.name)}</a></h3>
      <div class="p-specs">
        <span class="spec-line">Material: ${esc(p.material || '—')}</span>
        <span class="spec-line">Size: ${esc(p.size || '—')}</span>
        <span class="spec-line">MOQ: ${esc(p.moq || '—')}</span>
      </div>
    </div>
    <div class="p-card-foot">
      <button class="btn btn-crimson btn-block enquiry-open" type="button" data-code="${esc(p.code)}" data-name="${esc(p.name)}">Send Enquiry</button>
    </div>
  </article>`;
}

const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

module.exports = { esc, ornament, sectionHeader, icon, placeholderArt, productCard, productImage, normCode, ICONS };
