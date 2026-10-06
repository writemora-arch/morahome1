// Admin API — every /api/admin route. Auth: session cookie + CSRF header on mutations.
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { db, now, getSetting, setSetting, audit, pushVersion, DATA_DIR } = require('../db');
const M = require('../media');
const { hashPassword, verifyPassword, createSession, destroySession, destroyAllSessions, requireAuth, requireCsrf, rateLimit, ipOf, ROLE_RANK } = require('../auth');
const { slugify, clampInt, codeKey } = require('../util');
const R = require('../render');

const router = express.Router();

/* ================= auth ================= */
const loginLimiter = rateLimit(r => 'login:' + ipOf(r), 10, 10 * 60e3);

router.get('/auth/me', (req, res) => {
  const hasUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c > 0;
  res.json({ ok: true, hasUsers, user: req.user ? { ...req.user } : null, csrf: req.csrf || null });
});
router.post('/auth/setup', loginLimiter, (req, res) => {
  if (db.prepare('SELECT COUNT(*) c FROM users').get().c > 0) return res.status(403).json({ ok: false, error: 'Setup already completed' });
  const { name, email, password } = req.body || {};
  if (!name || !email || !String(password || '').length || String(password).length < 8)
    return res.status(422).json({ ok: false, error: 'Name, valid email and a password of 8+ characters are required.' });
  const r = db.prepare('INSERT INTO users(name,email,pass_hash,role,created_at) VALUES(?,?,?,?,?)')
    .run(String(name).trim(), String(email).trim().toLowerCase(), hashPassword(password), 'owner', now());
  audit({ id: r.lastInsertRowid, name }, 'setup', 'security', 'owner created');
  const csrf = createSession(res, r.lastInsertRowid, true, req);
  res.json({ ok: true, csrf });
});
router.post('/auth/login', loginLimiter, (req, res) => {
  const { email, password, remember } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(String(email || '').trim().toLowerCase());
  const fail = (code) => res.status(401).json({ ok: false, error: code });
  if (!u) return fail('Email or password is incorrect.');
  if (u.locked_until && u.locked_until > now()) return fail('Account temporarily locked — try again in a few minutes.');
  if (!verifyPassword(password, u.pass_hash)) {
    const n = (u.failed_count || 0) + 1;
    db.prepare('UPDATE users SET failed_count=?, locked_until=? WHERE id=?').run(n >= 5 ? 0 : n, n >= 5 ? now() + 15 * 60e3 : u.locked_until, u.id);
    return fail(n >= 5 ? 'Too many attempts — locked for 15 minutes.' : 'Email or password is incorrect.');
  }
  db.prepare('UPDATE users SET failed_count=0, locked_until=0, last_login=? WHERE id=?').run(now(), u.id);
  audit(u, 'login', 'security', u.email, null, null, ipOf(req));
  const csrf = createSession(res, u.id, !!remember, req);
  res.json({ ok: true, csrf, user: { id: u.id, name: u.name, email: u.email, role: u.role } });
});
router.post('/auth/logout', requireAuth(), (req, res) => { destroySession(req); res.clearCookie('mora_sid', { path: '/' }); res.json({ ok: true }); });
router.post('/auth/signout-everywhere', requireAuth(), requireCsrf, (req, res) => { destroyAllSessions(req.user.id, req); res.json({ ok: true }); });
router.put('/auth/password', requireAuth(), requireCsrf, (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(current, u.pass_hash)) return res.status(422).json({ ok: false, error: 'Current password is incorrect.' });
  if (!nextPw || nextPw.length < 8) return res.status(422).json({ ok: false, error: 'New password must be 8+ characters.' });
  db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(nextPw), u.id);
  destroyAllSessions(u.id, req);
  audit(req.user, 'change-password', 'security', u.email);
  res.json({ ok: true });
});

// everything below requires auth + csrf (except GETs need just auth)
router.use((req, res, next) => {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  if (req.method !== 'GET' && req.headers['x-csrf-token'] !== req.csrf)
    return res.status(419).json({ ok: false, error: 'CSRF check failed — refresh and retry' });
  next();
});
const minRole = (role) => (req, res, next) => ROLE_RANK[req.user.role] >= ROLE_RANK[role] ? next() : res.status(403).json({ ok: false, error: 'Insufficient permissions' });

/* ================= users & security ================= */
router.get('/users', minRole('owner'), (req, res) => {
  res.json({ ok: true, users: db.prepare('SELECT id,name,email,role,created_at,last_login FROM users ORDER BY id').all() });
});
router.post('/users', minRole('owner'), (req, res) => {
  const { name, email, password, role } = req.body || {};
  if (!name || !email || !password || password.length < 8 || !ROLE_RANK[role]) return res.status(422).json({ ok: false, error: 'Provide name, email, role and a password of 8+ characters.' });
  try {
    const r = db.prepare('INSERT INTO users(name,email,pass_hash,role,created_at) VALUES(?,?,?,?,?)')
      .run(name.trim(), email.trim().toLowerCase(), hashPassword(password), role, now());
    audit(req.user, 'create', 'security', `user ${email}`);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch (e) { res.status(422).json({ ok: false, error: 'That email is already registered.' }); }
});
router.put('/users/:id', minRole('owner'), (req, res) => {
  const id = +req.params.id;
  const { name, role, password } = req.body || {};
  if (!ROLE_RANK[role]) return res.status(422).json({ ok: false, error: 'Unknown role' });
  if (id === req.user.id && role !== 'owner') return res.status(422).json({ ok: false, error: 'You cannot demote your own account.' });
  db.prepare('UPDATE users SET name=?, role=? WHERE id=?').run(name, role, id);
  if (password) { if (password.length < 8) return res.status(422).json({ ok: false, error: 'Password must be 8+ characters.' }); db.prepare('UPDATE users SET pass_hash=? WHERE id=?').run(hashPassword(password), id); }
  audit(req.user, 'update', 'security', `user #${id}`, null, { role });
  res.json({ ok: true });
});
router.delete('/users/:id', minRole('owner'), (req, res) => {
  const id = +req.params.id;
  if (id === req.user.id) return res.status(422).json({ ok: false, error: 'You cannot delete your own account.' });
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  audit(req.user, 'delete', 'security', `user #${id}`);
  res.json({ ok: true });
});
router.get('/audit', minRole('manager'), (req, res) => {
  const q = `%${String(req.query.q || '').slice(0, 60)}%`;
  const page = clampInt(req.query.page, 1, 999, 1);
  const total = db.prepare('SELECT COUNT(*) c FROM audit_log WHERE (action LIKE ? OR area LIKE ? OR user_name LIKE ? OR object LIKE ?)').get(q, q, q, q).c;
  const rows = db.prepare('SELECT * FROM audit_log WHERE (action LIKE ? OR area LIKE ? OR user_name LIKE ? OR object LIKE ?) ORDER BY id DESC LIMIT 50 OFFSET ?')
    .all(q, q, q, q, (page - 1) * 50);
  res.json({ ok: true, total, page, rows });
});

/* ================= settings groups ================= */
const GROUP_MIN_ROLE = { advanced: 'owner', analytics: 'owner', email: 'manager' };
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key,value,updated_at FROM settings').all();
  const out = {};
  for (const r of rows) { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = {}; } }
  res.json({ ok: true, settings: out });
});
router.put('/settings/:key', (req, res) => {
  const key = String(req.params.key);
  if (!/^[a-zA-Z][a-zA-Z0-9]{1,40}$/.test(key)) return res.status(422).json({ ok: false, error: 'Unknown settings group' });
  const need = GROUP_MIN_ROLE[key] || 'editor';
  if (ROLE_RANK[req.user.role] < ROLE_RANK[need]) return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
  const prev = getSetting(key, {});
  pushVersion('settings', key, prev, req.user.name);
  setSetting(key, req.body ?? {}, req.user.name);
  audit(req.user, 'update', 'settings', key, prev, req.body, ipOf(req));
  R.invalidateCache();
  res.json({ ok: true });
});
router.get('/versions/:type/:key', (req, res) => {
  const rows = db.prepare('SELECT id,created_by,created_at,substr(snapshot,1,200) preview FROM content_versions WHERE content_type=? AND content_key=? ORDER BY id DESC').all(req.params.type, req.params.key);
  res.json({ ok: true, rows });
});
router.post('/versions/:type/:key/revert/:id', (req, res) => {
  const v = db.prepare('SELECT * FROM content_versions WHERE id=? AND content_type=? AND content_key=?').get(+req.params.id, req.params.type, req.params.key);
  if (!v) return res.status(404).json({ ok: false, error: 'Version not found' });
  const snap = JSON.parse(v.snapshot);
  if (v.content_type === 'settings') { setSetting(v.content_key, snap, req.user.name); R.invalidateCache(); }
  else if (v.content_type === 'section') { db.prepare('UPDATE home_sections SET config=?, draft=NULL, updated_at=? WHERE id=?').run(JSON.stringify(snap), now(), +v.content_key); R.invalidateCache(); }
  else if (v.content_type === 'page') { db.prepare('UPDATE pages SET blocks=?, updated_at=? WHERE id=?').run(JSON.stringify(snap), now(), +v.content_key); R.invalidateCache(); }
  audit(req.user, 'revert', v.content_type, v.content_key);
  res.json({ ok: true });
});

