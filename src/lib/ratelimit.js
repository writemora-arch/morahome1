/**
 * MORA HOME — tiny in-memory rate limiter (zero dependencies).
 * Single-process by design (the whole app is one Node process).
 * Buckets auto-expire; a sweeper keeps the map from growing forever.
 */
const buckets = new Map(); // key → { count, reset }

/**
 * Register one hit for `key` inside a sliding window.
 * @returns {{allowed:boolean, remaining:number, retryAfter:number}}
 */
function hit(key, windowMs, max) {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) { b = { count: 0, reset: now + windowMs }; buckets.set(key, b); }
  b.count += 1;
  return { allowed: b.count <= max, remaining: Math.max(0, max - b.count), retryAfter: Math.ceil((b.reset - now) / 1000) };
}

/** Clear a bucket (e.g. after a successful login). */
function reset(key) { buckets.delete(key); }

/** Check remaining budget WITHOUT consuming it (for page renders). */
function peek(key, windowMs, max) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) return { allowed: true, remaining: max, retryAfter: 0 };
  return { allowed: b.count < max, remaining: Math.max(0, max - b.count), retryAfter: Math.ceil((b.reset - now) / 1000) };
}

const PRIVATE = /^(::1|::ffff:)?(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|localhost)/;

/**
 * Best-effort client IP behind proxies (Cloudflare → Render → app).
 * Walks the X-Forwarded-For chain from the RIGHT (entries added by trusted
 * proxies) and returns the first public address — this resists clients
 * prepending spoofed IPs. Falls back to the socket address.
 */
function clientIp(req) {
  const chain = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) if (!PRIVATE.test(chain[i])) return chain[i];
  const sock = (req.socket && req.socket.remoteAddress) || '';
  return PRIVATE.test(sock) ? 'local' : sock;
}

/* sweep expired buckets every 10 minutes */
const sweeper = setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 10 * 60 * 1000);
if (sweeper.unref) sweeper.unref();

module.exports = { hit, peek, reset, clientIp };
