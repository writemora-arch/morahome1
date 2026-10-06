// MORA HOME — server bootstrap
const path = require('path');
const fs = require('fs');
const express = require('express');

const { db, seedIfEmpty, getSetting, setSetting, DATA_DIR } = require('./db');
const { sessionMiddleware } = require('./auth');
const M = require('./media');

seedIfEmpty();

// register the brand logo (owner-provided file) as media asset #1 on first run
(async () => {
  try {
    if (!db.prepare('SELECT 1 FROM media_assets WHERE id=1').get()) {
      const staged = path.join(DATA_DIR, 'uploads', 'originals', 'brand-logo.jpeg');
      const bundled = path.join(__dirname, '..', 'assets', 'brand-logo.jpeg');
      // staging file may live in the repo (fresh deploys): copy into the data dir
      if (!fs.existsSync(staged) && fs.existsSync(bundled)) fs.copyFileSync(bundled, staged);
      if (fs.existsSync(staged) && M.sharp) {
        const buf = fs.readFileSync(staged);
        const m = await M.processImage(buf, { name: 'MORA-HOME-logo', alt: 'MORA HOME logo', tags: 'brand logo', user: { name: 'seed' } });
        const brand = getSetting('brand', {});
        if (!brand.logoId) { brand.logoId = m.id; brand.faviconId = m.id; brand.ogImageId = m.id; setSetting('brand', brand, 'seed'); }
        console.log(`[seed] brand logo registered as media #${m.id}`);
        try { fs.unlinkSync(staged); } catch { }
      }
    }
  } catch (e) { console.warn('[seed] logo registration skipped:', e.message); }
})();

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);

app.use(sessionMiddleware);
app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '2mb' }));

// security headers (kept friendly for the inline-free frontend)
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('X-Frame-Options', 'SAMEORIGIN');
  next();
});

// health check (Render/Railway probes)
app.get('/healthz', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));

// static assets
const PUB = path.join(__dirname, '..', 'public');
app.use('/css', express.static(path.join(PUB, 'css'), { maxAge: '1d' }));
app.use('/js', express.static(path.join(PUB, 'js'), { maxAge: '1d' }));
app.use('/images', express.static(path.join(PUB, 'images'), { maxAge: '7d' }));
app.use('/media/o', express.static(path.join(DATA_DIR, 'uploads', 'originals'), { maxAge: '30d', immutable: true }));
app.use('/media/v', express.static(path.join(DATA_DIR, 'uploads', 'variants'), { maxAge: '30d', immutable: true }));

// variant URLs: /media/v/12/800.webp → data/uploads/variants/m12-800.webp
app.get('/media/v/:id/:w.:fmt', (req, res) => {
  const id = parseInt(req.params.id, 10), w = parseInt(req.params.w, 10);
  const fmt = req.params.fmt === 'avif' ? 'avif' : 'webp';
  const v = db.prepare('SELECT file FROM media_variants WHERE media_id=? AND width=? AND format=?').get(id, w, fmt);
  if (!v) return res.redirect(302, db.prepare('SELECT file FROM media_assets WHERE id=?').get(id) ? `/media/o/${db.prepare('SELECT file FROM media_assets WHERE id=?').get(id).file}` : '/');
  res.sendFile(path.join(DATA_DIR, 'uploads', 'variants', v.file), { maxAge: '30d', immutable: true });
});

// admin SPA (static html), guarded client-side; API enforces auth
app.use('/admin', express.static(path.join(PUB, 'admin'), { maxAge: 0 }));

// routes (admin API first so the public 404 can never swallow it)
app.use('/api/admin', require('./routes/admin'));
app.use('/', require('./routes/public'));

// scheduled products → publish when due
setInterval(() => {
  try {
    db.prepare(`UPDATE products SET status='published', published_at=? WHERE status='scheduled' AND scheduled_at IS NOT NULL AND scheduled_at<=? AND deleted_at IS NULL`)
      .run(Date.now(), Date.now());
  } catch { }
}, 60e3).unref();

// API 404 + error handler
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error('[server]', err.message);
  if (req.path.startsWith('/api')) return res.status(err.status || 500).json({ ok: false, error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large' : 'Something went wrong — please try again.' });
  res.status(500).send('<!doctype html><meta charset="utf-8"><title>MORA HOME</title><p style="font-family:system-ui;padding:2rem">Something went wrong. Please try again in a moment.</p>');
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n MORA HOME v6 — http://localhost:${PORT}`);
  const hasUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c > 0;
  console.log(hasUsers ? ' Admin: /admin' : ' First run: open /admin to create the owner account');
});
