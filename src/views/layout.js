/** MORA HOME — public site layout (header, footer, floating dock, modals). */
const { esc, icon } = require('../render');
const { cssVars, fontLink } = require('../theme');
const settings = require('../settings');
const assets = require('../lib/assets');

function logoBlock(brand, theme, opts = {}) {
  const crest = `<img class="logo-crest" src="${esc(brand.crestPath || '/uploads/brand/crest-transparent.png')}" alt="MORA HOME crest" width="1400" height="1082">`;
  const wordmark = `<span class="wordmark"><span class="wm-mora">${esc((brand.siteName || 'MORA HOME').split(' ')[0])}</span><span class="wm-home">${esc(brand.siteNameSub || 'HOME').split('').join(' ')}</span></span>`;
  const mode = opts.force || theme.logoMode || 'crest';
  let inner = '';
  if (mode === 'crest') inner = crest;
  else if (mode === 'wordmark') inner = wordmark;
  else inner = `<span class="logo-both">${crest}${wordmark}</span>`;
  return `<a class="logo-link" href="/" aria-label="MORA HOME — home">${inner}</a>`;
}

function floatingDock(contact) {
  return `<div class="float-dock" id="floatDock">
    <button class="dock-whatsapp" type="button" id="dockWhatsapp" aria-label="Chat on WhatsApp">${icon('whatsapp', 26)}</button>
  </div>`;
}

function modals(contact, waTemplate) {
  return `
  <div class="modal-backdrop" id="enquiryModal" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="enqTitle">
      <button class="modal-close" data-close-modal="enquiryModal" aria-label="Close">${icon('close', 18)}</button>
      <p class="overline">WHOLESALE ENQUIRY</p>
      <h3 id="enqTitle" class="modal-title">Send Enquiry</h3>
      <div class="enq-product-chip" id="enqChip" hidden></div>
      <div id="enqListChip" class="enq-list-chip" hidden></div>
      <form id="enquiryForm" class="stack-form" novalidate>
        <input class="hp-field" type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" placeholder="Leave this field empty">
        <div class="form-row-2">
          <label>Your name<input name="name" required placeholder="e.g. Rahul Verma"></label>
          <label>Company<input name="company" placeholder="e.g. Verma &amp; Sons"></label>
        </div>
        <div class="form-row-2">
          <label>Email<input name="email" type="email" placeholder="you@company.com"></label>
          <label>Phone / WhatsApp<input name="phone" required placeholder="+91 …"></label>
        </div>
        <label>City<input name="city" placeholder="e.g. Delhi"></label>
        <label>Requirement details<textarea name="message" rows="3" placeholder="Quantities, customisation, target date…"></textarea></label>
        <button class="btn btn-crimson btn-block" type="submit">Submit Enquiry</button>
        <p class="form-note">Your enquiry is saved in our system even before email/WhatsApp is sent — we reply within one working day.</p>
      </form>
    </div>
  </div>

  <div class="modal-backdrop" id="whatsappModal" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="waTitle">
      <button class="modal-close" data-close-modal="whatsappModal" aria-label="Close">${icon('close', 18)}</button>
      <p class="overline">WHATSAPP LEAD DESK</p>
      <h3 id="waTitle" class="modal-title">Chat with MORA HOME on WhatsApp</h3>
      <form id="waForm" class="stack-form" novalidate>
        <input class="hp-field" type="text" name="website" value="" tabindex="-1" autocomplete="off" aria-hidden="true" placeholder="Leave this field empty">
        <div class="form-row-2">
          <label>Your name<input name="name" required placeholder="e.g. Rahul Verma"></label>
          <label>Company<input name="company" placeholder="e.g. Verma &amp; Sons"></label>
        </div>
        <label>Interested in<input name="product" id="waProductInput" placeholder="Product name or code (optional)"></label>
        <div class="wa-lookup-chip" id="waLookupChip" hidden></div>
        <label>Message preview<textarea name="preview" rows="4" id="waPreview" readonly></textarea></label>
        <button class="btn btn-whatsapp btn-block" type="submit">${icon('whatsapp', 18)} Open WhatsApp Chat</button>
        <p class="form-note">Opening WhatsApp also saves this lead in Admin → Leads Inbox, so nothing is ever lost.</p>
      </form>
    </div>
  </div>

  <div class="modal-backdrop" id="enqListModal" hidden>
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="enqListTitle">
      <button class="modal-close" data-close-modal="enqListModal" aria-label="Close">${icon('close', 18)}</button>
      <p class="overline">YOUR ENQUIRY LIST</p>
      <h3 id="enqListTitle" class="modal-title">Products shortlisted for enquiry</h3>
      <div id="enqListBody" class="enq-list-body"></div>
      <div class="modal-actions">
        <button class="btn btn-outline" type="button" id="enqListClear">Clear list</button>
        <button class="btn btn-crimson" type="button" id="enqListSend">Send Bulk Enquiry</button>
      </div>
    </div>
  </div>

  <button class="enq-fab-counter" id="enqFabCounter" type="button" hidden aria-label="Open enquiry list"></button>
  <div class="toast" id="toast" role="status" hidden></div>`;
}

