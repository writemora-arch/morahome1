/** MORA HOME — Admin CMS routes (pages + JSON API + uploads + backup/restore). */
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('../db');
const settings = require('../settings');
const auth = require('../lib/auth');
const media = require('../lib/media');
const zip = require('../lib/zip');
const { unzipBuffer } = zip;
const { SECTIONS } = require('../schemas');
const { adminShell, loginPage } = require('../views/admin');
const { withDefaults } = require('../theme');
const { hashPass } = require('./../seed');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
const ratelimit = require('../lib/ratelimit');

const SETTING_KEYS = ['theme', 'contact', 'seo', 'footer', 'nav', 'whatsapp_template', 'brand'];
const baseKey = (k) => String(k).replace(/_\d+$/, '');

/* nothing under /admin or /api/admin should ever be indexed (audit C1).
   v8.3 fix: this router is mounted at the app ROOT, so an unguarded
   router.use() ran for EVERY request and stamped "noindex, nofollow" on all
   public pages too — telling Google to hide the whole website. Only admin
   URLs may carry the header now. */
router.use((req, res, next) => {
  const p = req.path || '/';
  if (p === '/admin' || p.startsWith('/admin/') || p === '/api/admin' || p.startsWith('/api/admin/')) {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

/* CSRF: double-submit cookie. The token is stored in a SameSite=Lax cookie AND
   embedded in the login form; POST must present both, matching. */
function issueCsrf(res) {
  const token = crypto.randomBytes(18).toString('hex');
  res.setHeader('Set-Cookie', `mora_csrf=${token}; Path=/; SameSite=Lax; Max-Age=3600`);
  return token;
}
function readCsrfCookie(req) {
  const kv = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith('mora_csrf='));
  return kv ? decodeURIComponent(kv.slice('mora_csrf='.length)) : '';
}

/* ------------------------- pages ------------------------- */
router.get('/admin', (req, res) => {
  if (!auth.isAdmin(req)) return res.redirect('/admin/login');
  res.type('html').send(adminShell(withDefaults(settings.get('theme', 'draft') || settings.get('theme', 'live'))));
});
router.get('/admin/login', (req, res) => {
  if (auth.isAdmin(req)) return res.redirect('/admin');
  const csrf = issueCsrf(res);
  let error = req.query.error ? String(req.query.error).slice(0, 200) : '';
  const rl = ratelimit.peek('login:' + ratelimit.clientIp(req), 15 * 60 * 1000, 5);
  if (!rl.allowed) error = 'Too many login attempts. Please try again later.';
  res.type('html').send(loginPage(withDefaults(settings.get('theme', 'live')), error, csrf));
});
router.post('/admin/login', express.urlencoded({ extended: false, limit: '16kb' }), (req, res) => {
  const ip = ratelimit.clientIp(req);
  const key = 'login:' + ip;
  const rl = ratelimit.hit(key, 15 * 60 * 1000, 5); // 5 attempts / 15 minutes / IP
  if (!rl.allowed) {
    return res.redirect('/admin/login?error=' + encodeURIComponent(`Too many login attempts. Please wait ${Math.max(1, Math.ceil(rl.retryAfter / 60))} minute(s) and try again.`));
  }
  const cookieCsrf = readCsrfCookie(req);
  const formCsrf = String(req.body._csrf || '');
  if (!cookieCsrf || !formCsrf || cookieCsrf !== formCsrf) {
    return res.redirect('/admin/login?error=' + encodeURIComponent('Your login session expired. Please try again.'));
  }
  if (auth.verify(req.body.user || '', req.body.pass || '')) {
    ratelimit.reset(key);
    auth.createSession(res);
    return res.redirect('/admin');
  }
  res.redirect('/admin/login?error=' + encodeURIComponent('Incorrect username or password.'));
});
router.get('/admin/logout', (req, res) => { auth.destroy(req, res); res.redirect('/admin/login'); });

/* ------------------------- API ------------------------- */
router.use('/api/admin', auth.requireAdminApi);

router.get('/api/admin/schemas', (req, res) => res.json({ sections: SECTIONS }));

function dirtyState() {
  const dirtySections = db.all('SELECT * FROM sections').some((s) => s.draft_json !== s.live_json || s.draft_visible !== s.live_visible || s.draft_order !== s.live_order);
  const dirtySettings = SETTING_KEYS.some((k) => {
    const row = db.get('SELECT live, draft FROM settings WHERE key = ?', [k]);
    return row && row.live !== row.draft;
  });
  return dirtySections || dirtySettings;
}

router.get('/api/admin/state', (req, res) => {
  res.json({
    theme: withDefaults(settings.get('theme', 'draft')),
    sections: db.all('SELECT * FROM sections ORDER BY draft_order ASC').map((s) => ({
      id: s.id, key: s.key, name: s.name, visible: s.draft_visible === 1, order: s.draft_order,
      content: JSON.parse(s.draft_json || '{}'),
    })),
    settings: {
      contact: settings.get('contact', 'draft'), seo: settings.get('seo', 'draft'),
      footer: settings.get('footer', 'draft'), nav: settings.get('nav', 'draft'),
      whatsapp_template: settings.get('whatsapp_template', 'draft'), brand: settings.get('brand', 'draft'),
      catalogue: settings.get('catalogue', 'live'), demo_mode: settings.get('demo_mode', 'live'),
      catalogue_cover: settings.get('catalogue_cover', 'live'),
      admin_user: (settings.get('auth', 'live') || {}).user,
    },
    categories: db.all('SELECT * FROM categories ORDER BY sort ASC'),
    products: db.all('SELECT * FROM products ORDER BY created_at DESC').map((p) => ({
      ...p, images: db.all('SELECT * FROM product_images WHERE product_id = ? ORDER BY sort ASC', [p.id]),
    })),
    leads: db.all('SELECT * FROM leads ORDER BY created_at DESC, id DESC').map((l) => ({
      ...l, notes: db.all('SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at ASC', [l.id]),
    })),
    stats: {
      products: db.get('SELECT COUNT(*) c FROM products').c,
      published: db.get("SELECT COUNT(*) c FROM products WHERE status='published'").c,
      leads: db.get('SELECT COUNT(*) c FROM leads').c,
      newLeads: db.get("SELECT COUNT(*) c FROM leads WHERE status='New'").c,
      categories: db.get('SELECT COUNT(*) c FROM categories').c,
    },
    dirty: dirtyState(),
    hasSharp: media.hasSharp,
  });
});

router.post('/api/admin/publish', (req, res) => {
  db.exec('UPDATE sections SET live_json = draft_json, live_visible = draft_visible, live_order = draft_order');
  SETTING_KEYS.forEach((k) => db.publishSetting(k));
  db.persist(true);
  res.json({ ok: true });
});
router.post('/api/admin/revert', (req, res) => {
  db.exec('UPDATE sections SET draft_json = live_json, draft_visible = live_visible, draft_order = live_order');
  SETTING_KEYS.forEach((k) => db.revertSetting(k));
  res.json({ ok: true });
});

router.put('/api/admin/theme', express.json(), (req, res) => {
  db.setSettingDraft('theme', req.body);
  res.json({ ok: true, dirty: dirtyState() });
});

router.put('/api/admin/settings/:key', express.json(), (req, res) => {
  const key = req.params.key;
  if (!SETTING_KEYS.includes(key)) return res.status(400).json({ error: 'Unknown settings key' });
  db.setSettingDraft(key, req.body);
  res.json({ ok: true, dirty: dirtyState() });
});
/* immediate-effect settings (no publish needed) */
router.put('/api/admin/immediate/:key', express.json(), (req, res) => {
  const key = req.params.key;
  if (!['catalogue', 'demo_mode', 'whatsapp_template_immediate'].includes(key)) return res.status(400).json({ error: 'Unknown key' });
  if (key === 'whatsapp_template_immediate') { db.setSettingBoth('whatsapp_template', req.body); return res.json({ ok: true }); }
  db.setSettingBoth(key, req.body);
  res.json({ ok: true });
});

router.put('/api/admin/sections/:id', express.json(), (req, res) => {
  const s = db.get('SELECT * FROM sections WHERE id = ?', [Number(req.params.id)]);
  if (!s) return res.status(404).json({ error: 'Section not found' });
  if (req.body.content) db.run('UPDATE sections SET draft_json = ? WHERE id = ?', [JSON.stringify(req.body.content), s.id]);
  if (typeof req.body.visible === 'boolean') db.run('UPDATE sections SET draft_visible = ? WHERE id = ?', [req.body.visible ? 1 : 0, s.id]);
  res.json({ ok: true, dirty: dirtyState() });
});
router.put('/api/admin/sections/order', express.json(), (req, res) => {
  (req.body.order || []).forEach((item, i) => db.run('UPDATE sections SET draft_order = ? WHERE id = ?', [Number(item.order !== undefined ? item.order : i), Number(item.id)]));
  res.json({ ok: true, dirty: dirtyState() });
});
router.post('/api/admin/sections/:id/duplicate', (req, res) => {
  const s = db.get('SELECT * FROM sections WHERE id = ?', [Number(req.params.id)]);
  if (!s) return res.status(404).json({ error: 'Section not found' });
  const maxOrder = db.get('SELECT MAX(draft_order) m FROM sections').m || 0;
  let newKey = s.key + '_2'; let n = 2;
  while (db.get('SELECT id FROM sections WHERE key = ?', [newKey])) { n++; newKey = `${s.key}_${n}`; }
  db.run('INSERT INTO sections (key,name,draft_json,live_json,draft_visible,live_visible,draft_order,live_order) VALUES (?,?,?,?,0,0,?,?)',
    [newKey, s.name + ' (copy)', s.draft_json, s.draft_json, maxOrder + 1, maxOrder + 1]);
  res.json({ ok: true });
});

/* ---------------- products ---------------- */
router.post('/api/admin/products', express.json(), (req, res) => {
  const b = req.body;
  if (!b.code || !String(b.code).trim()) return res.status(400).json({ error: 'Product Code is required.' });
  if (db.get('SELECT id FROM products WHERE code = ?', [b.code])) return res.status(409).json({ error: `Product code ${b.code} already exists — codes must be unique.` });
  const r = db.run(`INSERT INTO products (code,name,badge,category_slug,material,size,moq,description,specs_json,price_on_request,featured,status,demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,0)`,
    [b.code, b.name || b.code, b.badge || '', b.category_slug || '', b.material || '', b.size || '', b.moq || '', b.description || '',
      JSON.stringify(b.specs || []), b.price_on_request ? 1 : 0, b.featured ? 1 : 0, b.status || 'published']);
  db.run('UPDATE products SET price = ? WHERE id = ?', [String(b.price || '').slice(0, 60), r.lastInsertRowid]);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});
router.put('/api/admin/products/:id', express.json(), (req, res) => {
  const p = db.get('SELECT * FROM products WHERE id = ?', [Number(req.params.id)]);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  const b = req.body;
  if (b.code && db.get('SELECT id FROM products WHERE code = ? AND id != ?', [b.code, p.id])) return res.status(409).json({ error: `Product code ${b.code} already exists.` });
  db.run(`UPDATE products SET code=?, name=?, badge=?, category_slug=?, material=?, size=?, moq=?, description=?, specs_json=?, price=?, price_on_request=?, featured=?, status=?, updated_at=datetime('now') WHERE id=?`,
    [b.code || p.code, b.name || p.name, b.badge ?? p.badge, b.category_slug ?? p.category_slug, b.material ?? p.material, b.size ?? p.size, b.moq ?? p.moq,
      b.description ?? p.description, JSON.stringify(b.specs !== undefined ? b.specs : JSON.parse(p.specs_json || '[]')),
      String(b.price !== undefined ? b.price : (p.price || '')).slice(0, 60),
      b.price_on_request ? 1 : 0, b.featured ? 1 : 0, b.status || p.status, p.id]);
  res.json({ ok: true });
});
router.delete('/api/admin/products/:id', (req, res) => {
  const imgs = db.all('SELECT * FROM product_images WHERE product_id = ?', [Number(req.params.id)]);
  imgs.forEach((i) => media.removeRel(i.path));
  db.run('DELETE FROM product_images WHERE product_id = ?', [Number(req.params.id)]);
  db.run('DELETE FROM products WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});
router.post('/api/admin/products/:id/images', upload.single('file'), (req, res) => {
  const p = db.get('SELECT * FROM products WHERE id = ?', [Number(req.params.id)]);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  const focal = { x: parseFloat(req.body.focal_x || '0.5'), y: parseFloat(req.body.focal_y || '0.5') };
  media.saveImage(req.file.buffer, req.file.mimetype, 'products', focal).then((rel) => {
    const maxSort = db.get('SELECT MAX(sort) m FROM product_images WHERE product_id = ?', [p.id]).m || 0;
    const r = db.run('INSERT INTO product_images (product_id, path, focal_x, focal_y, sort) VALUES (?,?,?,?,?)', [p.id, rel, focal.x, focal.y, maxSort + 1]);
    res.status(201).json({ ok: true, id: r.lastInsertRowid, path: rel });
  }).catch((e) => res.status(500).json({ error: e.message }));
});
router.put('/api/admin/images/:id', express.json(), (req, res) => {
  db.run('UPDATE product_images SET focal_x = ?, focal_y = ? WHERE id = ?', [Number(req.body.focal_x || 0.5), Number(req.body.focal_y || 0.5), Number(req.params.id)]);
  res.json({ ok: true });
});
router.delete('/api/admin/images/:id', (req, res) => {
  const img = db.get('SELECT * FROM product_images WHERE id = ?', [Number(req.params.id)]);
  if (img) { media.removeRel(img.path); db.run('DELETE FROM product_images WHERE id = ?', [img.id]); }
  res.json({ ok: true });
});

/* generic image upload for sections (hero, about, categories…) */
router.post('/api/admin/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  if (!/^image\//.test(req.file.mimetype || '') && !/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(req.file.originalname || '')) return res.status(400).json({ error: 'Only image files (JPG, PNG, WebP, GIF) are allowed.' });
  const subdir = String(req.body.folder || 'pages').replace(/[^a-z0-9-]/gi, '');
  media.saveImage(req.file.buffer, req.file.mimetype, subdir || 'pages').then((rel) => res.status(201).json({ ok: true, path: rel }))
    .catch((e) => res.status(500).json({ error: e.message }));
});

/* ---------------- categories ---------------- */
router.post('/api/admin/categories', express.json(), (req, res) => {
  const b = req.body;
  const slug = b.slug || String(b.name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) return res.status(400).json({ error: 'Category name required.' });
  if (db.get('SELECT id FROM categories WHERE slug = ?', [slug])) return res.status(409).json({ error: 'A category with this slug already exists.' });
  const maxSort = db.get('SELECT MAX(sort) m FROM categories').m || 0;
  const r = db.run('INSERT INTO categories (slug,name,subtitle,sort,visible) VALUES (?,?,?,?,?)', [slug, b.name, b.subtitle || '', maxSort + 1, b.visible === false ? 0 : 1]);
  res.status(201).json({ ok: true, id: r.lastInsertRowid });
});
router.put('/api/admin/categories/:id', express.json(), (req, res) => {
  const b = req.body;
  db.run('UPDATE categories SET name=?, subtitle=?, image=?, sort=?, visible=? WHERE id=?',
    [b.name, b.subtitle || '', b.image || '', Number(b.sort || 0), b.visible === false ? 0 : 1, Number(req.params.id)]);
  res.json({ ok: true });
});
router.delete('/api/admin/categories/:id', (req, res) => {
  db.run('DELETE FROM categories WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});

/* ---------------- leads CRM ---------------- */
router.put('/api/admin/leads/:id', express.json(), (req, res) => {
  db.run('UPDATE leads SET status = ? WHERE id = ?', [String(req.body.status || 'New'), Number(req.params.id)]);
  res.json({ ok: true });
});
router.post('/api/admin/leads/:id/notes', express.json(), (req, res) => {
  db.run('INSERT INTO lead_notes (lead_id, note) VALUES (?,?)', [Number(req.params.id), String(req.body.note || '')]);
  res.json({ ok: true });
});
router.delete('/api/admin/leads/:id', (req, res) => {
  db.run('DELETE FROM lead_notes WHERE lead_id = ?', [Number(req.params.id)]);
  db.run('DELETE FROM leads WHERE id = ?', [Number(req.params.id)]);
  res.json({ ok: true });
});
router.get('/api/admin/leads/export.csv', (req, res) => {
  const rows = db.all('SELECT * FROM leads ORDER BY id DESC');
  const escCsv = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const head = ['ID', 'Created', 'Type', 'Status', 'Name', 'Company', 'Email', 'Phone', 'City', 'Message', 'Products'];
  const lines = [head.join(',')];
  rows.forEach((l) => {
    let items = []; try { items = JSON.parse(l.items_json || '[]'); } catch { items = []; }
    lines.push([l.id, l.created_at, l.type, l.status, l.name, l.company, l.email, l.phone, l.city, l.message, items.join(' | ')].map(escCsv).join(','));
  });
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="mora-home-leads.csv"');
  res.send(lines.join('\n'));
});

/* ---------------- catalogue cover page (front page of the auto catalogue) ---- */
router.post('/api/admin/catalogue-cover', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  if (!/pdf$/i.test(req.file.mimetype) && !/\.pdf$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Please upload a PDF file (A4 portrait works best).' });
  media.saveFile(req.file.buffer, 'catalogue-cover', req.file.originalname).then((rel) => {
    db.setSettingBoth('catalogue_cover', { path: rel, note: `Uploaded ${new Date().toISOString().slice(0, 10)}` });
    res.status(201).json({ ok: true, path: rel });
  }).catch((e) => res.status(500).json({ error: e.message }));
});
router.delete('/api/admin/catalogue-cover', (req, res) => {
  db.setSettingBoth('catalogue_cover', { path: '', note: '' });
  res.json({ ok: true });
});

/* ---------------- catalogue, password, demo ---------------- */
router.post('/api/admin/catalogue', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
  if (!/pdf$/i.test(req.file.mimetype) && !/\.pdf$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Please upload a PDF file.' });
  media.saveFile(req.file.buffer, 'catalogue', req.file.originalname).then((rel) => {
    db.setSettingBoth('catalogue', { path: rel, note: `Uploaded ${new Date().toISOString().slice(0, 10)}` });
    res.status(201).json({ ok: true, path: rel });
  });
});

router.post('/api/admin/password', express.json(), (req, res) => {
  const a = settings.get('auth', 'live');
  if (!auth.verify(a.user, req.body.current || '')) return res.status(400).json({ error: 'Current password is incorrect.' });
  if ((req.body.next || '').length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const salt = crypto.randomBytes(8).toString('hex');
  db.setSettingBoth('auth', { user: req.body.user || a.user, salt, hash: hashPass(req.body.next, salt) });
  res.json({ ok: true });
});

router.post('/api/admin/demo/clear', (req, res) => {
  const demos = db.all('SELECT id FROM products WHERE demo = 1');
  demos.forEach((d) => {
    db.all('SELECT * FROM product_images WHERE product_id = ?', [d.id]).forEach((i) => media.removeRel(i.path));
    db.run('DELETE FROM product_images WHERE product_id = ?', [d.id]);
  });
  db.run('DELETE FROM products WHERE demo = 1');
  db.setSettingBoth('demo_mode', false);
  res.json({ ok: true, removed: demos.length });
});
router.post('/api/admin/demo/reseed', (req, res) => {
  const { seedDemoProducts } = require('../seed');
  try { const added = seedDemoProducts(); res.json({ ok: true, added }); } catch (e) { res.status(500).json({ error: e.message }); }
});

/* ---------------- backup & restore ---------------- */
router.get('/api/admin/backup.zip', (req, res) => {
  db.persist(true);
  const entries = [{ name: 'mora.db', data: fs.readFileSync(db.paths.DB_PATH) }];
  zip.zipDir(db.paths.UPLOAD_DIR, 'uploads', entries);
  const buf = zip.createZip(entries);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="mora-home-backup-${new Date().toISOString().slice(0, 10)}.zip"`);
  res.send(buf);
});
router.post('/api/admin/restore', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No backup file uploaded.' });
  try {
    const entries = unzipBuffer(req.file.buffer);
    let dbRestored = false, files = 0;
    for (const e of entries) {
      const clean = e.name.replace(/^\/+/, '');
      if (clean.includes('..')) continue;
      if (clean === 'mora.db') { db.persist(true); fs.writeFileSync(db.paths.DB_PATH, e.data); dbRestored = true; continue; }
      if (clean.startsWith('uploads/')) {
        const dest = path.join(db.paths.UPLOAD_DIR, clean.replace(/^uploads\//, ''));
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, e.data); files++;
      }
    }
    if (dbRestored) db.reload();
    res.json({ ok: true, dbRestored, files });
  } catch (e) { res.status(400).json({ error: 'Restore failed: ' + e.message }); }
});

module.exports = router;
