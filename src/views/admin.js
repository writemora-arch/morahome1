/** MORA HOME — Admin CMS shell + login page (the SPA itself lives in /js/admin.js). */
const { esc } = require('../render');
const { cssVars, fontLink } = require('../theme');
const assets = require('../lib/assets');

const NAV = [
  ['dashboard', '', 'Dashboard'],
  ['customizer', '🎨', 'Customize Design & Layout'],
  ['sections', '🧩', 'Homepage Section Builder'],
  ['products', '📦', 'Products'],
  ['categories', '🗂️', 'Categories'],
  ['leads', '📥', 'Leads Inbox (CRM)'],
  ['contact', '📞', 'Contact & WhatsApp'],
  ['footer', '🦶', 'Footer & Social Links'],
  ['seo', '🔍', 'SEO & Navigation'],
  ['catalogue', '📄', 'Catalogue & PDF Spec Sheets'],
  ['backup', '💾', 'Backup & Restore'],
  ['guide', '📘', 'How to Use This Admin'],
  ['settings', '⚙️', 'Settings & Demo Data'],
];

function adminShell(theme) {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>MORA HOME — Admin Control Center</title>
<link rel="icon" type="image/png" href="/uploads/brand/crest-512.png">
<link rel="stylesheet" href="${fontLink(theme)}">
<link rel="stylesheet" href="${assets.url('css/site.css')}">
<link rel="stylesheet" href="${assets.url('css/admin.css')}">
<style>:root{${cssVars(theme)}}</style>
</head>
<body class="admin-body">
<aside class="admin-side">
  <div class="admin-brand">
    <img src="/uploads/brand/crest-512.png" alt="" width="512" height="396">
    <div><strong>MORA HOME</strong><span>Admin Control Center</span></div>
  </div>
  <nav class="admin-nav" id="adminNav">
    ${NAV.map(([k, i, l]) => `<button data-screen="${k}" class="${k === 'dashboard' ? 'active' : ''}">${i}<span>${l}</span></button>`).join('')}
  </nav>
  <div class="admin-side-foot">
    <a class="side-link" href="/" target="_blank" rel="noopener">🌐 View Live Website ↗</a>
    <button class="side-link" id="adminLogout">🚪 Log out</button>
  </div>
</aside>
<main class="admin-main">
  <header class="admin-top">
    <h1 id="adminTitle">Dashboard</h1>
    <div class="admin-top-actions">
      <span class="publish-state" id="publishState"></span>
      <button class="abtn ghost" id="revertBtn" title="Undo unpublished changes">↩️ Revert</button>
      <button class="abtn primary" id="publishBtn">🚀 Publish Changes</button>
    </div>
  </header>
  <div class="admin-content" id="adminContent"><div class="loading-block">Loading your website control center…</div></div>
</main>
<div class="admin-modal-backdrop" id="adminModal" hidden><div class="admin-modal" id="adminModalBody"></div></div>
<div class="toast" id="toast" hidden></div>
<script src="${assets.url('js/admin.js')}"></script>
</body></html>`;
}

/* Login page (audit C1): no username prefill, no password hints, noindexed,
   CSRF double-submit token embedded as a hidden field. */
function loginPage(theme, error = '', csrf = '') {
  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin Login — MORA HOME</title>
<link rel="icon" type="image/png" href="/uploads/brand/crest-512.png">
<link rel="stylesheet" href="${fontLink(theme)}">
<link rel="stylesheet" href="${assets.url('css/site.css')}">
<link rel="stylesheet" href="${assets.url('css/admin.css')}">
<style>:root{${cssVars(theme)}}</style>
</head>
<body class="login-body">
<form class="login-card" method="post" action="/admin/login">
  <input type="hidden" name="_csrf" value="${esc(csrf)}">
  <img class="login-crest" src="/uploads/brand/crest-transparent.png" alt="MORA HOME crest" width="1400" height="1082">
  <h1>Admin Control Center</h1>
  <p class="login-sub">Authorised staff only. No coding needed — everything is managed visually.</p>
  ${error ? `<p class="login-error">${esc(error)}</p>` : ''}
  <label>Username<input name="user" autocomplete="username" required placeholder="Username"></label>
  <label>Password<input name="pass" type="password" autocomplete="current-password" required placeholder="Password"></label>
  <button class="abtn primary btn-block" type="submit">Log in</button>
</form>
</body></html>`;
}

module.exports = { adminShell, loginPage };
