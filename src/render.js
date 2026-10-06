// Public site renderer — every visible string/link/image comes from the DB (nothing hardcoded for visitors)
const { db, getSetting } = require('./db');
const { esc, escAttr: eA, inr, phoneHref, fmtPhone, waHref, slugify } = require('./util');
const { mediaUrls } = require('./media');

const cache = { v: 0, data: null, time: 0 };
function siteData() {
  const t = Date.now();
  if (cache.data && t - cache.time < 3000) return cache.data;
  const brand = getSetting('brand', {});
  const business = getSetting('business', {});
  const seo = getSetting('seo', {});
  const sitec = getSetting('site', {});
  const navCfg = getSetting('navbar', {});
  const footer = getSetting('footer', {});
  const wa = getSetting('whatsapp', {});
  const commerce = getSetting('commerce', {});
  const nav = db.prepare('SELECT * FROM nav_items WHERE visible=1 ORDER BY sort').all();
  const cats = db.prepare('SELECT * FROM categories WHERE active=1 AND deleted_at IS NULL ORDER BY sort').all();
  cache.data = { brand, business, seo, sitec, navCfg, footer, wa, commerce, nav, cats };
  cache.time = t;
  return cache.data;
}
function invalidateCache() { cache.time = 0; }

/* ---------- icons (inline SVG, no external assets) ---------- */
const P = {
  search: 'M11 5a6 6 0 1 0 0 12 6 6 0 0 0 0-12Zm-8 6a8 8 0 1 1 14.9 4L21 18.6 18.6 21l-3.1-3.1A8 8 0 0 1 3 11Z',
  list: 'M4 6h16v2H4V6Zm0 5h16v2H4v-2Zm0 5h10v2H4v-2Z',
  compare: 'M7 3 3 7l4 4V8h9V6H7V3Zm10 18 4-4-4-4v3H8v2h9v3Z',
  whatsapp: 'M12 2a10 10 0 0 0-8.6 15L2 22l5.2-1.4A10 10 0 1 0 12 2Zm0 2a8 8 0 1 1-4.1 14.9l-.3-.2-3 .8.8-2.9-.2-.3A8 8 0 0 1 12 4Zm-3 3.5c-.2 0-.5.1-.7.3-.6.6-1.2 1.6-1 2.9.2 1.2 1 2.6 2.2 3.9 1.5 1.6 3 2.3 4.2 2.6.8.2 1.5.1 2-.1.5-.2 1.1-.6 1.3-1.2.1-.5.1-.9 0-1.1-.1-.1-.3-.2-.5-.3l-1.8-.8c-.3-.1-.5-.1-.7.1l-.5.6c-.2.2-.4.2-.6.1-.6-.3-1.2-.7-1.7-1.3-.5-.5-.9-1.1-1.1-1.6-.1-.2 0-.5.1-.6l.5-.6c.1-.2.1-.4 0-.6l-.8-1.9c-.2-.4-.4-.5-.6-.5Z',
  phone: 'M6.6 3h3l1.5 4-2 1.5a12 12 0 0 0 5.4 5.4L16 12l4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 1.5 5.2 2 2 0 0 1 3.5 3h3.1Z',
  mail: 'M3 5h18a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm9 7.3L4.2 7v10h15.6V7L12 12.3Z',
  pin: 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7Zm0 9.5A2.5 2.5 0 1 1 12 6a2.5 2.5 0 0 1 0 5.5Z',
  download: 'M12 3v10m0 0 4-4m-4 4L8 9M4 17v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3',
  share: 'M18 8a3 3 0 1 0-2.8-4L8.6 6.2a3 3 0 0 0 0 3.6l6.6 2.2A3 3 0 1 0 15 13l-6.6-2.2a3 3 0 1 1 0-3.6L15 5a3 3 0 0 0 3 3Z',
  boxes: 'M12 2 3 7v10l9 5 9-5V7l-9-5Zm0 2.3 6.7 3.7L12 11.7 5.3 8 12 4.3ZM5 9.7l6 3.3v6.7l-6-3.3V9.7Zm14 0v6.7l-6 3.3v-6.7l6-3.3Z',
  store: 'M4 4h16l1 5a3 3 0 0 1-3 3 3 3 0 0 1-3-2.5A3 3 0 0 1 12 12a3 3 0 0 1-3-2.5A3 3 0 0 1 6 12a3 3 0 0 1-2.9-3L4 4Zm1 9.7V20h14v-6.3a4.7 4.7 0 0 1-4-1.7 4.7 4.7 0 0 1-3 1.5 4.7 4.7 0 0 1-3-1.5 4.7 4.7 0 0 1-4 1.7ZM7 16h6v2H7v-2Z',
  cart: 'M7 18a2 2 0 1 1 0 4 2 2 0 0 1 0-4Zm10 0a2 2 0 1 1 0 4 2 2 0 0 1 0-4ZM3 4h2l2.6 11.4a1 1 0 0 0 1 .6H19a1 1 0 0 0 1-.8l2-8.2H7.1',
  gift: 'M12 4c1.5-2.6 5-2.2 5 .4s-3.4 2-5 1.2c-1.6.8-5 1.4-5-1.2s3.5-3 5-.4ZM4 8h16v3h-1v9H5v-9H4V8Zm7 2v8h2v-8h-2Z',
  return: 'M12 3 2 12l3 3 7-7 7 7 3-3L12 3Zm0 4.2 5.8 5.8-1.4 1.4L12 10l-4.4 4.4L6.2 13 12 7.2Z',
  festival: 'm12 2 2.1 5.6L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.9-.4L12 2Z',
  factory: 'M3 21V10l6 4v-4l6 4V8l4-3v16H3Zm2-2h3v-2H5v2Zm5 0h3v-2h-3v2Zm5 0h3v-2h-3v2Z',
  hand: 'M12 2a3 3 0 0 1 3 3v5h1V6a2 2 0 1 1 4 0v7a8 8 0 0 1-8 8h-1a7 7 0 0 1-5.7-2.9l-2.6-3.6a1.8 1.8 0 0 1 2.9-2.1L7 13V7a2 2 0 1 1 4 0v3h1V5a3 3 0 0 1 0-3Z',
  truck: 'M1 5h13v11H1V5Zm13 3h4l3 4v4h-2a2.5 2.5 0 0 1-5 0h-2v-8Zm-8 10.5A1.5 1.5 0 1 0 6 15a1.5 1.5 0 0 0 0 3.5Zm11 0a1.5 1.5 0 1 0 0-3.5 1.5 1.5 0 0 0 0 3.5Z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1 13-3.5-3.5L9 10l2 2 4.5-4.5L17 9l-6 6Z',
  pencil: 'M16.7 3.3a2.4 2.4 0 0 1 3.4 0l.6.6a2.4 2.4 0 0 1 0 3.4L9 19l-5 1 1-5L16.7 3.3Z',
  arrow: 'M5 12h13m-6-7 7 7-7 7',
  star: 'm12 2 2.4 6.3 6.6.3-5.1 4.2 1.7 6.4L12 15.4 6.4 19.2l1.7-6.4L3 8.6l6.6-.3L12 2Z',
  quote: 'M7 5h4v6c0 4-2 6.5-5 8l-1-1.6c2-1 3-2.2 3.2-3.9H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Zm10 0h4v6c0 4-2 6.5-5 8l-1-1.6c2-1 3-2.2 3.2-3.9h-2.2a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  close: 'm6 6 12 12M18 6 6 18',
  menu: 'M4 7h16M4 12h16M4 17h16',
  zoom: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-9 7a9 9 0 1 1 16.2 5.5l4.1 4.1-1.4 1.4-4.1-4.1A9 9 0 0 1 2 11Zm9-4v3h3v2h-3v3H9v-3H6v-2h3V7h2Z',
  check: 'm5 12 5 5L20 7',
  chev: 'm9 6 6 6-6 6'
};
function icon(name, size = 20, cls = '') {
  const d = P[name] || P.star;
  const stroke = ['download', 'phone', 'close', 'menu', 'arrow', 'chev', 'check', 'truck'].includes(name);
  return `<svg class="ic ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="${stroke ? 'none' : 'currentColor'}" ${stroke ? 'stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' : ''} aria-hidden="true"><path d="${d}"/></svg>`;
}

