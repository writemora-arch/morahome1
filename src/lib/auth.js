/** MORA HOME — tiny session auth (cookie + DB sessions). */
const crypto = require('crypto');
const db = require('../db');

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach((kv) => {
    const i = kv.indexOf('=');
    if (i > -1) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function createSession(res) {
  const token = crypto.randomBytes(24).toString('hex');
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  db.run('INSERT INTO sessions (token, expires_at) VALUES (?,?)', [token, expires]);
  res.setHeader('Set-Cookie', `mora_admin=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 3600}`);
  return token;
}

function sessionToken(req) { return parseCookies(req).mora_admin || null; }

function isAdmin(req) {
  const token = sessionToken(req);
  if (!token) return false;
  const row = db.get('SELECT * FROM sessions WHERE token = ?', [token]);
  if (!row) return false;
  if (new Date(row.expires_at).getTime() < Date.now()) { db.run('DELETE FROM sessions WHERE token = ?', [token]); return false; }
  return true;
}

function destroy(req, res) {
  const token = sessionToken(req);
  if (token) db.run('DELETE FROM sessions WHERE token = ?', [token]);
  res.setHeader('Set-Cookie', 'mora_admin=; HttpOnly; Path=/; Max-Age=0');
}

function verify(user, pass) {
  const auth = db.getSetting('auth', 'live') || db.getSetting('auth', 'draft');
  if (!auth) return false;
  const hash = crypto.createHash('sha256').update(auth.salt + ':' + pass).digest('hex');
  return auth.user === user && hash === auth.hash;
}

function requireAdminApi(req, res, next) {
  if (!isAdmin(req)) return res.status(401).json({ error: 'Not logged in.' });
  next();
}

module.exports = { createSession, isAdmin, destroy, verify, requireAdminApi, sessionToken };
