/**
 * MORA HOME — cache-busted asset URLs.
 * Every CSS/JS file gets `?v=<content-hash>` computed once at boot, so the
 * files can be served with a long Cache-Control max-age and browsers still
 * pick up changes immediately after a deploy (the URL changes).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PUB_DIR = path.join(__dirname, '..', '..', 'public');
const versions = new Map();

function version(rel) {
  if (!versions.has(rel)) {
    try {
      const h = crypto.createHash('md5').update(fs.readFileSync(path.join(PUB_DIR, rel))).digest('hex').slice(0, 10);
      versions.set(rel, h);
    } catch { versions.set(rel, '0'); }
  }
  return versions.get(rel);
}

/** e.g. url('css/site.css') → '/css/site.css?v=ab12cd34ef' */
const url = (rel) => `/${rel.replace(/^\/+/, '')}?v=${version(rel.replace(/^\/+/, ''))}`;

module.exports = { url, version };
