/**
 * MORA HOME — idempotent content migrations for databases seeded by older versions.
 * Runs on every boot after seed(); each fix is a no-op once applied.
 */
const db = require('./db');

function migrate() {
  /* 2026-10: wholesale price label on products (card price box, PDFs, JSON-LD) */
  const cols = db.all('PRAGMA table_info(products)').map((c) => c.name);
  if (!cols.includes('price')) {
    db.exec("ALTER TABLE products ADD COLUMN price TEXT NOT NULL DEFAULT ''");
    console.log('[migrate] ✔ added products.price column.');
  }

  /* 2026-10: databases created before the price feature got the column with
     DEFAULT '' but were never back-filled, so every card/PDF showed "On request"
     even though seed ships sample prices. Fill demo rows that are still empty —
     a price the owner typed in Admin is never touched. */
  const { PRODUCTS } = require('./seed');
  const empty = db.all("SELECT id, code FROM products WHERE demo = 1 AND (price IS NULL OR price = '')");
  let filled = 0;
  for (const r of empty) {
    const src = PRODUCTS.find((p) => p.code === r.code);
    if (src && src.price) { db.run('UPDATE products SET price = ? WHERE id = ?', [src.price, r.id]); filled++; }
  }
  if (filled) console.log(`[migrate] ✔ back-filled sample wholesale prices on ${filled} demo product(s).`);

  /* 2026-10: catalogue watermark + single editable catalogue contact source.
     Materialised on first boot so Admin → Catalogue shows real values and the
     next generated PDF picks them up immediately. */
  if (!db.get('SELECT key FROM settings WHERE key = ?', ['catalogue-watermark'])) {
    const c = db.getSetting('contact', 'live') || {};
    db.setSettingBoth('catalogue-watermark', {
      enabled: true, logoPath: '',
      phone: c.phone || '+91 8171246275',
      email: c.email1 || 'writemora@gmail.com',
      whatsapp: String(c.whatsapp || '918171246275').replace(/[^\d+]/g, ''),
      website: 'morahome.in',
      opacity: 6,
    });
    console.log('[migrate] ✔ added Catalogue Watermark settings.');
  }

  /* 2026-10 (v8.5): watermark redesign — one faint text tile, 5–7 % opacity.
     Databases created by older versions stored up to 25 % (default 13 %);
     pull any out-of-band value back into the new whisper band. */
  const wmNow = db.getSetting('catalogue-watermark', 'live');
  if (wmNow && (Number(wmNow.opacity) < 5 || Number(wmNow.opacity) > 7)) {
    for (const mode of ['live', 'draft']) {
      const v = db.getSetting('catalogue-watermark', mode);
      if (v && (Number(v.opacity) < 5 || Number(v.opacity) > 7)) {
        v.opacity = 6;
        db.run('UPDATE settings SET ' + mode + ' = ? WHERE key = ?', [JSON.stringify(v), 'catalogue-watermark']);
      }
    }
    console.log('[migrate] ✔ clamped catalogue watermark opacity to the 5–7 % band (set 6).');
  }

  /* 2026-10 (v8.5): the second mailbox (asktomora@gmail.com) is retired — every
     template renders a single address now. Clear it from stored contact settings
     so old databases stop printing it in the footer / contact section / spec
     sheets. A different, owner-entered second address is left untouched. */
  {
    const row = db.get('SELECT live, draft FROM settings WHERE key = ?', ['contact']);
    if (row) {
      const patch = (json) => {
        let v; try { v = JSON.parse(json || '{}'); } catch { return json; }
        if (v && String(v.email2 || '').includes('asktomora')) { v.email2 = ''; return JSON.stringify(v); }
        return json;
      };
      const live = patch(row.live), draft = patch(row.draft);
      if (live !== row.live || draft !== row.draft) {
        db.run('UPDATE settings SET live = ?, draft = ? WHERE key = ?', [live, draft, 'contact']);
        console.log('[migrate] ✔ removed the retired asktomora@ mailbox from stored contact settings.');
      }
    }
  }

  /* 2026-10: repair the catalogue-cover pointer. Some databases store either a
     dead path (file deleted) or a timestamped byte-copy of the shipped cover
     (left behind by uploads/QA runs). When the stored file is missing, or is
     byte-identical to assets/brand/catalogue-cover.pdf, repoint at the canonical
     upload so /catalogue/latest always merges a real page 1. A genuinely custom
     cover is never touched. */
  const covRow = db.getSetting('catalogue_cover', 'live') || {};
  const canonical = '/uploads/catalogue-cover/catalogue-cover.pdf';
  if (covRow.path && covRow.path !== canonical) {
    const fsx = require('fs'), pathx = require('path');
    const { absFromRel } = require('./lib/media');
    const storedAbs = absFromRel(covRow.path);
    const canonAbs = absFromRel(canonical);
    const sameAsShipped = () => {
      const shipped = pathx.join(__dirname, '..', 'assets', 'brand', 'catalogue-cover.pdf');
      try {
        return fsx.existsSync(storedAbs) && fsx.existsSync(shipped) &&
          fsx.statSync(storedAbs).size === fsx.statSync(shipped).size &&
          fsx.readFileSync(storedAbs).equals(fsx.readFileSync(shipped));
      } catch { return false; }
    };
    if ((!fsx.existsSync(storedAbs) || sameAsShipped()) && fsx.existsSync(canonAbs)) {
      db.setSettingBoth('catalogue_cover', { path: canonical, note: 'Designed cover page (Admin → Catalogue to replace or remove).' });
      console.log('[migrate] ✔ repointed catalogue cover to the canonical page.');
    }
  }

  /* 2026-10: designed catalogue cover page ships as an asset; install it as the
     default front page of the auto-generated catalogue (admin can replace/remove). */
  const fs = require('fs');
  const path = require('path');
  const coverSetting = db.getSetting('catalogue_cover', 'live');
  const asset = path.join(__dirname, '..', 'assets', 'brand', 'catalogue-cover.pdf');
  const dest = path.join(db.paths.UPLOAD_DIR, 'catalogue-cover', 'catalogue-cover.pdf');
  if (!coverSetting && fs.existsSync(asset)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    if (!fs.existsSync(dest)) fs.copyFileSync(asset, dest);
    db.setSettingBoth('catalogue_cover', { path: '/uploads/catalogue-cover/catalogue-cover.pdf', note: 'Designed cover page (Admin → Catalogue to replace or remove).' });
    console.log('[migrate] ✔ installed default catalogue cover page.');
  }

  /* 2026-10 audit M10: "events weddings" → "events & weddings" in stored section content */
  const rows = db.all("SELECT id, draft_json, live_json FROM sections WHERE draft_json LIKE '%events weddings%' OR live_json LIKE '%events weddings%'");
  for (const r of rows) {
    db.run('UPDATE sections SET draft_json = ?, live_json = ? WHERE id = ?', [
      String(r.draft_json).split('events weddings').join('events & weddings'),
      String(r.live_json).split('events weddings').join('events & weddings'),
      r.id,
    ]);
  }
  if (rows.length) console.log(`[migrate] ✔ fixed "events weddings" typo in ${rows.length} section(s).`);

  /* 2026-10 audit M7/M8: make sure footer settings carry the new socials/company keys
     (footerHtml falls back gracefully, but materialising them keeps admin forms honest) */
  const footer = db.getSetting('footer', 'live');
  if (footer && !footer.socials) {
    footer.socials = { instagram: '', facebook: '', linkedin: '', youtube: '', indiamart: '', whatsapp: '', google_business: '' };
    if (footer.company_line === undefined) footer.company_line = '';
    db.setSettingBoth('footer', footer);
    console.log('[migrate] ✔ added footer socials/company_line keys.');
  }
}

module.exports = { migrate };
