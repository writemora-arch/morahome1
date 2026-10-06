// Authentication, sessions, CSRF, rate limiting — scrypt + httpOnly cookies
const crypto = require('crypto');
const { db, now, audit } = require('./db');
const { sha256, randomToken } = require('./util');

const SESSION_IDLE = 12 * 3600e3;          // 12 h idle
const SESSION_REMEMBER = 30 * 86400e3;     // 30 days
const COOKIE = 'mora_sid';

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(pw), salt, 64, { N: 16384, r: 8, p: 1 });
  return `s2:${salt.toString('base64')}:${key.toString('base64')}`;
}
function verifyPassword(pw, stored) {
  try {
    const [, sSalt, sKey] = String(stored).split(':');
    const key = crypto.scryptSync(String(pw), Buffer.from(sSalt, 'base64'), 64);
    return crypto.timingSafeEqual(key, Buffer.from(sKey, 'base64'));
  } catch { return false; }
}

function createSession(res, userId, remember, req) {
  const token = randomToken(32);
  const csrf = randomToken(24);
  const ttl = remember ? SESSION_REMEMBER : SESSION_IDLE;
  db.prepare('INSERT INTO sessions(user_id,token_hash,csrf,remember,expires_at,last_seen,ip,ua,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(userId, sha256(token), csrf, remember ? 1 : 0, now() + ttl, now(), ipOf(req), String(req.headers['user-agent'] || '').slice(0, 200), now());
  res.cookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: !!process.env.SECURE_COOKIES,
    maxAge: ttl
  });
  return csrf;
}

function destroySession(req) {
  const t = parseCookies(req)[COOKIE];
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(t));
}
function destroyAllSessions(userId, exceptReq) {
  const keep = exceptReq ? sha256(parseCookies(exceptReq)[COOKIE] || '') : null;
  if (keep) db.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').run(userId, keep);
  else db.prepare('DELETE FROM sessions WHERE user_id=?').run(userId);
}

function parseCookies(req) {
  const out = {};
  (req.headers.cookie || '').split(';').forEach(p => {
    const i = p.indexOf('='); if (i > -1) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim());
  });
  return out;
}
function ipOf(req) { return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').toString().split(',')[0].trim(); }

// attach req.user / req.csrf when a valid session cookie exists
function sessionMiddleware(req, res, next) {
  const t = parseCookies(req)[COOKIE];
  req.user = null; req.csrf = null; req.sessionToken = t || null;
  if (!t) return next();
  const row = db.prepare(`SELECT s.id sid, s.csrf, s.expires_at, s.user_id, u.id, u.name, u.email, u.role
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).get(sha256(t));
  if (!row) return next();
  if (row.expires_at < now()) { db.prepare('DELETE FROM sessions WHERE id=?').run(row.sid); return next(); }
  db.prepare('UPDATE sessions SET last_seen=? WHERE id=?').run(now(), row.sid);
  req.user = { id: row.user_id, name: row.name, email: row.email, role: row.role };
  req.csrf = row.csrf;
  next();
}

const ROLE_RANK = { sales: 1, editor: 2, manager: 3, owner: 4 };
function requireAuth(minRole = 'sales') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ ok: false, error: 'Not signed in' });
    if (ROLE_RANK[req.user.role] < ROLE_RANK[minRole]) return res.status(403).json({ ok: false, error: 'Insufficient permissions' });
    next();
  };
}
// CSRF: mutating admin requests must echo the per-session token
function requireCsrf(req, res, next) {
  if (!req.user) return res.status(401).json({ ok: false, error: 'Not signed in' });
  const sent = req.headers['x-csrf-token'];
  if (!sent || sent !== req.csrf) return res.status(419).json({ ok: false, error: 'CSRF check failed — refresh and retry' });
  next();
}

// tiny in-memory rate limiter
const buckets = new Map();
function rateLimit(keyFn, limit, windowMs) {
  return (req, res, next) => {
    const key = keyFn(req);
    const b = buckets.get(key) || { n: 0, reset: now() + windowMs };
    if (now() > b.reset) { b.n = 0; b.reset = now() + windowMs; }
    b.n++; buckets.set(key, b);
    if (b.n > limit) return res.status(429).json({ ok: false, error: 'Too many requests — please wait a moment and try again.' });
    next();
  };
}

module.exports = { hashPassword, verifyPassword, createSession, destroySession, destroyAllSessions, sessionMiddleware, requireAuth, requireCsrf, rateLimit, ipOf, parseCookies, COOKIE, ROLE_RANK };