function footerHtml(brand, theme, footer, contact) {
  /* social links (audit M7): rendered only when the owner fills them in Admin → Footer & Social */
  const soc = (footer && footer.socials) || {};
  /* NOTE: WhatsApp intentionally NOT listed here — the round WA icon under the
     footer logo/tagline was removed on owner request. The floating green
     WhatsApp dock button (bottom-right) is untouched. */
  const SOCIALS = [
    ['instagram', 'Instagram', soc.instagram],
    ['facebook', 'Facebook', soc.facebook],
    ['linkedin', 'LinkedIn', soc.linkedin],
    ['youtube', 'YouTube', soc.youtube],
    ['store', 'IndiaMART', soc.indiamart],
    ['pin', 'Google Business Profile', soc.google_business],
  ].filter((row) => row[2] && String(row[2]).trim() && /^https?:\/\//i.test(String(row[2]).trim()));
  return `<footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">
        <div class="footer-crest-badge">
          <img src="${esc(brand.crestPath || brand.crestIvoryPath || '/uploads/brand/crest-transparent.png')}" alt="MORA HOME crest" width="1400" height="1082">
        </div>
        <p class="footer-tagline">“${esc(footer.tagline)}”</p>
        ${SOCIALS.length ? `<div class="footer-socials">${SOCIALS.map(([ic, label, u]) => `<a href="${esc(String(u).trim())}" target="_blank" rel="noopener" aria-label="${esc(label)}" title="${esc(label)}">${icon(ic, 18)}</a>`).join('')}</div>` : ''}
      </div>
      <div class="footer-catalogue">
        <h4>${esc(footer.catalogue_heading)}</h4>
        <p>${esc(footer.catalogue_text)}</p>
        <button class="btn btn-light catalogue-request" type="button">${esc(footer.catalogue_button)}</button>
      </div>
      <div class="footer-col">
        <h4>About MORA HOME</h4>
        <p class="footer-blurb">${esc(footer.about_blurb)}</p>
      </div>
      <div class="footer-col">
        <h4>Quick Links</h4>
        <ul class="footer-links">${(footer.quick_links || []).map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join('')}</ul>
      </div>
      <div class="footer-col">
        <h4>Reach Us</h4>
        <ul class="footer-links contact-lines">
          <li>${icon('phone', 15)} <a href="tel:${esc(contact.phone.replace(/[^+\d]/g, ''))}">${esc(contact.phone)}</a></li>
          <li>${icon('mail', 15)} <a href="mailto:${esc(contact.email1)}">${esc(contact.email1)}</a></li>
          <li>${icon('mail', 15)} <a href="mailto:${esc(contact.email2)}">${esc(contact.email2)}</a></li>
          <li>${icon('pin', 15)} <span>${esc(contact.address)}</span></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <div class="container">
        ${footer.company_line ? `<p class="footer-company">${esc(footer.company_line)}</p>` : ''}
        <div class="footer-bottom-inner">
          <p>© ${new Date().getFullYear()} MORA HOME · Moradabad, Uttar Pradesh, India</p>
          <ul class="footer-legal">${(footer.legal_links || []).map((l) => `<li><a href="${esc(l.url)}">${esc(l.label)}</a></li>`).join('')}</ul>
        </div>
      </div>
      <div class="container"><p class="footer-disclaimer">${esc(footer.disclaimer)}</p></div>
    </div>
  </footer>`;
}

function drawerHtml(brand, theme, nav) {
  const wm = `<span class="wordmark"><span class="wm-mora">${esc((brand.siteName || 'MORA HOME').split(' ')[0])}</span><span class="wm-home">${esc((brand.siteNameSub || 'HOME').split('').join(' '))}</span></span>`;
  return `
  <div class="drawer-backdrop" id="drawerBackdrop" hidden></div>
  <aside class="site-drawer" id="siteDrawer" aria-label="Menu" hidden>
    <div class="drawer-head">
      <a class="drawer-brand" href="/">${wm}</a>
      <button class="drawer-close" id="drawerClose" aria-label="Close menu">${icon('close', 22)}</button>
    </div>
    <form class="drawer-search" role="search" action="/products" method="get">
      <input name="q" type="search" placeholder="Search products or MH codes…" aria-label="Search products" enterkeyhint="search">
      <button class="btn drawer-btn-solid" type="submit">Search</button>
    </form>
    <nav class="drawer-nav" aria-label="Mobile">
      ${nav.map((l) => `<a href="${esc(l.url)}">${esc(l.label)}</a>`).join('')}
    </nav>
    <div class="drawer-acts">
      <button class="btn btn-block drawer-btn-solid enquiry-open" type="button" data-code="" data-name="General wholesale enquiry">${icon('send', 16)}<span>Send Enquiry</span></button>
      <button class="btn btn-block drawer-btn-outline" type="button" data-open-list>${icon('list', 16)}<span>Enquiry List</span></button>
      <a class="btn btn-block drawer-btn-outline" href="/products?select=1">${icon('check', 16)}<span>Download Selected Catalogue</span></a>
      <a class="btn btn-block drawer-btn-outline" href="/catalogue/latest?dl=1" download="MORA-HOME-Wholesale-Catalogue.pdf" data-catalogue-download>${icon('download', 16)}<span>Download Catalogue</span></a>
    </div>
  </aside>`;
}

function layout(opts) {
  const { theme, brand, contact, footer, nav, seoTitle, seoDesc, bodyHtml, page = '', preview = false, extraHead = '', canonical = '', ld = [], ogImage = '', ogType = '', noindex = false } = opts;

  let origin = '';
  if (canonical) { try { origin = new URL(canonical).origin; } catch (e) { /* ignore */ } }

  /* structured data: homepage gets WebSite (+ SearchAction, audit L8) & Organization;
     any page can pass extra `ld` objects (product pages pass Product + BreadcrumbList) */
  const ldAll = Array.isArray(ld) ? ld.slice() : [];
  if (page === 'home' && origin) {
    ldAll.unshift(
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'MORA HOME', alternateName: ['Mora Home', 'MoraHome', 'morahome.in'], url: origin + '/',
        potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: origin + '/products?q={search_term_string}' }, 'query-input': 'required name=search_term_string' } },
      { '@context': 'https://schema.org', '@type': 'Organization', name: 'MORA HOME', url: origin + '/', logo: origin + '/logo-512.png',
        description: seoDesc, email: contact.email1, telephone: contact.phone,
        address: { '@type': 'PostalAddress', addressLocality: 'Moradabad', addressRegion: 'Uttar Pradesh', addressCountry: 'IN' },
        contactPoint: [{ '@type': 'ContactPoint', telephone: contact.phone, email: contact.email1, contactType: 'sales', areaServed: 'IN', availableLanguage: ['English', 'Hindi'] }] },
    );
  }
  const jsonLd = (!preview && ldAll.length)
    ? ldAll.map((o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n')
    : '';

  /* social sharing (audit C3): absolute og:image — WhatsApp/FB cannot resolve relative URLs.
     Default is the branded 1200×630 banner; product pages pass their photo instead. */
  const ogImg = ogImage
    ? (/^https?:\/\//i.test(ogImage) ? ogImage : origin + ogImage)
    : (origin ? origin + '/og-banner.png' : '/og-banner.png');

  const waNumber = String(contact.whatsapp || '').replace(/[^0-9]/g, '');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(seoDesc)}">
${(preview || noindex) ? '<meta name="robots" content="noindex, follow">' : ''}
${canonical && !preview ? `<link rel="canonical" href="${esc(canonical)}">` : ''}
<meta property="og:type" content="${ogType || 'website'}">
<meta property="og:site_name" content="MORA HOME">
<meta property="og:locale" content="en_IN">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(seoDesc)}">
${canonical && !preview ? `<meta property="og:url" content="${esc(canonical)}">` : ''}
<meta property="og:image" content="${esc(ogImg)}">
${!ogImage ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">' : ''}
<meta property="og:image:alt" content="${esc(seoTitle)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(seoDesc)}">
<meta name="twitter:image" content="${esc(ogImg)}">
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">
<meta name="theme-color" content="#5C3D2E">
${jsonLd}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontLink(theme)}">
<link rel="stylesheet" href="${assets.url('css/site.css')}">
<style>:root{${cssVars(theme)}}</style>
${extraHead}
</head>
<body data-page="${esc(page)}"${preview ? ' data-preview="1"' : ''}${theme.redBorder ? ` data-borders="${esc((theme.borderTargets || ['buttons']).join(' '))}"` : ''}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container header-inner">
    ${logoBlock(brand, theme)}
    <nav class="site-nav" id="siteNav" aria-label="Primary">
      ${nav.map((l) => `<a href="${esc(l.url)}"${l.url === ('/' + page) || (l.url === '/' && page === 'home') ? ' class="active"' : ''}>${esc(l.label)}</a>`).join('')}
    </nav>
    <div class="header-actions">
      <form class="header-search" role="search" action="/products" method="get">
        <input name="q" type="search" placeholder="Search products or MH codes…" aria-label="Search products" enterkeyhint="search">
        <button type="submit" aria-label="Search">${icon('search', 18)}</button>
      </form>
      <button class="nav-toggle" id="navToggle" aria-label="Open menu" aria-expanded="false" aria-controls="siteDrawer"><span></span><span></span><span></span></button>
    </div>
  </div>
</header>
${drawerHtml(brand, theme, nav)}
<main id="main">${bodyHtml}</main>
${footerHtml(brand, theme, footer, contact)}
${floatingDock(contact)}
${modals(contact)}
<script type="application/json" id="moraConfig">${JSON.stringify({
    whatsapp: waNumber,
    phone: contact.phone,
    email1: contact.email1,
    email2: contact.email2,
    address: contact.address,
    mapLink: contact.mapLink,
    waTemplate: settings.get('whatsapp_template', preview ? 'draft' : 'live') || '',
    preview: !!preview,
  }).replace(/</g, '\\u003c')}</script>
<script src="${assets.url('js/site.js')}"></script>
<script src="${assets.url('js/header-fx.js')}" defer></script>
${preview ? `<script src="${assets.url('js/preview.js')}"></script>` : ''}
</body>
</html>`;
}

module.exports = { layout, logoBlock, footer: footerHtml, modals };