/* ---------- media rendering ---------- */
function mediaOf(id) {
  if (!id) return null;
  const m = db.prepare('SELECT * FROM media_assets WHERE id=? AND deleted_at IS NULL').get(id);
  return m ? mediaUrls(m) : null;
}
function pic(media, { sizes = '100vw', cls = '', alt = '', eager = false, width, height } = {}) {
  if (!media) return '';
  const a = eA(alt || media.alt || '');
  const dims = width && height ? ` width="${width}" height="${height}"` : (media.width && media.height ? ` width="${media.width}" height="${media.height}"` : '');
  const blur = media.blur ? ` style="background:url('${eA(media.blur)}') center/cover no-repeat"` : '';
  const srcset = media.srcsetWebp ? ` srcset="${eA(media.srcsetWebp)}"` : '';
  const avif = media.srcsetAvif ? `<source type="image/avif" srcset="${eA(media.srcsetAvif)}" sizes="${eA(sizes)}">` : '';
  return `<picture>${avif}<img class="${cls}" src="${eA(media.src)}"${srcset} sizes="${eA(sizes)}" alt="${a}"${dims} loading="${eager ? 'eager' : 'lazy'}" fetchpriority="${eager ? 'high' : 'auto'}"${blur} decoding="async"></picture>`;
}
// Branded CSS placeholder — NEVER a broken/random image
function ph(label = 'Image not uploaded', sub = 'Add from Admin → Media Library', cls = '') {
  return `<div class="ph ${cls}" role="img" aria-label="${eA(label)}">
    <svg viewBox="0 0 64 72" width="44" height="50" aria-hidden="true"><path d="M32 2 62 20v32L32 70 2 52V20Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 14 50 24v20L32 54 14 44V24Z" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/><text x="32" y="40" text-anchor="middle" font-size="15" font-family="Georgia,serif" fill="currentColor">M</text></svg>
    <b>MORA&nbsp;HOME</b><span>${eA(label)}</span><i>${eA(sub)}</i></div>`;
}