/* ================= homepage sections ================= */
router.get('/sections', (req, res) => {
  const rows = db.prepare('SELECT * FROM home_sections ORDER BY sort').all();
  res.json({ ok: true, sections: rows.map(s => ({ ...s, config: JSON.parse(s.config || '{}'), draft: s.draft ? JSON.parse(s.draft) : null })) });
});
router.put('/sections/:id', minRole('editor'), (req, res) => {
  const s = db.prepare('SELECT * FROM home_sections WHERE id=?').get(+req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Section not found' });
  const { config, enabled, publish } = req.body || {};
  if (enabled !== undefined) db.prepare('UPDATE home_sections SET enabled=?, updated_at=? WHERE id=?').run(enabled ? 1 : 0, now(), s.id);
  if (config !== undefined) {
    if (publish) {
      pushVersion('section', String(s.id), JSON.parse(s.config || '{}'), req.user.name);
      db.prepare('UPDATE home_sections SET config=?, draft=NULL, updated_at=? WHERE id=?').run(JSON.stringify(config), now(), s.id);
    } else {
      db.prepare('UPDATE home_sections SET draft=?, updated_at=? WHERE id=?').run(JSON.stringify(config), now(), s.id);
    }
  }
  audit(req.user, 'update', 'homepage', s.name, null, { publish: !!publish });
  R.invalidateCache();
  res.json({ ok: true });
});
router.post('/sections/:id/publish', minRole('editor'), (req, res) => {
  const s = db.prepare('SELECT * FROM home_sections WHERE id=?').get(+req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Section not found' });
  if (s.draft) {
    pushVersion('section', String(s.id), JSON.parse(s.config || '{}'), req.user.name);
    db.prepare('UPDATE home_sections SET config=draft, draft=NULL, updated_at=? WHERE id=?').run(now(), s.id);
  }
  audit(req.user, 'publish', 'homepage', s.name);
  R.invalidateCache();
  res.json({ ok: true });
});
router.post('/sections/reorder', minRole('editor'), (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
  const tx = db.transaction(() => ids.forEach((id, i) => db.prepare('UPDATE home_sections SET sort=? WHERE id=?').run(i, +id)));
  tx();
  audit(req.user, 'reorder', 'homepage', 'sections');
  R.invalidateCache();
  res.json({ ok: true });
});
router.post('/sections/:id/duplicate', minRole('editor'), (req, res) => {
  const s = db.prepare('SELECT * FROM home_sections WHERE id=?').get(+req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Section not found' });
  db.prepare('INSERT INTO home_sections(key,name,sort,enabled,config,updated_at) VALUES(?,?,?,0,?,?)')
    .run(s.key, s.name + ' (Copy)', s.sort + 0.5, s.config, now());
  audit(req.user, 'duplicate', 'homepage', s.name);
  res.json({ ok: true });
});
router.delete('/sections/:id', minRole('manager'), (req, res) => {
  const s = db.prepare('SELECT * FROM home_sections WHERE id=?').get(+req.params.id);
  if (!s) return res.status(404).json({ ok: false, error: 'Section not found' });
  if (['hero', 'contact'].includes(s.key)) return res.status(422).json({ ok: false, error: 'Core sections can be hidden but not deleted.' });
  db.prepare('DELETE FROM home_sections WHERE id=?').run(s.id);
  audit(req.user, 'delete', 'homepage', s.name);
  R.invalidateCache();
  res.json({ ok: true });
});

/* ================= navigation ================= */
router.get('/nav', (req, res) => res.json({ ok: true, items: db.prepare('SELECT * FROM nav_items ORDER BY sort').all() }));
router.post('/nav', minRole('editor'), (req, res) => {
  const { label, url, area = 'main', new_tab } = req.body || {};
  if (!label || !url) return res.status(422).json({ ok: false, error: 'Label and URL are required.' });
  const max = db.prepare('SELECT COALESCE(MAX(sort),-1) m FROM nav_items').get().m;
  const r = db.prepare('INSERT INTO nav_items(label,url,sort,visible,new_tab,area) VALUES(?,?,1,?,?,?)').run(label.trim(), url.trim(), max + 1, new_tab ? 1 : 0, area);
  audit(req.user, 'create', 'navigation', label);
  R.invalidateCache();
  res.json({ ok: true, id: r.lastInsertRowid });
});
router.put('/nav/reorder', minRole('editor'), (req, res) => {
  (req.body?.ids || []).forEach((id, i) => db.prepare('UPDATE nav_items SET sort=? WHERE id=?').run(i, +id));
  R.invalidateCache(); res.json({ ok: true });
});
router.put('/nav/:id', minRole('editor'), (req, res) => {
  const { label, url, visible, new_tab, area } = req.body || {};
  db.prepare('UPDATE nav_items SET label=COALESCE(?,label), url=COALESCE(?,url), visible=COALESCE(?,visible), new_tab=COALESCE(?,new_tab), area=COALESCE(?,area) WHERE id=?')
    .run(label ?? null, url ?? null, visible === undefined ? null : (visible ? 1 : 0), new_tab === undefined ? null : (new_tab ? 1 : 0), area ?? null, +req.params.id);
  audit(req.user, 'update', 'navigation', `#${req.params.id}`);
  R.invalidateCache();
  res.json({ ok: true });
});
router.delete('/nav/:id', minRole('editor'), (req, res) => {
  db.prepare('DELETE FROM nav_items WHERE id=?').run(+req.params.id);
  R.invalidateCache(); res.json({ ok: true });
});

/* ================= pages ================= */
router.get('/pages', (req, res) => res.json({ ok: true, pages: db.prepare('SELECT * FROM pages WHERE deleted_at IS NULL ORDER BY sort, title').all().map(p => ({ ...p, blocks: JSON.parse(p.blocks || '[]'), seo: JSON.parse(p.seo || '{}') })) }));
router.post('/pages', minRole('editor'), (req, res) => {
  const { title } = req.body || {};
  if (!title) return res.status(422).json({ ok: false, error: 'Title is required' });
  let slug = slugify(req.body?.slug || title);
  let i = 2; const base = slug; while (db.prepare('SELECT 1 FROM pages WHERE slug=?').get(slug)) slug = `${base}-${i++}`;
  const max = db.prepare('SELECT COALESCE(MAX(sort),0) m FROM pages').get().m;
  const { lastInsertRowid } = db.prepare('INSERT INTO pages(title,slug,status,blocks,seo,sort,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
    .run(title.trim(), slug, 'draft', '[]', '{}', max + 1, now(), now());
  audit(req.user, 'create', 'pages', title);
  res.json({ ok: true, id: lastInsertRowid, slug });
});
router.put('/pages/:id', minRole('editor'), (req, res) => {
  const p = db.prepare('SELECT * FROM pages WHERE id=?').get(+req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
  const b = req.body || {};
  if (['privacy', 'terms', 'about'].includes(p.slug) && b.slug && b.slug !== p.slug) return res.status(422).json({ ok: false, error: 'Core page URLs are locked.' });
  if (b.blocks !== undefined) pushVersion('page', String(p.id), JSON.parse(p.blocks || '[]'), req.user.name);
  const slug = b.slug ? slugify(b.slug) : p.slug;
  if (slug !== p.slug && db.prepare('SELECT 1 FROM pages WHERE slug=? AND id<>?').get(slug, p.id)) return res.status(422).json({ ok: false, error: 'URL slug already in use.' });
  db.prepare('UPDATE pages SET title=?, slug=?, status=?, blocks=?, seo=?, in_nav=?, sort=?, updated_at=? WHERE id=?')
    .run(b.title ?? p.title, slug, b.status ?? p.status, b.blocks !== undefined ? JSON.stringify(b.blocks) : p.blocks,
      b.seo !== undefined ? JSON.stringify(b.seo) : p.seo, b.in_nav === undefined ? p.in_nav : (b.in_nav ? 1 : 0),
      b.sort ?? p.sort, now(), p.id);
  audit(req.user, 'update', 'pages', b.title ?? p.title);
  R.invalidateCache();
  res.json({ ok: true, slug });
});
router.delete('/pages/:id', minRole('manager'), (req, res) => {
  const p = db.prepare('SELECT * FROM pages WHERE id=?').get(+req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
  if (['privacy', 'terms', 'about'].includes(p.slug)) return res.status(422).json({ ok: false, error: 'Core pages cannot be deleted.' });
  db.prepare('UPDATE pages SET deleted_at=? WHERE id=?').run(now(), p.id);
  audit(req.user, 'delete', 'pages', p.title);
  res.json({ ok: true });
});

/* ================= categories ================= */
router.get('/categories', (req, res) => {
  const rows = db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.deleted_at IS NULL) pc FROM categories c WHERE c.deleted_at IS NULL ORDER BY c.sort`).all();
  res.json({ ok: true, categories: rows });
});
router.post('/categories', minRole('editor'), (req, res) => {
  const { name } = req.body || {};
  if (!name) return res.status(422).json({ ok: false, error: 'Name is required' });
  let slug = slugify(req.body.slug || name);
  let i = 2, base = slug; while (db.prepare('SELECT 1 FROM categories WHERE slug=?').get(slug)) slug = `${base}-${i++}`;
  const max = db.prepare('SELECT COALESCE(MAX(sort),-1) m FROM categories').get().m;
  const r = db.prepare('INSERT INTO categories(name,slug,sort,active,created_at) VALUES(?,?,?,1,?)').run(name.trim(), slug, max + 1, now());
  audit(req.user, 'create', 'categories', name);
  R.invalidateCache();
  res.json({ ok: true, id: r.lastInsertRowid, slug });
});
router.put('/categories/:id', minRole('editor'), (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id=?').get(+req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Not found' });
  const b = req.body || {};
  const slug = b.slug ? slugify(b.slug) : c.slug;
  if (slug !== c.slug && db.prepare('SELECT 1 FROM categories WHERE slug=? AND id<>?').get(slug, c.id)) return res.status(422).json({ ok: false, error: 'Slug in use' });
  db.prepare('UPDATE categories SET name=?, slug=?, description=?, image_id=?, icon=?, sort=?, active=?, seo=? WHERE id=?')
    .run(b.name ?? c.name, slug, b.description ?? c.description, b.image_id === undefined ? c.image_id : (b.image_id || null),
      b.icon ?? c.icon, b.sort ?? c.sort, b.active === undefined ? c.active : (b.active ? 1 : 0),
      b.seo !== undefined ? JSON.stringify(b.seo) : c.seo, c.id);
  audit(req.user, 'update', 'categories', b.name ?? c.name);
  R.invalidateCache();
  res.json({ ok: true, slug });
});
router.delete('/categories/:id', minRole('manager'), (req, res) => {
  const c = db.prepare('SELECT * FROM categories WHERE id=?').get(+req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Not found' });
  const used = db.prepare('SELECT COUNT(*) c FROM products WHERE (category_id=? OR secondary_category_id=?) AND deleted_at IS NULL').get(c.id, c.id).c;
  if (used) return res.status(422).json({ ok: false, error: `${used} product(s) use this category — reassign them first.` });
  db.prepare('UPDATE categories SET deleted_at=? WHERE id=?').run(now(), c.id);
  audit(req.user, 'delete', 'categories', c.name);
  res.json({ ok: true });
});

/* ================= attribute lists (filters) ================= */
router.get('/attributes', (req, res) => {
  const lists = db.prepare('SELECT * FROM attribute_lists ORDER BY sort').all();
  const values = db.prepare('SELECT * FROM attribute_values ORDER BY sort').all();
  res.json({ ok: true, lists: lists.map(l => ({ ...l, values: values.filter(v => v.list_id === l.id) })) });
});
router.post('/attributes/:key/values', minRole('editor'), (req, res) => {
  const l = db.prepare('SELECT * FROM attribute_lists WHERE key=?').get(req.params.key);
  if (!l) return res.status(404).json({ ok: false, error: 'List not found' });
  const v = String(req.body?.value || '').trim();
  if (!v) return res.status(422).json({ ok: false, error: 'Value required' });
  try {
    const max = db.prepare('SELECT COALESCE(MAX(sort),-1) m FROM attribute_values WHERE list_id=?').get(l.id).m;
    const r = db.prepare('INSERT INTO attribute_values(list_id,value,sort) VALUES(?,?,?)').run(l.id, v, max + 1);
    res.json({ ok: true, id: r.lastInsertRowid });
  } catch { res.status(422).json({ ok: false, error: 'Value already exists.' }); }
});
router.put('/attributes/values/:id', minRole('editor'), (req, res) => {
  const { value, enabled, sort } = req.body || {};
  db.prepare('UPDATE attribute_values SET value=COALESCE(?,value), enabled=COALESCE(?,enabled), sort=COALESCE(?,sort) WHERE id=?')
    .run(value ?? null, enabled === undefined ? null : (enabled ? 1 : 0), sort ?? null, +req.params.id);
  res.json({ ok: true });
});
router.delete('/attributes/values/:id', minRole('editor'), (req, res) => {
  db.prepare('DELETE FROM attribute_values WHERE id=?').run(+req.params.id);
  res.json({ ok: true });
});

/* ================= products ================= */
router.get('/products', (req, res) => {
  const q = `%${String(req.query.q || '').slice(0, 60)}%`;
  const page = clampInt(req.query.page, 1, 9999, 1);
  const per = 15;
  const filters = ['p.deleted_at IS NULL', '(p.name LIKE ? OR p.code LIKE ?)'];
  const args = [q, q];
  if (req.query.status && ['draft', 'published', 'scheduled'].includes(req.query.status)) { filters.push('p.status=?'); args.push(req.query.status); }
  if (req.query.category) { filters.push('p.category_id=?'); args.push(+req.query.category); }
  const total = db.prepare(`SELECT COUNT(*) c FROM products p WHERE ${filters.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT p.id,p.code,p.name,p.slug,p.status,p.featured,p.is_new,p.demo,p.category_id,p.updated_at,
      c.name category_name,(SELECT pi.media_id FROM product_images pi WHERE pi.product_id=p.id ORDER BY pi.sort LIMIT 1) media_id
    FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE ${filters.join(' AND ')}
    ORDER BY p.updated_at DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  res.json({ ok: true, total, page, pages: Math.max(1, Math.ceil(total / per)), products: rows.map(p => ({ ...p, image: p.media_id ? M.mediaUrls(db.prepare('SELECT * FROM media_assets WHERE id=?').get(p.media_id)) : null })) });
});
function fullProduct(id) {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) return null;
  p.seo = JSON.parse(p.seo || '{}');
  p.images = db.prepare('SELECT pi.id imgId, pi.sort, pi.alt, m.id media_id FROM product_images pi JOIN media_assets m ON m.id=pi.media_id WHERE pi.product_id=? ORDER BY pi.sort').all(id)
    .map(r => ({ ...r, media: M.mediaUrls(db.prepare('SELECT * FROM media_assets WHERE id=?').get(r.media_id)) }));
  p.tiers = db.prepare('SELECT id,qty,price FROM product_tiers WHERE product_id=? ORDER BY qty').all(id);
  return p;
}
router.get('/products/:id', (req, res) => {
  const p = fullProduct(+req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, product: p });
});
function productFields(b, existing = {}) {
  const str = (k, len = 400, def = '') => { const v = b[k]; return v === undefined ? (existing[k] ?? def) : String(v ?? '').slice(0, len); };
  const num = (k) => { const v = b[k]; return v === undefined ? existing[k] ?? null : (v === '' || v === null ? null : Number(v)); };
  const bool = (k) => b[k] === undefined ? (existing[k] ? 1 : 0) : (b[k] ? 1 : 0);
  return {
    code: (str('code', 30, existing.code || '').toUpperCase().replace(/\s+/g, '-')) ,
    name: str('name', 160), tagline: str('tagline', 240), description: str('description', 8000),
    category_id: num('category_id'), secondary_category_id: num('secondary_category_id'),
    material: str('material', 200), grade: str('grade', 120), thickness: str('thickness', 120), finish: str('finish', 120),
    material_notes: str('material_notes', 2000), care: str('care', 2000), food_safe: bool('food_safe'),
    dimensions: str('dimensions', 160), weight: str('weight', 80), packaging: str('packaging', 200),
    ideal_for: str('ideal_for', 300), gifting: str('gifting', 300), order_type: str('order_type', 120),
    price_mode: ['fixed', 'tiers', 'request'].includes(b.price_mode) ? b.price_mode : (existing.price_mode || 'request'),
    base_price: num('base_price'), moq: num('moq') ?? 1, lead_time: str('lead_time', 120), gst: str('gst', 40), gst_included: bool('gst_included'),
    status: ['draft', 'published', 'scheduled'].includes(b.status) ? b.status : (existing.status || 'draft'),
    scheduled_at: num('scheduled_at'),
    featured: bool('featured'), is_new: bool('is_new'), badge: str('badge', 60), show_price: bool('show_price'),
    seo: b.seo !== undefined ? JSON.stringify(b.seo || {}) : (existing.seo || '{}')
  };
}
router.post('/products', minRole('editor'), (req, res) => {
  const b = productFields(req.body || {});
  if (!b.code || !b.name) return res.status(422).json({ ok: false, error: 'Code and name are required.' });
  if (!/^[A-Z0-9-]+$/.test(b.code)) return res.status(422).json({ ok: false, error: 'Code may only contain letters, numbers and dashes (e.g. MH-2001).' });
  if (b.moq !== null && b.moq <= 0) return res.status(422).json({ ok: false, error: 'MOQ must be at least 1.' });
  if (db.prepare('SELECT 1 FROM products WHERE code=?').get(b.code)) return res.status(422).json({ ok: false, error: `Product code ${b.code} already exists.` });
  let slug = slugify(req.body?.slug || b.name);
  let i = 2, base = slug; while (db.prepare('SELECT 1 FROM products WHERE slug=?').get(slug)) slug = `${base}-${i++}`;
  const r = db.prepare(`INSERT INTO products(code,name,slug,category_id,secondary_category_id,tagline,description,material,grade,thickness,finish,material_notes,care,food_safe,dimensions,weight,packaging,ideal_for,gifting,order_type,price_mode,base_price,moq,lead_time,gst,gst_included,status,scheduled_at,published_at,featured,is_new,badge,show_price,seo,created_at,updated_at)
    VALUES(@code,@name,@slug,@category_id,@secondary_category_id,@tagline,@description,@material,@grade,@thickness,@finish,@material_notes,@care,@food_safe,@dimensions,@weight,@packaging,@ideal_for,@gifting,@order_type,@price_mode,@base_price,@moq,@lead_time,@gst,@gst_included,@status,@scheduled_at,@published_at,@featured,@is_new,@badge,@show_price,@seo,@created_at,@updated_at)`)
    .run({ ...b, slug, published_at: b.status === 'published' ? now() : null, created_at: now(), updated_at: now() });
  saveTiers(r.lastInsertRowid, req.body?.tiers);
  audit(req.user, 'create', 'products', `${b.code} ${b.name}`);
  R.invalidateCache();
  res.json({ ok: true, id: r.lastInsertRowid, slug });
});
router.put('/products/:id', minRole('editor'), (req, res) => {
  const cur = db.prepare('SELECT * FROM products WHERE id=?').get(+req.params.id);
  if (!cur) return res.status(404).json({ ok: false, error: 'Not found' });
  const b = productFields(req.body || {}, cur);
  if (req.body?.code && req.body.code !== cur.code && db.prepare('SELECT 1 FROM products WHERE code=? AND id<>?').get(b.code, cur.id))
    return res.status(422).json({ ok: false, error: `Code ${b.code} is already used.` });
  if (!b.code || !b.name) return res.status(422).json({ ok: false, error: 'Code and name are required.' });
  if (b.moq !== null && b.moq <= 0) return res.status(422).json({ ok: false, error: 'MOQ must be at least 1.' });
  const sets = ['code','name','category_id','secondary_category_id','tagline','description','material','grade','thickness','finish','material_notes','care','food_safe','dimensions','weight','packaging','ideal_for','gifting','order_type','price_mode','base_price','moq','lead_time','gst','gst_included','status','scheduled_at','featured','is_new','badge','show_price','seo'].map(k => `${k}=@${k}`).join(',');
  const published_at = b.status === 'published' && cur.status !== 'published' ? now() : cur.published_at;
  db.prepare(`UPDATE products SET ${sets}, published_at=@published_at, updated_at=@updated_at, demo=0 WHERE id=@id`)
    .run({ ...b, id: cur.id, published_at, updated_at: now() });
  saveTiers(cur.id, req.body?.tiers);
  audit(req.user, 'update', 'products', `${b.code} ${b.name}`);
  R.invalidateCache();
  res.json({ ok: true });
});
function saveTiers(pid, tiers) {
  if (!Array.isArray(tiers)) return;
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM product_tiers WHERE product_id=?').run(pid);
    const ins = db.prepare('INSERT INTO product_tiers(product_id,qty,price) VALUES(?,?,?)');
    for (const t of tiers.slice(0, 20)) {
      const qty = clampInt(t.qty, 1, 9999999, 0), price = Number(t.price);
      if (qty > 0 && price > 0) ins.run(pid, qty, Math.round(price * 100) / 100);
    }
  });
  tx();
}
router.delete('/products/:id', minRole('editor'), (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(+req.params.id);
  if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
  db.prepare('UPDATE products SET deleted_at=? WHERE id=?').run(now(), p.id);
  audit(req.user, 'delete', 'products', `${p.code} ${p.name}`);
  R.invalidateCache();
  res.json({ ok: true });
});
router.post('/products/:id/images', minRole('editor'), (req, res) => {
  const pid = +req.params.id;
  const media = db.prepare('SELECT * FROM media_assets WHERE id=?').get(+req.body?.media_id);
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(pid) || !media) return res.status(404).json({ ok: false, error: 'Not found' });
  const count = db.prepare('SELECT COUNT(*) c FROM product_images WHERE product_id=?').get(pid).c;
  if (count >= 8) return res.status(422).json({ ok: false, error: 'A product can have at most 8 photos.' });
  const max = db.prepare('SELECT COALESCE(MAX(sort),-1) m FROM product_images WHERE product_id=?').get(pid).m;
  const r = db.prepare('INSERT INTO product_images(product_id,media_id,sort,alt) VALUES(?,?,?,?)').run(pid, media.id, max + 1, String(req.body?.alt || '').slice(0, 200));
  res.json({ ok: true, id: r.lastInsertRowid });
});
router.put('/products/:id/images/reorder', minRole('editor'), (req, res) => {
  (req.body?.ids || []).forEach((id, i) => db.prepare('UPDATE product_images SET sort=? WHERE id=? AND product_id=?').run(i, +id, +req.params.id));
  res.json({ ok: true });
});
router.put('/products/:id/images/:imgId', minRole('editor'), (req, res) => {
  db.prepare('UPDATE product_images SET alt=COALESCE(?,alt) WHERE id=? AND product_id=?').run(req.body?.alt ?? null, +req.params.imgId, +req.params.id);
  res.json({ ok: true });
});
router.post('/products/:id/images/:imgId/replace', minRole('editor'), (req, res) => {
  const media = db.prepare('SELECT * FROM media_assets WHERE id=?').get(+req.body?.media_id);
  if (!media) return res.status(404).json({ ok: false, error: 'Media not found' });
  db.prepare('UPDATE product_images SET media_id=? WHERE id=? AND product_id=?').run(media.id, +req.params.imgId, +req.params.id);
  res.json({ ok: true });
});
router.delete('/products/:id/images/:imgId', minRole('editor'), (req, res) => {
  db.prepare('DELETE FROM product_images WHERE id=? AND product_id=?').run(+req.params.imgId, +req.params.id);
  res.json({ ok: true });
});

/* ================= media library ================= */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: M.MAX_BYTES, files: 20 }, fileFilter: (req, file, cb) => cb(null, !!M.ALLOWED[file.mimetype]) });
const docUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024, files: 1 }, fileFilter: (req, file, cb) => cb(null, file.mimetype === 'application/pdf') });

