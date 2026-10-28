/** MORA HOME — homepage section renderers (order & visibility from DB). */
const db = require('../db');
const { esc, ornament, sectionHeader, icon, productCard, placeholderArt } = require('../render');

function sections(mode = 'live') {
  return db.all('SELECT * FROM sections ORDER BY ' + (mode === 'draft' ? 'draft_order' : 'live_order') + ' ASC');
}
function content(row, mode) {
  try { return JSON.parse(mode === 'draft' ? row.draft_json : row.live_json) || {}; } catch { return {}; }
}
const visible = (row, mode) => (mode === 'draft' ? row.draft_visible : row.live_visible) === 1;

/* ---------------- individual section renderers ---------------- */
function hero(c, ctx) {
  const slides = (c.slides || []).slice(0, 6);
  if (!slides.length) return '';
  return `<section class="hero" data-edit-section="hero">
    <div class="hero-track" id="heroTrack">
      ${slides.map((s, i) => `
      <div class="hero-slide${i === 0 ? ' active' : ''}" ${s.image ? `style="background-image:url('${esc(s.image)}')"` : ''}>
        ${s.image ? '' : `<div class="hero-placeholder" aria-hidden="true"><img src="${esc(ctx.brand.crestPath)}" alt="" width="1400" height="1082"></div>`}
        <div class="container hero-copy">
          ${s.overline ? `<p class="overline light-on-cream" data-edit="hero|slides">${esc(s.overline)}</p>` : ''}
          ${i === 0
            ? `<h1 data-edit="hero|headline">${esc(s.headline)}</h1>`
            : `<h2 class="hero-alt-headline" data-edit="hero|headline">${esc(s.headline)}</h2>`}
          ${ornament()}
          <p class="hero-sub" data-edit="hero|subtitle">${esc(s.subtitle)}</p>
          <div class="hero-ctas">
            ${s.cta1_text ? `<a class="btn btn-crimson" href="${esc(s.cta1_link || '/products')}">${esc(s.cta1_text)}</a>` : ''}
            ${s.cta2_text ? `<a class="btn btn-outline" href="${esc(s.cta2_link || '/contact')}">${esc(s.cta2_text)}</a>` : ''}
          </div>
        </div>
      </div>`).join('')}
    </div>
    ${slides.length > 1 ? `<div class="hero-dots" id="heroDots">${slides.map((_, i) => `<button class="hero-dot${i === 0 ? ' active' : ''}" data-slide="${i}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : ''}
  </section>`;
}

function audience(c, ctx) {
  const cards = c.cards || [];
  const pairs = [];
  for (let i = 0; i < cards.length; i += 2) pairs.push(cards.slice(i, i + 2));
  const wm = ctx && ctx.theme && ctx.theme.watermarkOn && ctx.brand
    ? `<img class="audience-watermark" src="${esc(ctx.brand.crestPath)}" alt="" aria-hidden="true" width="1400" height="1082">` : '';
  return `<section class="section" data-edit-section="audience">
    <div class="container">
      ${sectionHeader(c.overline, c.heading, { edit: 'audience|heading' })}
      <p class="section-intro" data-edit="audience|intro">${esc(c.intro)}</p>
      <div class="audience-grid">
        ${pairs.map((pair) => `
        <div class="audience-pair">
          ${wm}
          ${pair.map((card) => `
          <div class="audience-card">
            <span class="audience-icon">${esc(card.icon || '🤝')}</span>
            <h3>${esc(card.title)}</h3>
            <p>${esc(card.desc)}</p>
          </div>`).join('')}
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}
function categories(c) {
  const cats = db.all('SELECT * FROM categories WHERE visible = 1 ORDER BY sort ASC');
  return `<section class="section section-alt" data-edit-section="categories">
    <div class="container">
      ${sectionHeader(c.overline, c.heading, { edit: 'categories|heading' })}
      <div class="cat-grid">
        ${cats.map((cat) => `
        <a class="cat-card" href="/products?cat=${encodeURIComponent(cat.slug)}">
          <div class="cat-media">${cat.image ? `<img src="${esc(cat.image)}" alt="${esc(cat.name)}" width="1200" height="1200" loading="lazy">` : placeholderArt({ code: cat.name.toUpperCase() }, { label: 'Category photo pending' })}</div>
          <h3 class="cat-title">${esc(cat.name)}</h3>
          <p class="cat-sub">${esc(cat.subtitle)}</p>
          <span class="btn btn-outline btn-small">${esc(c.button_text || 'View Products')}</span>
        </a>`).join('')}
      </div>
    </div>
  </section>`;
}

function featured(c) {
  const prods = db.all("SELECT * FROM products WHERE featured = 1 AND status = 'published' ORDER BY updated_at DESC LIMIT 8");
  const imgs = prods.length ? db.all(`SELECT * FROM product_images WHERE product_id IN (${prods.map((p) => p.id).join(',')}) ORDER BY sort ASC`) : [];
  const byId = {};
  imgs.forEach((i) => { (byId[i.product_id] = byId[i.product_id] || []).push(i); });
  if (!prods.length) return '';
  return `<section class="section" data-edit-section="featured">
    <div class="container">
      ${sectionHeader(c.overline, c.heading, { edit: 'featured|heading' })}
      <div class="featured-scroller">
        ${prods.map((p) => productCard(p, byId[p.id] || [])).join('')}
      </div>
      <div class="center-cta"><a class="btn btn-outline" href="${esc(c.button_link || '/products')}">${esc(c.button_text || 'View All Products →')}</a></div>
    </div>
  </section>`;
}

function why(c) {
  return `<section class="section section-alt" data-edit-section="why">
    <div class="container">
      ${sectionHeader(c.overline, c.heading, { edit: 'why|heading' })}
      <div class="why-grid">
        ${(c.cards || []).map((card) => `
        <div class="why-card">
          <span class="why-icon">${icon(card.icon || 'shield', 36)}</span>
          <h3>${esc(card.title)}</h3>
          <p>${esc(card.desc)}</p>
        </div>`).join('')}
      </div>
    </div>
  </section>`;
}

function about(c) {
  return `<section class="section" data-edit-section="about">
    <div class="container about-grid">
      <div class="about-copy">
        ${sectionHeader(c.overline, c.heading, { edit: 'about|heading' })}
        ${(c.paragraphs || []).map((p) => `<p class="about-p">${esc(p.text)}</p>`).join('')}
        <a class="btn btn-outline" href="${esc(c.button_link || '/about')}">${esc(c.button_text || 'Learn More About Us')}</a>
        <div class="stats-row">
          ${(c.stats || []).map((s) => `<div class="stat"><span class="stat-value">${esc(s.value)}</span><span class="stat-label">${esc(s.label)}</span></div>`).join('')}
        </div>
      </div>
      <div class="about-media">
        ${c.image ? `<img src="${esc(c.image)}" alt="MORA HOME workshop" width="1200" height="1200" loading="lazy">` : `<div class="about-placeholder">${placeholderArt({ code: 'MORA HOME' }, { label: 'Workshop photo pending' })}</div>`}
      </div>
    </div>
  </section>`;
}

function gifting(c, ctx) {
  return `<section class="gifting-banner" data-edit-section="gifting">
    ${ctx.theme.watermarkOn ? `<img class="gifting-watermark" src="${esc(ctx.brand.crestPath)}" alt="" aria-hidden="true" width="1400" height="1082">` : ''}
    <div class="container gifting-inner">
      <h2 data-edit="gifting|heading">${esc(c.heading)}</h2>
      ${ornament()}
      <p data-edit="gifting|subtitle">${esc(c.subtitle)}</p>
      <a class="btn btn-light-pill" href="${esc(c.button_link || '/contact')}">${esc(c.button_text || 'Get a Custom Quote')}</a>
    </div>
  </section>`;
}

function contact(c, ctx, opts = {}) {
  const ct = ctx.contact;
  const hTag = opts.h1 ? 'h1' : 'h2';   // the /contact page uses H1 (audit H6); homepage section stays H2
  return `<section class="section contact-section" id="contact" data-edit-section="contact">
    <div class="container contact-inner">
      <img class="contact-crest" src="${esc(ctx.brand.crestPath)}" alt="MORA HOME crest" width="1400" height="1082">
      <${hTag} class="section-title" data-edit="contact|heading">${esc(c.heading)}</${hTag}>
      ${ornament()}
      <p class="section-intro">${esc(c.subtitle)}</p>
      <div class="contact-actions">
        <a class="btn btn-outline btn-contact" href="mailto:${esc(ct.email1)}">${icon('mail', 18)}<span>Write to Us · ${esc(ct.email1)}</span></a>
        <a class="btn btn-outline btn-contact" href="mailto:${esc(ct.email2)}">${icon('mail', 18)}<span>Ask MORA · ${esc(ct.email2)}</span></a>
        <a class="btn btn-outline btn-contact" href="tel:${esc(ct.phone.replace(/[^+\d]/g, ''))}">${icon('phone', 18)}<span>Call Now · ${esc(ct.phone)}</span></a>
        <button class="btn btn-outline btn-contact wa-open" type="button">${icon('whatsapp', 18)}<span>Chat on WhatsApp</span></button>
      </div>
      <p class="contact-address">${icon('pin', 16)} ${esc(ct.address)}</p>
      <div class="contact-grid contact-grid-single">
        <div class="map-wrap">
          <iframe title="MORA HOME location map" src="${esc(ct.mapEmbed)}" width="600" height="400" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>
          <a class="btn btn-outline btn-small map-open" href="${esc(ct.mapLink)}" target="_blank" rel="noopener">Open in Maps ↗</a>
        </div>
      </div>
    </div>
  </section>`;
}

const RENDERERS = { hero, audience, categories, featured, why, about, gifting, contact };

function homeBody(mode, ctx) {
  return sections(mode).filter((r) => visible(r, mode)).map((row) => {
    const fn = RENDERERS[String(row.key).replace(/_\d+$/, '')];
    if (!fn) return '';
    return fn(content(row, mode), ctx);
  }).join('\n');
}

module.exports = { homeBody, RENDERERS, sections, content, visible };