/* ---------- chrome: announcement / header / footer / dock ---------- */
function announcement(d) {
  const a = d.sitec.announcement || {};
  if (!a.enabled || !a.text) return '';
  const link = a.linkUrl ? `<a href="${eA(a.linkUrl)}" class="ann-link">${eA(a.linkLabel || 'Learn more')} ${icon('arrow', 13)}</a>` : '';
  return `<div class="announce" style="--ann-bg:${eA(a.bg || '#8B0000')};--ann-c:${eA(a.color || '#FFFDF8')}"><p>${eA(a.text)} ${link}</p></div>`;
}
function logoHtml(d, ctx = 'header') {
  const m = mediaOf(d.brand.logoId);
  if (m) return `<span class="logo logo-img">${pic(m, { cls: 'logo-' + ctx, alt: d.business.name, eager: ctx === 'header', sizes: '200px', height: 44 })}</span>`;
  return `<span class="logo logo-text"><b>MORA</b><span>HOME</span></span>
    ${ctx === 'header' ? '<span class="logo-note">Upload your logo · Admin → Brand &amp; Theme</span>' : ''}`;
}
function header(d, active) {
  const links = d.nav.filter(n => n.area === 'main').map(n => {
    const isActive = (active === '/' && n.url === '/') || (n.url !== '/' && active.startsWith(n.url.replace(/#.*/, '')));
    return `<a href="${eA(n.url)}" ${isActive ? 'aria-current="page"' : ''} ${n.new_tab ? 'target="_blank" rel="noopener"' : ''}>${eA(n.label)}</a>`;
  }).join('');
  const search = d.navCfg.showSearch ? `
    <form class="nav-search" role="search" action="/products" method="get">
      <label class="sr" for="navq">Search products</label>
      <input id="navq" name="q" type="search" placeholder="Search products or MH codes…" autocomplete="off" enterkeyhint="search">
      <button type="submit" aria-label="Search">${icon('search', 18)}</button>
    </form>` : '';
  return `
  <a href="#main" class="skip">Skip to content</a>
  <header class="site-header">
    ${announcement(d)}
    <div class="nav">
      <a href="/" class="brand" aria-label="${eA(d.business.name)} — home">${logoHtml(d, 'header')}</a>
      <nav class="nav-links" aria-label="Main">${links}</nav>
      <div class="nav-actions">
        ${search}
        <a class="btn btn-ghost btn-icon" href="/enquiry-list" aria-label="Enquiry list">${icon('list', 19)}<span class="pill" id="list-count" hidden>0</span><span class="btn-label">${eA(d.navCfg.listLabel || 'Enquiry List')}</span></a>
        <a class="btn btn-primary" href="${eA(d.navCfg.ctaUrl || '/contact')}">${eA(d.navCfg.ctaLabel || 'Send Enquiry')}</a>
        <button class="nav-toggle" aria-expanded="false" aria-controls="drawer" aria-label="Open menu">${icon('menu', 24)}</button>
      </div>
    </div>
  </header>
  <div class="drawer-backdrop" hidden></div>
  <aside class="drawer" id="drawer" aria-label="Menu" hidden>
    <div class="drawer-head"><span class="logo logo-text"><b>MORA</b><span>HOME</span></span>
      <button class="drawer-close" aria-label="Close menu">${icon('close', 22)}</button></div>
    ${search ? `<form class="drawer-search" role="search" action="/products" method="get"><input name="q" type="search" placeholder="Search products or MH codes…" aria-label="Search products"><button class="btn btn-primary" type="submit">Search</button></form>` : ''}
    <nav aria-label="Mobile">${links}</nav>
    <a class="btn btn-primary btn-block" href="${eA(d.navCfg.ctaUrl || '/contact')}">${eA(d.navCfg.ctaLabel || 'Send Enquiry')}</a>
    <a class="btn btn-ghost btn-block" href="/enquiry-list">${icon('list', 18)} ${eA(d.navCfg.listLabel || 'Enquiry List')} <span class="pill" data-list-count hidden>0</span></a>
  </aside>`;
}
function footer(d) {
  const f = d.footer;
  const yearNote = (f.copyright || '').replace('{year}', new Date().getFullYear());
  const cols = (f.columns || []).map(c => `
    <div class="f-col"><h3>${eA(c.title)}</h3>
      ${(c.links || []).map(l => `<a href="${eA(l.url)}">${eA(l.label)}</a>`).join('')}
    </div>`).join('');
  const legal = db.prepare("SELECT title, slug FROM pages WHERE slug IN ('privacy','terms') AND deleted_at IS NULL AND status='published'").all()
    .map(p => `<a href="/p/${eA(p.slug)}">${eA(p.title)}</a>`).join('<span class="dot">·</span>');
  const socials = Object.entries(d.business.socials || {}).filter(([, v]) => v)
    .map(([k, v]) => `<a href="${eA(v)}" target="_blank" rel="noopener" class="soc">${eA(k[0].toUpperCase() + k.slice(1))}</a>`).join('');
  const contact = f.contactBlock ? `
    <div class="f-col f-contact"><h3>Contact</h3>
      <p>${icon('pin', 15)} ${eA(d.business.address)}</p>
      <p>${icon('phone', 15)} <a href="${phoneHref(d.business.phone)}">${fmtPhone(d.business.phone)}</a></p>
      <p>${icon('mail', 15)} <a href="mailto:${eA(d.business.emailPrimary)}">${eA(d.business.emailPrimary)}</a></p>
      ${f.showCatalogue ? `<a class="btn btn-cream" href="/catalogue/latest">${icon('download', 16)} Download Catalogue</a>` : ''}
    </div>` : '';
  return `
  <footer class="site-footer" style="--f-bg:${eA(f.bg || '#3B2417')}">
    <div class="f-grid">
      <div class="f-col f-brand">${logoHtml(d, 'footer')}<p>${eA(f.tagline || '')}</p>${socials ? `<div class="f-soc">${socials}</div>` : ''}</div>
      ${cols}${contact}
    </div>
    <div class="f-base"><p>${eA(yearNote)}</p><p class="f-disc">${eA(f.disclaimer || '')}</p><div class="f-legal">${legal}</div></div>
  </footer>`;
}
function dock(d) {
  const s = d.sitec.dock || {};
  const waNum = d.business.whatsapp;
  const items = [];
  if (s.mobileWhatsApp && d.wa.enabled !== false) items.push(`<button class="dock-item dock-wa" data-wa-open data-wa-context="dock">${icon('whatsapp', 22)}<span>${eA(d.wa.mobileDockText || 'WhatsApp')}</span></button>`);
  if (s.mobileEnquiry) items.push(`<a class="dock-item dock-enq" href="${eA(d.navCfg.ctaUrl || '/contact')}">${icon('mail', 20)}<span>${eA(d.navCfg.ctaLabel || 'Send Enquiry')}</span></a>`);
  const mobile = items.length ? `<div class="dock dock-mobile">${items.join('')}</div>` : '';
  const desk = [];
  if (s.desktopWhatsApp && d.wa.enabled !== false) desk.push(`<button class="dock-fab" data-wa-open data-wa-context="dock" aria-label="Chat on WhatsApp">${icon('whatsapp', 26)}</button>`);
  if (s.desktopList) desk.push(`<a class="dock-fab" href="/enquiry-list" aria-label="Enquiry list">${icon('list', 24)}<span class="pill" data-list-count hidden>0</span></a>`);
  return mobile + (desk.length ? `<div class="dock dock-desktop">${desk.join('')}</div>` : '');
}

/* ---------- layout ---------- */
function layout(req, { title, description, path: active = '/', body = '', extraHead = '', jsonLd = [], robots } = {}) {
  const d = siteData();
  const seoTitle = title || d.seo.title;
  const seoDesc = description || d.seo.description;
  const og = mediaOf(d.seo.ogImageId || d.brand.ogImageId);
  const fav = mediaOf(d.brand.faviconId);
  const analytics = getSetting('analytics', {});
  const ga = analytics.ga4 ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${eA(analytics.ga4)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${eA(analytics.ga4)}')</script>` : '';
  const pixel = analytics.metaPixel ? `<script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${eA(analytics.metaPixel)}');fbq('track','PageView')</script>` : '';
  const orgLd = { '@context': 'https://schema.org', '@type': 'Organization', name: d.business.name, url: 'https://morahome.in', email: d.business.emailPrimary, telephone: d.business.phone, address: { '@type': 'PostalAddress', addressLocality: 'Moradabad', addressRegion: 'Uttar Pradesh', addressCountry: 'IN' } };
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${eA(seoTitle)}</title>
<meta name="description" content="${eA(seoDesc)}">
${robots === false || d.seo.robotsIndex === false ? '<meta name="robots" content="noindex,nofollow">' : ''}
${d.seo.keywords ? `<meta name="keywords" content="${eA(d.seo.keywords)}">` : ''}
<link rel="canonical" href="https://morahome.in${eA(req.path)}">
<meta property="og:type" content="website"><meta property="og:site_name" content="${eA(d.business.name)}">
<meta property="og:title" content="${eA(seoTitle)}"><meta property="og:description" content="${eA(seoDesc)}">
${og ? `<meta property="og:image" content="https://morahome.in${og.original}">` : ''}
${analytics.searchConsole ? `<meta name="google-site-verification" content="${eA(analytics.searchConsole)}">` : ''}
${fav ? `<link rel="icon" href="${fav.original}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Playfair+Display:wght@500;600;700&family=Lora:wght@400;500;600&family=DM+Sans:wght@400;500;600;700&family=Lato:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/main.css">
<link rel="stylesheet" href="/api/public/theme.css?v=${cache.time}">
${ga}${pixel}${analytics.headerScripts || ''}${extraHead}
<script type="application/ld+json">${JSON.stringify(orgLd)}</script>
${jsonLd.map(j => `<script type="application/ld+json">${JSON.stringify(j)}</script>`).join('')}
</head>
<body data-page="${eA(active)}">
<noscript><style>.ph i{display:none}</style><p style="text-align:center;padding:8px;background:#FBF9F4">MORA HOME works best with JavaScript enabled — core content remains available below.</p></noscript>
${header(d, active)}
<main id="main">
${body}
</main>
${footer(d)}
${dock(d)}
<div class="wa-modal" id="wa-modal" hidden role="dialog" aria-modal="true" aria-labelledby="wa-title">
  <div class="wa-card">
    <button class="wa-close" aria-label="Close">${icon('close', 20)}</button>
    <div class="wa-badge">${icon('whatsapp', 26)}</div>
    <h2 id="wa-title">Chat with MORA HOME on WhatsApp</h2>
    <form id="wa-form" novalidate>
      <div class="fld"><label for="wa-name">Your Name *</label><input id="wa-name" name="name" required autocomplete="name"></div>
      <div class="fld"><label for="wa-biz">Business Name</label><input id="wa-biz" name="business" autocomplete="organization" placeholder="Optional"></div>
      <button class="btn btn-wa btn-block" type="submit">${icon('whatsapp', 20)} Continue to WhatsApp</button>
    </form>
  </div>
</div>
<div class="toast" id="toast" role="status" aria-live="polite"></div>
<script src="/js/site.js" defer></script>
<script>window.MORA_CONFIG=${JSON.stringify({ wa: d.wa, waNumber: d.business.whatsapp, business: d.business.name, currency: d.commerce.currency })}</script>
${analytics.footerScripts || ''}
</body>
</html>`;
}

/* ---------- section scaffolding ---------- */
function bgOf(cfg, brand) {
  const map = { cream: brand.colors.cream, soft: brand.colors.creamSoft, white: brand.colors.white, walnut: brand.colors.walnutDark, red: brand.colors.red };
  return map[cfg.bg] || (cfg.bg && /^#/.test(cfg.bg) ? cfg.bg : map.white);
}
function darkBg(cfg) { return ['walnut', 'red'].includes(cfg.bg); }
function padOf(sp) { return { small: 'clamp(1.5rem,3vw,2.5rem)', medium: 'clamp(2.5rem,5vw,4rem)', large: 'clamp(3.5rem,7vw,6rem)' }[sp || 'large'] || 'clamp(3rem,6vw,5rem)'; }
function maxOf(w) { return { narrow: '760px', medium: '1000px', wide: '1240px', full: '100%' }[w || 'wide']; }
function watermark(cfg, brand) {
  const w = brand.watermark || {};
  if (!w.enabled || !cfg.watermark) return '';
  const pos = { left: 'left:2%;top:50%;transform:translateY(-50%)', right: 'right:2%;top:50%;transform:translateY(-50%)', center: 'left:50%;top:50%;transform:translate(-50%,-50%)' }[w.position || 'center'];
  return `<div class="wm" aria-hidden="true" style="opacity:${+w.opacity || .05};${pos};width:${+w.size || 420}px">
    <svg viewBox="0 0 64 72" width="100%" height="100%"><path d="M32 2 62 20v32L32 70 2 52V20Z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M32 14 50 24v20L32 54 14 44V24Z" fill="none" stroke="currentColor" stroke-width="1" opacity=".6"/><text x="32" y="40" text-anchor="middle" font-size="16" font-family="Georgia,serif" fill="currentColor">M</text></svg></div>`;
}
function secWrap(section, cfg, inner, { id } = {}) {
  const d = siteData();
  const style = `--sec-bg:${bgOf(cfg, d.brand)};--sec-pad:${padOf(cfg.spacing)};--sec-max:${maxOf(cfg.width)};--sec-align:${cfg.align || 'left'};--cols:${(cfg.variant || '').match(/[3-6]/)?.[0] || 3}`;
  return `<section class="sec ${darkBg(cfg) ? 'sec-dark' : ''}" ${id ? `id="${id}"` : ''} style="${style}" data-sec="${eA(section.key)}">
    ${watermark(cfg, d.brand)}<div class="sec-in">${inner}</div></section>`;
}
function secHead(cfg) {
  if (!cfg.heading && !cfg.subheading) return '';
  return `<header class="sec-head">${cfg.subheading ? `<p class="kicker">${eA(cfg.subheading)}</p>` : ''}${cfg.heading ? `<h2>${eA(cfg.heading)}</h2>` : ''}</header>`;
}

/* ---------- cards ---------- */
function productCard(p) {
  const imgRow = p.media_id ? mediaOf(p.media_id) : null;
  const badge = p.badge ? `<span class="pcard-badge">${eA(p.badge)}</span>` : '';
  const specs = [p.material, p.finish, p.dimensions].filter(Boolean).join(' · ');
  return `<article class="pcard" data-code="${eA(p.code)}">
    <a class="pcard-media" href="/products/${eA(p.slug)}" aria-label="${eA(p.name)} — ${eA(p.code)}">
      ${badge}${imgRow ? pic(imgRow, { sizes: '(min-width:1024px) 25vw, 50vw', cls: 'pcard-img', alt: p.name }) : ph('Photo coming soon', 'Admin → Products')}
    </a>
    <div class="pcard-body">
      ${p.category_name ? `<span class="pcard-cat">${eA(p.category_name)}</span>` : ''}
      <h3><a href="/products/${eA(p.slug)}">${eA(p.name)}</a></h3>
      <span class="pcard-code">${eA(p.code)}</span>
      ${specs ? `<p class="pcard-spec">${eA(specs)}</p>` : ''}
      <div class="pcard-acts">
        <button class="btn btn-small btn-primary" data-add-list data-code="${eA(p.code)}" data-name="${eA(p.name)}">${icon('list', 15)} Enquiry List</button>
        <a class="btn btn-small btn-ghost" href="/contact?product=${eA(p.code)}">Send Enquiry</a>
        <label class="cmp"><input type="checkbox" data-compare data-code="${eA(p.code)}" aria-label="Compare ${eA(p.code)}"> Compare</label>
      </div>
    </div></article>`;
}
function categoryCard(c, count) {
  const img = mediaOf(c.image_id);
  return `<a class="cat-card" href="/products?category=${eA(c.slug)}">
    <div class="cat-media">${img ? pic(img, { sizes: '(min-width:1024px) 25vw, 50vw', alt: c.name }) : ph('No image yet', 'Admin → Categories')}</div>
    <div class="cat-body"><h3>${eA(c.name)}</h3>${count ? `<span>${count} products</span>` : ''}${c.description ? `<p>${eA(c.description)}</p>` : ''}</div>
  </a>`;
}

/* ---------- homepage section renderers ---------- */
const sectionRenderers = {
  hero(s, cfg, d) {
    const slides = (cfg.slides || []).filter(x => x.active !== false);
    const slideHtml = (sl, i) => {
      const img = mediaOf(sl.imageId || cfg.imageId);
      const mob = mediaOf(sl.mobileImageId);
      const style = `--hero-focal:${eA(sl.focal || img?.focal || '50% 50%')};--hero-overlay:${(cfg.overlay ?? 40) / 100}`;
      return `<div class="hero-slide ${i === 0 ? 'is-on' : ''}" style="${style}" role="group" aria-roledescription="slide" aria-label="${i + 1}">
        <div class="hero-media">${img
          ? `<picture>${mob ? `<source media="(max-width:640px)" srcset="${eA(mob.src)}">` : ''}${pic(img, { sizes: '100vw', cls: 'hero-img', eager: i === 0, alt: sl.heading || cfg.heading || '' })}</picture>`
          : `<div class="hero-ph">${ph('Hero image not uploaded', 'Admin → Homepage → Hero')}</div>`}
          <div class="hero-overlay"></div></div>
        <div class="hero-copy ${'hero-' + (cfg.align || 'center')}">
          <h1>${eA(sl.heading || cfg.heading || '')}</h1>
          ${(sl.subheading || cfg.subheading) ? `<p class="hero-sub">${eA(sl.subheading || cfg.subheading)}</p>` : ''}
          <div class="hero-ctas">
            ${(sl.ctaLabel || cfg.cta1Label) ? `<a class="btn btn-primary" href="${eA(sl.ctaUrl || cfg.cta1Url || '#')}">${eA(sl.ctaLabel || cfg.cta1Label)}</a>` : ''}
            ${cfg.cta2Label ? `<a class="btn btn-outline" href="${eA(cfg.cta2Url || '#')}">${eA(cfg.cta2Label)}</a>` : ''}
          </div>
          ${cfg.showSearch ? `<form class="hero-search" role="search" action="/products" method="get">
            <input name="q" type="search" placeholder="Search by product name or MH code…" aria-label="Search products">
            <button class="btn btn-primary" type="submit">${icon('search', 18)} Search</button></form>` : ''}
        </div>
      </div>`;
    };
    const slidesMarkup = slides.length ? slides.map(slideHtml).join('') : slideHtml({}, 0);
    const dots = slides.length > 1 && cfg.dots !== false ? `<div class="hero-dots" role="tablist">${slides.map((_, i) => `<button role="tab" aria-selected="${i === 0}" aria-label="Slide ${i + 1}"></button>`).join('')}</div>` : '';
    return `<section class="hero hero-${cfg.height || 'large'}" data-autoplay="${cfg.autoplay !== false && slides.length > 1 ? (cfg.interval || 5000) : 0}" data-pause="${cfg.pauseOnHover !== false}">
      <div class="hero-track">${slidesMarkup}</div>${dots}</section>`;
  },
  'category-strip'(s, cfg, d) {
    const chips = d.cats.map(c => `<a class="strip-chip" href="/products?category=${eA(c.slug)}">${eA(c.name)}</a>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="strip">${chips}</div>`, { id: 'categories' });
  },
  serve(s, cfg) {
    const items = (cfg.items || []).map(it => `<div class="feat-item">
      <span class="feat-ic">${icon(it.icon || 'star', 26)}</span>
      <h3>${eA(it.title)}</h3><p>${eA(it.text)}</p>${it.link ? `<a class="txt-link" href="${eA(it.link)}">Learn more ${icon('arrow', 13)}</a>` : ''}</div>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="feat-grid">${items}</div>`);
  },
  range(s, cfg) {
    const counts = db.prepare("SELECT category_id id, COUNT(*) c FROM products WHERE status='published' AND deleted_at IS NULL GROUP BY category_id").all();
    const cmap = Object.fromEntries(counts.map(r => [r.id, r.c]));
    const d = siteData();
    const cards = d.cats.map(c => categoryCard(c, cmap[c.id] || 0)).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="cat-grid">${cards}</div>`);
  },
  featured(s, cfg) {
    const rows = db.prepare(`SELECT p.*, c.name category_name,
      (SELECT pi.media_id FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) media_id
      FROM products p LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.status='published' AND p.featured=1 AND p.deleted_at IS NULL ORDER BY p.updated_at DESC LIMIT ?`).all(cfg.max || 8);
    if (!rows.length) return '';
    return secWrap(s, cfg, `${secHead(cfg)}<div class="pgrid">${rows.map(productCard).join('')}</div>
      <div class="sec-more"><a class="btn btn-outline" href="/products">View All Products ${icon('arrow', 15)}</a></div>`);
  },
  new(s, cfg) {
    const rows = db.prepare(`SELECT p.*, c.name category_name,
      (SELECT pi.media_id FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) media_id
      FROM products p LEFT JOIN categories c ON c.id=p.category_id
      WHERE p.status='published' AND p.is_new=1 AND p.deleted_at IS NULL ORDER BY p.published_at DESC LIMIT ?`).all(cfg.max || 8);
    if (!rows.length) return '';
    return secWrap(s, cfg, `${secHead(cfg)}<div class="pgrid">${rows.map(productCard).join('')}</div>`);
  },
  why(s, cfg) {
    return sectionRenderers.serve(s, cfg);
  },
  steps(s, cfg) {
    const items = (cfg.items || []).map((it, i) => `<li class="step"><span class="step-n">${i + 1}</span><div><h3>${eA(it.title)}</h3><p>${eA(it.text)}</p></div></li>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<ol class="steps">${items}</ol>`);
  },
  numbers(s, cfg) {
    const auto = db.prepare("SELECT COUNT(*) c FROM products WHERE status='published' AND deleted_at IS NULL").get().c;
    const statsRows = db.prepare('SELECT * FROM stats WHERE enabled=1 ORDER BY sort').all()
      .map(st => ({ ...st, value: st.auto_products ? String(auto) : st.value }))
      .filter(st => st.value && st.value !== '0');
    if (!statsRows.length) return '';
    const items = statsRows.map(st => `<div class="counter"><b data-count="${eA(st.value)}">${eA(st.value)}</b><span>${eA(st.label)}</span></div>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="counters">${items}</div>`);
  },
  about(s, cfg) {
    const img = mediaOf(cfg.imageId);
    const text = (cfg.text || '').split(/\n+/).filter(Boolean).map(p => `<p>${eA(p)}</p>`).join('');
    const copy = `<div class="about-copy">${cfg.subheading ? `<p class="kicker">${eA(cfg.subheading)}</p>` : ''}<h2>${eA(cfg.heading || '')}</h2>${text}
      ${cfg.ctaLabel ? `<a class="btn btn-outline" href="${eA(cfg.ctaUrl || '/about')}">${eA(cfg.ctaLabel)}</a>` : ''}</div>`;
    const media = `<div class="about-media">${img ? pic(img, { sizes: '(min-width:900px) 45vw, 100vw', alt: cfg.heading }) : ph('Workshop photo not uploaded', 'Admin → Homepage → About Us')}</div>`;
    const flip = cfg.layout === 'text-right';
    return secWrap(s, cfg, `<div class="about ${flip ? 'flipped' : ''}">${flip ? media + copy : copy + media}</div>`);
  },
  gifting(s, cfg) {
    const img = mediaOf(cfg.imageId);
    const content = `<div class="gift-in">
      <h2>${eA(cfg.heading || '')}</h2>
      ${cfg.subheading ? `<p>${eA(cfg.subheading)}</p>` : ''}
      ${cfg.ctaLabel ? `<a class="btn btn-cream" href="${eA(cfg.ctaUrl || '/contact')}">${eA(cfg.ctaLabel)}</a>` : ''}</div>`;
    return secWrap(s, cfg, `${img ? `<div class="gift-img">${pic(img, { sizes: '100vw', alt: '' })}</div>` : ''}${content}`);
  },
  trust(s, cfg) {
    const items = db.prepare('SELECT t.*, m.id mid FROM trust_items t LEFT JOIN media_assets m ON m.id=t.media_id WHERE t.enabled=1 ORDER BY t.sort').all();
    if (!items.length) return '';
    const html = items.map(t => `<div class="trust-item">${t.mid ? pic(mediaOf(t.mid), { sizes: '160px', alt: t.label || 'Trust badge' }) : `<span class="trust-txt">${eA(t.label || '')}</span>`}</div>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="trust-row">${html}</div>`);
  },
  testimonials(s, cfg) {
    const items = db.prepare('SELECT * FROM testimonials WHERE enabled=1 ORDER BY sort').all();
    if (!items.length) return '';
    const html = items.map(t => `<figure class="quote-card">
      ${icon('quote', 22, 'q-mark')}<blockquote>${eA(t.quote)}</blockquote>
      <figcaption>${t.photo_id ? pic(mediaOf(t.photo_id), { sizes: '56px', cls: 'q-img', alt: t.name }) : `<span class="q-init" aria-hidden="true">${eA((t.name || 'M')[0])}</span>`}
      <div><b>${eA(t.name)}</b><span>${eA([t.business, t.city].filter(Boolean).join(' · '))}</span></div></figcaption></figure>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="quote-grid">${html}</div>`);
  },
  faq(s, cfg) {
    const items = db.prepare('SELECT * FROM faqs WHERE enabled=1 ORDER BY sort').all();
    if (!items.length) return '';
    const html = items.map((f, i) => `<details class="faq-item" ${i === 0 ? 'open' : ''}><summary><h3>${eA(f.question)}</h3>${icon('chev', 18)}</summary><div>${eA(f.answer)}</div></details>`).join('');
    return secWrap(s, cfg, `${secHead(cfg)}<div class="faq-list">${html}</div>`);
  },
  contact(s, cfg) {
    const d = siteData();
    const forms = getSetting('forms', {});
    const fields = (forms.enquiry || []).filter(f => f.visible !== false).map(formField).join('');
    return secWrap(s, cfg, `
      <div class="contact-split">
        <div class="contact-info">${secHead({ ...cfg, subheading: '' })}
          <p>${eA(cfg.subheading || '')}</p>
          <ul class="contact-facts">
            <li>${icon('pin', 17)}<div><b>Address</b><span>${eA(d.business.address)}</span></div></li>
            <li>${icon('phone', 17)}<div><b>Phone</b><a href="${phoneHref(d.business.phone)}">${fmtPhone(d.business.phone)}</a></div></li>
            <li>${icon('mail', 17)}<div><b>Email</b><a href="mailto:${eA(d.business.emailPrimary)}">${eA(d.business.emailPrimary)}</a></div></li>
            ${d.business.hours ? `<li>${icon('star', 17)}<div><b>Hours</b><span>${eA(d.business.hours)}</span></div></li>` : ''}
          </ul>
          <button class="btn btn-wa" data-wa-open data-wa-context="contact">${icon('whatsapp', 19)} ${eA(d.wa.buttonText || 'WhatsApp Us')}</button>
        </div>
        <form class="form card" data-lead-form="enquiry" data-source="home" novalidate>
          <h3>Send a Quick Enquiry</h3>
          ${fields}
          <button class="btn btn-primary btn-block" type="submit">Submit Enquiry</button>
          <p class="form-note">We respond within one business day.</p>
          <div class="form-msg" role="status" aria-live="polite"></div>
        </form>
      </div>`);
  }
};
function formField(f, value = '') {
  const req = f.required ? 'required aria-required="true"' : '';
  const help = f.help ? `<small class="f-help">${eA(f.help)}</small>` : '';
  const phx = `placeholder="${eA(f.placeholder || '')}"`;
  if (f.type === 'textarea') return `<div class="fld"><label for="f-${eA(f.key)}">${eA(f.label)} ${f.required ? '*' : ''}</label><textarea id="f-${eA(f.key)}" name="${eA(f.key)}" rows="3" ${req} ${phx}>${eA(value)}</textarea>${help}</div>`;
  if (f.type === 'select') return `<div class="fld"><label for="f-${eA(f.key)}">${eA(f.label)} ${f.required ? '*' : ''}</label><select id="f-${eA(f.key)}" name="${eA(f.key)}" ${req}><option value="">Select…</option>${(f.options || []).map(o => `<option>${eA(o)}</option>`).join('')}</select>${help}</div>`;
  return `<div class="fld"><label for="f-${eA(f.key)}">${eA(f.label)} ${f.required ? '*' : ''}</label><input id="f-${eA(f.key)}" name="${eA(f.key)}" type="${eA(f.type || 'text')}" ${req} ${phx} value="${eA(value)}">${help}</div>`;
}

function renderHome() {
  const d = siteData();
  const sections = db.prepare('SELECT * FROM home_sections WHERE enabled=1 ORDER BY sort').all();
  let body = '';
  const ld = [];
  for (const s of sections) {
    const cfg = JSON.parse(s.config || '{}');
    const r = sectionRenderers[s.key];
    if (s.key === 'hero') { body += r(s, cfg, d); continue; }
    if (r) body += r(s, cfg, d);
  }
  const faqs = db.prepare('SELECT question,answer FROM faqs WHERE enabled=1 ORDER BY sort LIMIT 10').all();
  if (faqs.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map(f => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) });
  return { body, ld };
}

/* ---------- page blocks (custom pages) ---------- */
function blockHtml(b) {
  const d = siteData();
  const sp = `--bp:${padOf(b.spacing || 'small')};--bmax:${maxOf(b.width || 'medium')};--balign:${b.align || 'left'};--bbg:${bgOf({ bg: b.bg || 'white' }, d.brand)}`;
  const wrap = (inner, cls = '') => `<section class="sec block ${cls}" style="${sp}"><div class="sec-in">${inner}</div></section>`;
  switch (b.type) {
    case 'heading': return wrap(`<h2>${eA(b.text)}</h2>`);
    case 'paragraph': return wrap((b.text || '').split(/\n+/).map(p => `<p>${eA(p)}</p>`).join(''));
    case 'richtext': return wrap(`<div class="rt">${b.html || ''}</div>`);
    case 'image': { const m = mediaOf(b.imageId); return wrap(m ? pic(m, { sizes: '100vw', alt: b.alt || '' }) : ph()); }
    case 'image-text': {
      const m = mediaOf(b.imageId);
      const media = m ? pic(m, { sizes: '(min-width:900px) 45vw,100vw', alt: b.alt || '' }) : ph();
      return wrap(`<div class="about ${b.layout === 'image-right' ? 'flipped' : ''}"><div class="about-media">${media}</div><div class="about-copy"><h3>${eA(b.heading || '')}</h3>${(b.text || '').split(/\n+/).map(p => `<p>${eA(p)}</p>`).join('')}${b.ctaLabel ? `<a class="btn btn-outline" href="${eA(b.ctaUrl || '#')}">${eA(b.ctaLabel)}</a>` : ''}</div></div>`);
    }
    case 'columns': case 'cards': {
      const cols = (b.items || []).map(it => `<div class="feat-item">${it.icon ? `<span class="feat-ic">${icon(it.icon, 26)}</span>` : ''}<h3>${eA(it.title)}</h3><p>${eA(it.text)}</p></div>`).join('');
      return wrap(`${b.heading ? `<header class="sec-head"><h2>${eA(b.heading)}</h2></header>` : ''}<div class="feat-grid" style="--cols:${b.cols || 3}">${cols}</div>`);
    }
    case 'cta': return wrap(`<div class="cta-box"><h2>${eA(b.heading)}</h2>${b.text ? `<p>${eA(b.text)}</p>` : ''}${b.ctaLabel ? `<a class="btn btn-primary" href="${eA(b.ctaUrl || '#')}">${eA(b.ctaLabel)}</a>` : ''}</div>`, 'cta-sec');
    case 'products': {
      const rows = db.prepare(`SELECT p.*, c.name category_name, (SELECT pi.media_id FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) media_id FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.status='published' AND p.deleted_at IS NULL ORDER BY p.featured DESC, p.updated_at DESC LIMIT ?`).all(b.count || 4);
      return wrap(`${b.heading ? `<header class="sec-head"><h2>${eA(b.heading)}</h2></header>` : ''}<div class="pgrid">${rows.map(productCard).join('')}</div>`);
    }
    case 'faq': return sectionRenderers.faq({ key: 'block-faq' }, { ...b, width: b.width || 'medium', spacing: 'small' });
    case 'quote': return wrap(`<blockquote class="big-quote">${eA(b.text)}${b.author ? `<cite>— ${eA(b.author)}</cite>` : ''}</blockquote>`);
    case 'divider': return wrap('<hr class="divider">');
    case 'html': return wrap(`<div class="html-block">${b.html || ''}</div>`);
    default: return '';
  }
}
function renderPageBlocks(page) {
  const blocks = JSON.parse(page.blocks || '[]');
  return blocks.map(blockHtml).join('');
}

module.exports = {
  layout, icon, ph, pic, mediaOf, siteData, invalidateCache, secWrap, secHead, productCard,
  renderHome, renderPageBlocks, formField, bgOf, darkBg
};
