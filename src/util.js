// Shared helpers (server side)
const crypto = require('crypto');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escAttr = esc;

function slugify(s) {
  return String(s || '').toLowerCase().trim()
    .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '').slice(0, 120) || 'page';
}

// One shared INR formatter: ₹1,25,000 ; returns 'Price on Request' when unset/zero
function inr(n) {
  if (n === null || n === undefined || n === '' || isNaN(Number(n)) || Number(n) <= 0) return 'Price on Request';
  return '₹' + Number(n).toLocaleString('en-IN');
}

function digitsOnly(s) { return String(s || '').replace(/\D/g, ''); }

function phoneHref(p) {
  const d = digitsOnly(p);
  return 'tel:+' + d;
}
function waNumber(p) {
  let d = digitsOnly(p);
  if (d.length === 10) d = '91' + d;
  return d;
}
function waHref(p, text) {
  return 'https://wa.me/' + waNumber(p) + (text ? '?text=' + encodeURIComponent(text) : '');
}
function fmtPhone(p) {
  const d = digitsOnly(p);
  if (d.length === 12 && d.startsWith('91')) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  return p || '';
}

// product-code normalisation: MH-2001 / mh2001 / MH 2001 / 2001 → same key
function codeKey(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^MH/, '');
}

// simple token-level fuzzy match (edit distance ≤ 1 fallback)
function lev1(a, b) {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1 || a.length < 4) return false;
  let i = 0; while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  let j = 0; while (j < Math.min(a.length - i, b.length - i) && a[a.length - 1 - j] === b[b.length - 1 - j]) j++;
  return (a.length - i - j) <= 1;
}
function nameMatches(productName, query) {
  const q = String(query || '').toLowerCase().trim();
  if (!q) return true;
  const hay = String(productName || '').toLowerCase();
  if (hay.includes(q)) return true;
  return q.split(/\s+/).every(qw => hay.split(/\s+/).some(hw => hw.startsWith(qw) || lev1(hw, qw)));
}

function randomToken(bytes = 32) { return crypto.randomBytes(bytes).toString('base64url'); }
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

module.exports = { esc, escAttr, slugify, inr, digitsOnly, phoneHref, waHref, waNumber, fmtPhone, codeKey, nameMatches, randomToken, sha256, clampInt };
