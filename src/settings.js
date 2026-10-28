/** Settings accessor with sane fallbacks for keys added after first seed. */
const db = require('./db');

const DEFAULTS = {
  nav: [
    { label: 'Home', url: '/' },
    { label: 'Products', url: '/products' },
    { label: 'About Us', url: '/about' },
    { label: 'Contact', url: '/contact' },
  ],
};

function get(key, mode = 'live') {
  const v = db.getSetting(key, mode);
  if (v === null || v === undefined) return DEFAULTS[key] !== undefined ? JSON.parse(JSON.stringify(DEFAULTS[key])) : null;
  return v;
}

module.exports = { get, DEFAULTS };
