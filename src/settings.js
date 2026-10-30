/** Settings accessor with sane fallbacks for keys added after first seed. */
const db = require('./db');

const DEFAULTS = {
  nav: [
    { label: 'Home', url: '/' },
    { label: 'Products', url: '/products' },
    { label: 'About Us', url: '/about' },
    { label: 'Contact', url: '/contact' },
  ],
  /* Catalogue watermark + the single editable contact source every catalogue
     PDF prints (Admin → Catalogue → "Catalogue Watermark"). Pre-filled so an
     existing database gets sensible values before the owner ever opens it.
     v8.5: text-only tile, 5–7 % opacity, one mailbox (writemora@gmail.com). */
  'catalogue-watermark': {
    enabled: true,
    logoPath: '',                    // legacy key — PDFs no longer stamp a logo
    phone: '+91 8171246275',
    email: 'writemora@gmail.com',
    whatsapp: '918171246275',
    website: 'morahome.in',
    opacity: 6,                      // 5 – 7 (%)
  },
};

function get(key, mode = 'live') {
  const v = db.getSetting(key, mode);
  if (v === null || v === undefined) return DEFAULTS[key] !== undefined ? JSON.parse(JSON.stringify(DEFAULTS[key])) : null;
  return v;
}

module.exports = { get, DEFAULTS };