router.get('/media', (req, res) => {
  const q = `%${String(req.query.q || '').slice(0, 60)}%`;
  const page = clampInt(req.query.page, 1, 9999, 1), per = 24;
  const total = db.prepare('SELECT COUNT(*) c FROM media_assets WHERE deleted_at IS NULL AND (name LIKE ? OR tags LIKE ? OR alt LIKE ?)').get(q, q, q).c;
  const rows = db.prepare('SELECT * FROM media_assets WHERE deleted_at IS NULL AND (name LIKE ? OR tags LIKE ? OR alt LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?')
    .all(q, q, q, per, (page - 1) * per);
  res.json({ ok: true, total, page, pages: Math.max(1, Math.ceil(total / per)), media: rows.map(r => ({ ...r, usage: M.mediaUsage(r.id), ...M.mediaUrls(r) })) });
});
router.get('/media/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM media_assets WHERE id=? AND deleted_at IS NULL').get(+req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, media: { ...m, usage: M.mediaUsage(m.id), ...M.mediaUrls(m) } });
});
router.post('/media', minRole('editor'), upload.array('files', 20), async (req, res) => {
  if (!req.files?.length) return res.status(422).json({ ok: false, error: 'No valid image files received (JPG, PNG, WebP, AVIF up to 12 MB).' });
  const out = [];
  for (const f of req.files) {
    try { out.push(await M.processImage(f.buffer, { name: f.originalname, alt: String(req.body?.alt || ''), tags: String(req.body?.tags || ''), user: req.user })); }
    catch (e) { out.push({ error: `${f.originalname}: ${e.message}` }); }
  }
  R.invalidateCache();
  res.json({ ok: true, media: out });
});
router.put('/media/:id', minRole('editor'), (req, res) => {
  const m = db.prepare('SELECT * FROM media_assets WHERE id=?').get(+req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Not found' });
  const { alt, tags, focal, name } = req.body || {};
  db.prepare('UPDATE media_assets SET alt=COALESCE(?,alt), tags=COALESCE(?,tags), focal=COALESCE(?,focal), name=COALESCE(?,name) WHERE id=?')
    .run(alt ?? null, tags ?? null, focal ?? null, name ? String(name).slice(0, 80) : null, m.id);
  res.json({ ok: true });
});
router.post('/media/:id/replace', minRole('editor'), upload.single('file'), async (req, res) => {
  const m = db.prepare('SELECT * FROM media_assets WHERE id=?').get(+req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Not found' });
  if (!req.file) return res.status(422).json({ ok: false, error: 'No file received' });
  const old = { ...m };
  try {
    const nm = await M.processImage(req.file.buffer, { name: req.file.originalname || m.name, user: req.user, mediaId: m.id });
    // remove old files (keep only new original+variants)
    try { fs.unlinkSync(path.join(M.ORIG_DIR, old.file)); } catch { }
    const keep = new Set(db.prepare('SELECT file FROM media_variants WHERE media_id=?').all(m.id).map(r => r.file));
    audit(req.user, 'replace', 'media', `#${m.id}`, { file: old.file }, { file: nm.file });
    R.invalidateCache();
    res.json({ ok: true, media: { ...db.prepare('SELECT * FROM media_assets WHERE id=?').get(m.id), ...M.mediaUrls(nm) } });
  } catch (e) { res.status(422).json({ ok: false, error: e.message }); }
});
router.post('/media/:id/crop', minRole('editor'), async (req, res) => {
  const m = db.prepare('SELECT * FROM media_assets WHERE id=?').get(+req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Not found' });
  const { x = 0, y = 0, w = 100, h = 100 } = req.body || {};
  try {
    const { sharp } = M;
    if (!sharp) return res.status(422).json({ ok: false, error: 'Image processing unavailable' });
    const buf = require('fs').readFileSync(path.join(M.ORIG_DIR, m.file));
    const meta = await sharp(buf).rotate().metadata();
    const left = Math.round((clampInt(x, 0, 99, 0) / 100) * meta.width);
    const top = Math.round((clampInt(y, 0, 99, 0) / 100) * meta.height);
    const cw = Math.max(10, Math.round((clampInt(w, 1, 100, 100) / 100) * meta.width));
    const ch = Math.max(10, Math.round((clampInt(h, 1, 100, 100) / 100) * meta.height));
    const cropped = await sharp(buf).rotate().extract({ left: Math.min(left, meta.width - 10), top: Math.min(top, meta.height - 10), width: Math.min(cw, meta.width), height: Math.min(ch, meta.height) }).toBuffer();
    const nm = await M.processImage(cropped, { name: m.name, user: req.user, mediaId: m.id });
    R.invalidateCache();
    res.json({ ok: true, media: { ...db.prepare('SELECT * FROM media_assets WHERE id=?').get(m.id), ...M.mediaUrls(nm) } });
  } catch (e) { res.status(422).json({ ok: false, error: 'Crop failed: ' + e.message }); }
});
router.get('/media/:id/usage', (req, res) => res.json({ ok: true, usage: M.mediaUsage(+req.params.id) }));
router.delete('/media/:id', minRole('manager'), (req, res) => {
  const m = db.prepare('SELECT * FROM media_assets WHERE id=?').get(+req.params.id);
  if (!m) return res.status(404).json({ ok: false, error: 'Not found' });
  const usage = M.mediaUsage(m.id);
  if (usage.length) return res.status(422).json({ ok: false, error: 'This image is in use and cannot be deleted.', usage });
  M.deleteMediaDirs(m);
  db.prepare('UPDATE media_assets SET deleted_at=? WHERE id=?').run(now(), m.id);
  audit(req.user, 'delete', 'media', `#${m.id} ${m.original_name}`);
  res.json({ ok: true });
});

/* ================= small content CRUD (faqs, testimonials, stats, trust, redirects) ================= */
function simpleCrud(route, table, fields, role = 'editor', auditArea = table) {
  router.get(route, (req, res) => res.json({ ok: true, rows: db.prepare(`SELECT * FROM ${table} ORDER BY sort, id`).all() }));
  router.post(route, minRole(role), (req, res) => {
    const b = req.body || {};
    const cols = [], phs = [], args = [];
    for (const [k, t] of Object.entries(fields)) {
      cols.push(k); phs.push('?');
      args.push(t === 'bool' ? (b[k] ? 1 : 0) : t === 'int' ? clampInt(b[k], 0, 1e9, 0) : String(b[k] ?? '').slice(0, 4000));
    }
    const max = db.prepare(`SELECT COALESCE(MAX(sort),-1) m FROM ${table}`).get().m;
    cols.push('sort'); phs.push('?'); args.push(max + 1);
    const r = db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${phs.join(',')})`).run(...args);
    audit(req.user, 'create', auditArea, b.question || b.name || b.label || b.title || `#${r.lastInsertRowid}`);
    R.invalidateCache();
    res.json({ ok: true, id: r.lastInsertRowid });
  });
  router.put(route + '/:id', minRole(role), (req, res) => {
    const b = req.body || {}, sets = [], args = [];
    for (const [k, t] of Object.entries(fields)) {
      if (b[k] === undefined) continue;
      sets.push(`${k}=?`);
      args.push(t === 'bool' ? (b[k] ? 1 : 0) : t === 'int' ? clampInt(b[k], 0, 1e9, 0) : String(b[k]).slice(0, 4000));
    }
    if (b.sort !== undefined) { sets.push('sort=?'); args.push(clampInt(b.sort, 0, 99999, 0)); }
    if (!sets.length) return res.json({ ok: true });
    args.push(+req.params.id);
    db.prepare(`UPDATE ${table} SET ${sets.join(',')} WHERE id=?`).run(...args);
    audit(req.user, 'update', auditArea, `#${req.params.id}`);
    R.invalidateCache();
    res.json({ ok: true });
  });
  router.delete(route + '/:id', minRole(role), (req, res) => {
    db.prepare(`DELETE FROM ${table} WHERE id=?`).run(+req.params.id);
    audit(req.user, 'delete', auditArea, `#${req.params.id}`);
    R.invalidateCache();
    res.json({ ok: true });
  });
}
simpleCrud('/faqs', 'faqs', { question: 'text', answer: 'text', enabled: 'bool' });
simpleCrud('/testimonials', 'testimonials', { name: 'text', business: 'text', city: 'text', quote: 'text', photo_id: 'int', enabled: 'bool' });
simpleCrud('/stats', 'stats', { label: 'text', value: 'text', auto_products: 'bool', enabled: 'bool' });
simpleCrud('/trust', 'trust_items', { kind: 'text', label: 'text', media_id: 'int', enabled: 'bool' });
simpleCrud('/redirects', 'redirects', { from_path: 'text', to_path: 'text', code: 'int', enabled: 'bool' }, 'manager', 'redirects');

/* ================= leads ================= */
router.get('/leads', minRole('sales'), (req, res) => {
  const tab = String(req.query.tab || 'all');
  const where = ['1=1'], args = [];
  if (tab === 'enquiries') where.push("type IN ('enquiry','contact','enquiry-list')");
  else if (tab === 'catalogue') where.push("type='catalogue'");
  else if (tab === 'whatsapp') where.push("type='whatsapp'");
  else if (tab === 'sample') where.push("type='sample'");
  if (req.query.status) { where.push('status=?'); args.push(String(req.query.status)); }
  if (req.query.q) { const q = `%${String(req.query.q).slice(0, 60)}%`; where.push('(name LIKE ? OR phone LIKE ? OR business LIKE ? OR product_code LIKE ? OR email LIKE ?)'); args.push(q, q, q, q, q); }
  const page = clampInt(req.query.page, 1, 9999, 1), per = 20;
  const total = db.prepare(`SELECT COUNT(*) c FROM leads WHERE ${where.join(' AND ')}`).get(...args).c;
  const rows = db.prepare(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...args, per, (page - 1) * per);
  const items = db.prepare('SELECT * FROM lead_items WHERE lead_id IN (SELECT id FROM leads WHERE ' + where.join(' AND ') + ' ORDER BY id DESC LIMIT ? OFFSET ?)').all(...args, per, (page - 1) * per);
  res.json({ ok: true, total, page, pages: Math.max(1, Math.ceil(total / per)), leads: rows, items, statuses: getSetting('leads', { statuses: [] }).statuses });
});
router.get('/leads.csv', minRole('sales'), (req, res) => {
  const rows = db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 5000').all();
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['id,type,name,phone,email,business,city,product_code,product_name,quantity,status,created,source']
    .concat(rows.map(r => [r.id, r.type, r.name, r.phone, r.email, r.business, r.city, r.product_code, r.product_name, r.quantity, r.status, new Date(r.created_at).toISOString(), r.source_page].map(q).join(','))).join('\n');
  res.set('Content-Type', 'text/csv');
  res.set('Content-Disposition', 'attachment; filename="mora-leads.csv"');
  res.send(csv);
});
router.get('/leads/:id', minRole('sales'), (req, res) => {
  const lead = db.prepare('SELECT * FROM leads WHERE id=?').get(+req.params.id);
  if (!lead) return res.status(404).json({ ok: false, error: 'Not found' });
  res.json({ ok: true, lead, items: db.prepare('SELECT * FROM lead_items WHERE lead_id=?').all(lead.id), notes: db.prepare('SELECT * FROM lead_notes WHERE lead_id=? ORDER BY id DESC').all(lead.id) });
});
router.put('/leads/:id', minRole('sales'), (req, res) => {
  const l = db.prepare('SELECT * FROM leads WHERE id=?').get(+req.params.id);
  if (!l) return res.status(404).json({ ok: false, error: 'Not found' });
  const { status, assignee, follow_up } = req.body || {};
  db.prepare('UPDATE leads SET status=COALESCE(?,status), assignee=COALESCE(?,assignee), follow_up=COALESCE(?,follow_up) WHERE id=?')
    .run(status ?? null, assignee ?? null, follow_up ?? null, l.id);
  audit(req.user, 'update', 'leads', `#${l.id}`, { status: l.status }, { status: status ?? l.status });
  res.json({ ok: true });
});
router.post('/leads/:id/notes', minRole('sales'), (req, res) => {
  const note = String(req.body?.note || '').trim();
  if (!note) return res.status(422).json({ ok: false, error: 'Note is empty' });
  const r = db.prepare('INSERT INTO lead_notes(lead_id,user_name,note,created_at) VALUES(?,?,?,?)').run(+req.params.id, req.user.name, note.slice(0, 2000), now());
  res.json({ ok: true, id: r.lastInsertRowid });
});

/* ================= email ================= */
router.get('/email/jobs', minRole('manager'), (req, res) => {
  res.json({ ok: true, jobs: db.prepare('SELECT * FROM email_jobs ORDER BY id DESC LIMIT 50').all() });
});
router.post('/email/test', minRole('manager'), async (req, res) => {
  const e = getSetting('email', {});
  if (!e.smtpHost) return res.status(422).json({ ok: false, error: 'Configure SMTP settings first.' });
  const to = String(req.body?.to || e.routing?.enquiry || e.smtpUser).trim();
  try {
    const t = require('../email').getTransporter();
    await t.sendMail({ from: `"${e.fromName}" <${e.fromEmail || e.smtpUser}>`, to, subject: 'MORA HOME — test email', text: 'Your MORA HOME email settings are working.' });
    audit(req.user, 'test-email', 'email', to);
    res.json({ ok: true });
  } catch (err) { res.status(422).json({ ok: false, error: String(err.message || err) }); }
});
router.post('/email/retry', minRole('manager'), (req, res) => {
  db.prepare("UPDATE email_jobs SET status='pending', attempts=0, next_run=? WHERE status IN ('failed','unconfigured')").run(now());
  require('../email').processQueue().catch(() => { });
  res.json({ ok: true });
});

/* ================= catalogue ================= */
router.get('/catalogue', (req, res) => res.json({ ok: true, files: db.prepare('SELECT * FROM catalogue_files ORDER BY id DESC').all() }));
router.post('/catalogue', minRole('editor'), docUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(422).json({ ok: false, error: 'Upload a PDF file (max 50 MB).' });
  const name = `catalogue-${Date.now()}.pdf`;
  fs.writeFileSync(path.join(DATA_DIR, 'documents', name), req.file.buffer);
  const r = db.prepare('INSERT INTO catalogue_files(file,label,version,notes,active,size,created_at) VALUES(?,?,?,?,0,?,?)')
    .run(name, String(req.body?.label || 'Catalogue').slice(0, 120), String(req.body?.version || '1.0').slice(0, 20), String(req.body?.notes || '').slice(0, 400), req.file.size, now());
  audit(req.user, 'upload', 'catalogue', req.body?.label || 'Catalogue');
  res.json({ ok: true, id: r.lastInsertRowid });
});
router.put('/catalogue/:id', minRole('editor'), (req, res) => {
  const { label, version, notes, active } = req.body || {};
  const id = +req.params.id;
  if (active) db.prepare('UPDATE catalogue_files SET active=0').run();
  db.prepare('UPDATE catalogue_files SET label=COALESCE(?,label), version=COALESCE(?,version), notes=COALESCE(?,notes), active=COALESCE(?,active) WHERE id=?')
    .run(label ?? null, version ?? null, notes ?? null, active === undefined ? null : (active ? 1 : 0), id);
  res.json({ ok: true });
});
router.delete('/catalogue/:id', minRole('manager'), (req, res) => {
  const c = db.prepare('SELECT * FROM catalogue_files WHERE id=?').get(+req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Not found' });
  try { fs.unlinkSync(path.join(DATA_DIR, 'documents', c.file)); } catch { }
  db.prepare('DELETE FROM catalogue_files WHERE id=?').run(c.id);
  audit(req.user, 'delete', 'catalogue', c.label);
  res.json({ ok: true });
});
router.get('/catalogue/:id/download', (req, res) => {
  const c = db.prepare('SELECT * FROM catalogue_files WHERE id=?').get(+req.params.id);
  if (!c) return res.status(404).json({ ok: false, error: 'Not found' });
  res.download(path.join(DATA_DIR, 'documents', c.file), `${c.label.replace(/[^a-z0-9]+/gi, '-')}-v${c.version}.pdf`);
});

/* ================= search log / dashboard ================= */
router.get('/search-log', (req, res) => {
  const q = String(req.query.q || '').slice(0, 60);
  const where = q ? 'WHERE query LIKE ?' : '';
  const args = q ? [`%${q}%`] : [];
  res.json({
    ok: true,
    recent: db.prepare(`SELECT query,results,created_at FROM search_log ${where} ORDER BY id DESC LIMIT 60`).all(...args),
    zero: db.prepare(`SELECT query, COUNT(*) n, MAX(created_at) last FROM search_log WHERE results=0 GROUP BY query ORDER BY n DESC LIMIT 60`).all(),
    top: db.prepare(`SELECT query, COUNT(*) n FROM search_log GROUP BY query ORDER BY n DESC LIMIT 20`).all()
  });
});
router.get('/dashboard', (req, res) => {
  const day = now() - 86400e3, week = now() - 7 * 86400e3;
  const cnt = (sql, ...a) => db.prepare(sql).get(...a).c;
  const noCat = cnt("SELECT COUNT(*) c FROM categories WHERE deleted_at IS NULL AND image_id IS NULL");
  const noImg = cnt(`SELECT COUNT(*) c FROM products p WHERE p.status='published' AND p.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM product_images pi WHERE pi.product_id=p.id)`);
  const brand = getSetting('brand', {});
  const sitec = getSetting('site', {});
  res.json({
    ok: true,
    stats: {
      leadsToday: cnt('SELECT COUNT(*) c FROM leads WHERE created_at>?', day),
      leadsWeek: cnt('SELECT COUNT(*) c FROM leads WHERE created_at>?', week),
      waWeek: cnt('SELECT COUNT(*) c FROM whatsapp_clicks WHERE created_at>?', week),
      catReq: cnt("SELECT COUNT(*) c FROM leads WHERE type='catalogue'"),
      published: cnt("SELECT COUNT(*) c FROM products WHERE status='published' AND deleted_at IS NULL"),
      drafts: cnt("SELECT COUNT(*) c FROM products WHERE status='draft' AND deleted_at IS NULL"),
      viewsWeek: cnt('SELECT COUNT(*) c FROM product_views WHERE created_at>?', week),
      searchesWeek: cnt('SELECT COUNT(*) c FROM search_log WHERE created_at>?', week),
      zeroWeek: cnt('SELECT COUNT(*) c FROM search_log WHERE results=0 AND created_at>?', week),
      emailPending: cnt("SELECT COUNT(*) c FROM email_jobs WHERE status='pending' OR status='unconfigured'"),
      emailFailed: cnt("SELECT COUNT(*) c FROM email_jobs WHERE status='failed'"),
      mediaTotal: cnt('SELECT COUNT(*) c FROM media_assets WHERE deleted_at IS NULL'),
      storageBytes: M.storageUsageBytes()
    },
    warnings: {
      noLogo: !brand.logoId, noFavicon: !brand.faviconId,
      categoriesNoImage: noCat, productsNoImage: noImg,
      heroNoImage: (() => { const h = db.prepare("SELECT config FROM home_sections WHERE key='hero'").get(); const c = h ? JSON.parse(h.config) : {}; return !c.imageId && !(c.slides || []).some(s => s.imageId); })()
    },
    checklist: {
      logo: !!brand.logoId, favicon: !!brand.faviconId,
      hero: !(db.prepare("SELECT config FROM home_sections WHERE key='hero'").get()?.config || '{}').includes('"imageId":null') || !!(JSON.parse(db.prepare("SELECT config FROM home_sections WHERE key='hero'").get()?.config || '{}').slides || []).filter(s => s.imageId).length,
      contactConfirmed: !!getSetting('business', {}).phone,
      whatsappConfirmed: !!getSetting('business', {}).whatsapp,
      emailTested: cnt("SELECT COUNT(*) c FROM email_jobs WHERE status='sent'") > 0,
      categories: cnt('SELECT COUNT(*) c FROM categories WHERE deleted_at IS NULL') > 0,
      products: cnt("SELECT COUNT(*) c FROM products WHERE deleted_at IS NULL AND demo=0") > 0,
      productsWithPhotos: cnt(`SELECT COUNT(*) c FROM products p WHERE p.deleted_at IS NULL AND p.demo=0 AND EXISTS(SELECT 1 FROM product_images pi WHERE pi.product_id=p.id)`) > 0,
      legalReviewed: !!sitec.legalReviewed,
      catalogue: cnt('SELECT COUNT(*) c FROM catalogue_files') > 0,
      analytics: !!getSetting('analytics', {}).ga4,
      demoPurged: cnt('SELECT COUNT(*) c FROM products WHERE demo=1 AND deleted_at IS NULL') === 0,
      seoReviewed: !!sitec.seoReviewed
    }
  });
});
router.post('/demo/purge', minRole('manager'), (req, res) => {
  const tx = db.transaction(() => {
    const ids = db.prepare('SELECT id FROM products WHERE demo=1').all().map(r => r.id);
    for (const id of ids) { db.prepare('DELETE FROM product_images WHERE product_id=?').run(id); db.prepare('DELETE FROM product_tiers WHERE product_id=?').run(id); }
    db.prepare('DELETE FROM products WHERE demo=1').run();
    db.prepare('DELETE FROM testimonials WHERE demo=1').run();
  });
  tx();
  audit(req.user, 'purge', 'demo', 'demo data removed');
  R.invalidateCache();
  res.json({ ok: true });
});

/* ================= backups ================= */
const TABLES = ['users','sessions','audit_log','settings','content_versions','media_assets','media_variants','pages','home_sections','nav_items','categories','attribute_lists','attribute_values','products','product_images','product_tiers','faqs','stats','testimonials','trust_items','leads','lead_items','lead_notes','email_jobs','whatsapp_clicks','search_log','product_views','catalogue_files','redirects'];
router.get('/backups', minRole('owner'), (req, res) => {
  const dir = path.join(DATA_DIR, 'backups');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => ({ file: f, size: fs.statSync(path.join(dir, f)).size, created: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.created - a.created);
  res.json({ ok: true, files });
});
router.post('/backups', minRole('owner'), (req, res) => {
  const dump = { created: new Date().toISOString(), app: 'mora-home', version: 6, tables: {} };
  for (const t of TABLES) dump.tables[t] = db.prepare(`SELECT * FROM ${t}`).all();
  const name = `mora-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.writeFileSync(path.join(DATA_DIR, 'backups', name), JSON.stringify(dump));
  audit(req.user, 'create', 'backup', name);
  res.json({ ok: true, file: name });
});
router.get('/backups/:file/download', minRole('owner'), (req, res) => {
  const f = path.basename(req.params.file);
  const p = path.join(DATA_DIR, 'backups', f);
  if (!fs.existsSync(p)) return res.status(404).json({ ok: false, error: 'Not found' });
  res.download(p, f);
});
const restoreUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024, files: 1 } });
router.post('/backups/restore', minRole('owner'), restoreUpload.single('file'), (req, res) => {
  if (String(req.body?.confirm || '') !== 'RESTORE') return res.status(422).json({ ok: false, error: 'Type RESTORE to confirm overwriting the database.' });
  try {
    const dump = JSON.parse((req.file ? req.file.buffer.toString() : '') || '{}');
    if (!dump.tables) throw new Error('Not a MORA HOME backup file');
    const tx = db.transaction(() => {
      for (const t of TABLES) {
        if (!Array.isArray(dump.tables[t])) continue;
        db.prepare(`DELETE FROM ${t}`).run();
        for (const row of dump.tables[t]) {
          const cols = Object.keys(row).filter(c => row[c] !== undefined);
          try { db.prepare(`INSERT INTO ${t}(${cols.join(',')}) VALUES(${cols.map(() => '?').join(',')})`).run(...cols.map(c => row[c])); } catch { }
        }
      }
    });
    tx();
    audit(req.user, 'restore', 'backup', req.file?.originalname || 'upload');
    res.json({ ok: true });
  } catch (e) { res.status(422).json({ ok: false, error: 'Restore failed: ' + e.message }); }
});

module.exports = router;
