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
