/** MORA HOME — /about and /contact pages (reuse homepage section renderers). */
const { RENDERERS, sections, content, visible } = require('./home');
const { esc, ornament, sectionHeader, icon } = require('../render');

function find(rows, key, mode) {
  const row = rows.find((r) => r.key === key);
  return row ? content(row, mode) : {};
}

function aboutBody(mode, ctx) {
  const rows = sections(mode);
  const a = find(rows, 'about', mode);
  const w = find(rows, 'why', mode);
  const g = find(rows, 'gifting', mode);
  return `
  <section class="page-hero">
    <div class="container">
      <p class="overline">${esc(a.overline || 'OUR STORY')}</p>
      <h1 class="page-title">${esc(a.heading || 'About MORA HOME')}</h1>
      ${ornament()}
    </div>
  </section>
  <section class="section">
    <div class="container about-grid">
      <div class="about-copy">
        ${(a.paragraphs || []).map((p) => `<p class="about-p">${esc(p.text)}</p>`).join('')}
        <div class="stats-row">
          ${(a.stats || []).map((s) => `<div class="stat"><span class="stat-value">${esc(s.value)}</span><span class="stat-label">${esc(s.label)}</span></div>`).join('')}
        </div>
      </div>
      <div class="about-media">
        ${a.image ? `<img src="${esc(a.image)}" alt="MORA HOME workshop" width="1200" height="1200" loading="lazy">` : `<div class="about-placeholder"><div class="ph-frame"><svg viewBox="0 0 200 200" class="ph-svg"><rect x="6" y="6" width="188" height="188" rx="14" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="100" y="105" text-anchor="middle" font-family="Georgia,serif" font-size="14" fill="currentColor" stroke="none">WORKSHOP PHOTO PENDING</text></svg></div></div>`}
      </div>
    </div>
  </section>
  ${RENDERERS.why(w, ctx)}
  ${RENDERERS.gifting(g, ctx)}`;
}

function contactBody(mode, ctx) {
  const rows = sections(mode);
  const c = find(rows, 'contact', mode);
  return `<div class="contact-page">` + RENDERERS.contact(c, ctx, { h1: true }) + `</div>`;
}

function legalBody(title, paragraphs) {
  return `<section class="page-hero"><div class="container">
    <p class="overline">MORA HOME POLICIES</p><h1 class="page-title">${esc(title)}</h1>${ornament()}
  </div></section>
  <section class="section"><div class="container legal-copy">
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
  </div></section>`;
}

module.exports = { aboutBody, contactBody, legalBody };
