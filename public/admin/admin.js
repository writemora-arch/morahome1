/* MORA HOME Admin — vanilla JS single-page CMS. No frameworks. */
(function () {
'use strict';
/* ============ core ============ */
const $ = (s, c) => (c || document).querySelector(s);
const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let ME = null, CSRF = null;
const ROLE_RANK = { sales: 1, editor: 2, manager: 3, owner: 4 };
const can = r => ME && ROLE_RANK[ME.role] >= ROLE_RANK[r];

async function api(path, opts = {}) {
  const o = { headers: {}, ...opts };
  if (opts.body && typeof opts.body === 'string') o.headers['Content-Type'] = 'application/json';
  if (opts.method && opts.method !== 'GET' && CSRF) o.headers['X-CSRF-Token'] = CSRF;
  const r = await fetch('/api/admin' + path, o);
  if (r.status === 401) { showAuth(); throw new Error('Not signed in'); }
  let j = {};
  try { j = await r.json(); } catch (e) { }
  if (!r.ok || j.ok === false) throw new Error(j.error || ('Request failed (' + r.status + ')'));
  return j;
}
let toastT;
function toast(msg, err) { const t = $('#a-toast'); t.textContent = msg; t.className = 'a-toast show' + (err ? ' err' : ''); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2800); }
function openModal(title, html) { $('#a-modal-title').textContent = title; $('#a-modal-body').innerHTML = html; $('#a-modal').hidden = false; return $('#a-modal-body'); }
function closeModal() { $('#a-modal').hidden = true; }
document.addEventListener('click', e => { if (e.target.closest('[data-modal-close]') || e.target.id === 'a-modal') closeModal(); });
function confirmAction(msg) { return new Promise(res => { const b = openModal('Please confirm', `<p>${esc(msg)}</p><div class="a-row end"><button class="a-btn a-btn-ghost" data-modal-close>Cancel</button><button class="a-btn a-btn-danger" id="cf-ok">Confirm</button></div>`); $('#cf-ok', b).onclick = () => { closeModal(); res(true); }; b.querySelector('[data-modal-close]').onclick = () => res(false); }); }
function openDrawer(title, bodyHtml, footHtml) {
  closeDrawer();
  const o = document.createElement('div'); o.className = 'a-overlay'; o.id = 'a-overlay';
  const d = document.createElement('div'); d.className = 'a-drawer'; d.id = 'a-drawer';
  d.innerHTML = `<div class="a-drawer-head"><h2>${title}</h2><button class="a-icon-btn" data-dclose aria-label="Close">✕</button></div>
    <div class="a-drawer-body">${bodyHtml}</div>${footHtml ? `<div class="a-drawer-foot">${footHtml}</div>` : ''}`;
  document.body.append(o, d);
  requestAnimationFrame(() => d.classList.add('open'));
  o.onclick = closeDrawer; d.querySelector('[data-dclose]').onclick = closeDrawer;
  $$('input,textarea,select', d.querySelector('.a-drawer-body')).forEach(i => i.addEventListener('input', markDirty));
  return d;
}
function closeDrawer() { $('#a-drawer')?.remove(); $('#a-overlay')?.remove(); markClean(); }
let DIRTY = false;
function markDirty() { if (DIRTY || !$('#a-shell')) return; DIRTY = true; const u = document.createElement('div'); u.className = 'unsaved'; u.id = 'unsaved'; u.innerHTML = '<span>Unsaved changes</span>'; document.body.appendChild(u); }
function markClean() { DIRTY = false; $('#unsaved')?.remove(); }
window.addEventListener('beforeunload', e => { if (DIRTY) { e.preventDefault(); e.returnValue = ''; } });

/* form=binding helpers: data-b="path.to.key" */
function setPath(obj, path, val) { const ks = path.split('.'); let o = obj; ks.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); o[ks.at(-1)] = val; }
function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }
function fill(root, obj) { $$('[data-b]', root).forEach(i => { const v = getPath(obj, i.dataset.b); if (i.type === 'checkbox') i.checked = !!v; else if (i.type === 'color') i.value = /^#[0-9a-f]{6}$/i.test(v || '') ? v : '#5C3D2E'; else i.value = v ?? ''; }); }
function collect(root) { const o = {}; $$('[data-b]', root).forEach(i => { let v; if (i.type === 'checkbox') v = i.checked; else if (i.dataset.num !== undefined) v = i.value === '' ? null : Number(i.value); else v = i.value; setPath(o, i.dataset.b, v); }); return o; }
const fld = (label, inner, help, ex) => `<div class="a-fld"><label>${esc(label)}</label>${inner}${ex ? `<div class="a-ex">e.g. ${esc(ex)}</div>` : ''}${help ? `<div class="a-help">${help}</div>` : ''}</div>`;
const inp = (path, type = 'text', attrs = '') => `<input data-b="${path}" type="${type}" ${attrs}>`;
const ta = (path, rows = 3) => `<textarea data-b="${path}" rows="${rows}"></textarea>`;
const sel = (path, opts) => `<select data-b="${path}">${opts.map(o => `<option value="${esc(o[0])}">${esc(o[1])}</option>`).join('')}</select>`;
const sw = (path, label) => `<label style="display:flex;gap:.6rem;align-items:center;font-weight:500"><span class="a-switch"><input data-b="${path}" type="checkbox"><i></i></span>${esc(label)}</label>`;
function imgPicker(path, label, help) {
  return fld(label, `<div class="a-row"><div class="a-thumb" data-imgthumb="${path}"><span>None</span></div><input type="hidden" data-b="${path}">
    <button type="button" class="a-btn a-btn-ghost a-btn-sm" data-pick="${path}">Choose…</button>
    <button type="button" class="a-btn a-btn-ghost a-btn-sm" data-clear="${path}">Clear</button></div>
    <div class="a-help">Pick from Media Library or upload on the spot. ${help || ''}</div>`);
}
function wirePickers(root) {
  $$('[data-pick]', root).forEach(b => b.onclick = () => mediaPicker(id => { const h = $(`input[data-b="${b.dataset.pick}"]`, root); h.value = id || ''; h.dispatchEvent(new Event('input')); refreshThumb(b.dataset.pick, root); }));
  $$('[data-clear]', root).forEach(b => b.onclick = () => { const h = $(`input[data-b="${b.dataset.clear}"]`, root); h.value = ''; h.dispatchEvent(new Event('input')); refreshThumb(b.dataset.clear, root); });
}
async function refreshThumb(path, root) {
  const h = $(`input[data-b="${path}"]`, root); const box = $(`[data-imgthumb="${path}"]`, root);
  if (!box) return;
  const id = h?.value;
  if (!id) { box.innerHTML = '<span>None</span>'; return; }
  try { const j = await api('/media?q=&page=1'); const m = j.media.find(x => x.id == id) || (await api('/media?q=')).media.find(x => x.id == id);
    if (m) box.innerHTML = `<img src="${m.src}" alt="">`; else box.innerHTML = '<span>#' + esc(id) + '</span>'; }
  catch (e) { box.innerHTML = '<span>#' + esc(id) + '</span>'; }
}
async function hydratePickers(root) { for (const t of $$('[data-imgthumb]', root)) await refreshThumb(t.dataset.imgthumb, root); }

/* ---- media picker modal (choose one / upload) ---- */
function mediaPicker(onPick) {
  const b = openModal('Media Library — choose an image', `
    <div class="a-toolbar"><input type="search" id="mp-q" placeholder="Search name, tag or alt text…"><button class="a-btn a-btn-pri" id="mp-up">Upload New</button><input type="file" id="mp-file" accept="image/*" multiple hidden></div>
    <div class="media-grid" id="mp-grid"></div><div class="a-pager" id="mp-pager"></div>`);
  let page = 1;
  async function load() {
    const j = await api(`/media?q=${encodeURIComponent($('#mp-q', b).value)}&page=${page}`);
    $('#mp-grid', b).innerHTML = j.media.length ? j.media.map(m => `<div class="media-cell" data-id="${m.id}" title="${esc(m.alt || m.original_name)}"><div class="mc-img"><img src="${m.src}" alt="" loading="lazy"></div><div class="mc-name">${esc(m.name)}</div></div>`).join('') : '<div class="a-empty" style="grid-column:1/-1">No images yet — upload the first one.</div>';
    $$('.media-cell', b).forEach(c => c.onclick = () => { closeModal(); onPick(+c.dataset.id); });
    $('#mp-pager', b).innerHTML = j.pages > 1 ? `<button class="a-btn a-btn-ghost a-btn-sm" ${page <= 1 ? 'disabled' : ''} id="mpp"><</button><span>${page} / ${j.pages}</span><button class="a-btn a-btn-ghost a-btn-sm" ${page >= j.pages ? 'disabled' : ''} id="mpn">></button>` : '';
    if ($('#mpp', b)) $('#mpp', b).onclick = () => { page--; load(); };
    if ($('#mpn', b)) $('#mpn', b).onclick = () => { page++; load(); };
  }
  $('#mp-q', b).oninput = debounce(() => { page = 1; load(); }, 300);
  $('#mp-up', b).onclick = () => $('#mp-file', b).click();
  $('#mp-file', b).onchange = async e => {
    const fd = new FormData(); Array.from(e.target.files).forEach(f => fd.append('files', f));
    try { const j = await api('/media', { method: 'POST', body: fd }); toast('Uploaded'); load(); } catch (err) { toast(err.message, true); }
  };
  load();
}
function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }
function fmtBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB'; }
function fmtDate(ts) { return ts ? new Date(ts).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }

/* ============ shell + router ============ */
const SCREENS = [
  { id: 'dashboard', g: 'Overview', t: 'Dashboard', icon: '◈' },
  { id: 'leads', g: 'Overview', t: 'Leads Inbox', icon: '✉', min: 'sales' },
  { id: 'products', g: 'Catalogue', t: 'Products', icon: '▤', min: 'editor' },
  { id: 'categories', g: 'Catalogue', t: 'Categories & Filters', icon: '▦', min: 'editor' },
  { id: 'media', g: 'Catalogue', t: 'Media Library', icon: '❏', min: 'editor' },
  { id: 'documents', g: 'Catalogue', t: 'Documents & Catalogue', icon: '⬇', min: 'editor' },
  { id: 'homepage', g: 'Website', t: 'Homepage Builder', icon: '⌂', min: 'editor' },
  { id: 'pages', g: 'Website', t: 'Pages', icon: '▤', min: 'editor' },
  { id: 'nav', g: 'Website', t: 'Navigation & Footer', icon: '☰', min: 'editor' },
  { id: 'content', g: 'Website', t: 'Content (FAQ · Quotes)', icon: '❝', min: 'editor' },
  { id: 'forms', g: 'Website', t: 'Forms Builder', icon: '✎', min: 'editor' },
  { id: 'theme', g: 'Configure', t: 'Brand & Theme', icon: '◐', min: 'editor' },
  { id: 'business', g: 'Configure', t: 'Business Info', icon: '⚲', min: 'editor' },
  { id: 'commerce', g: 'Configure', t: 'Commerce', icon: '₹', min: 'manager' },
  { id: 'whatsapp', g: 'Configure', t: 'WhatsApp', icon: '✆', min: 'editor' },
  { id: 'email', g: 'Configure', t: 'Email', icon: '@', min: 'manager' },
  { id: 'seo', g: 'Configure', t: 'SEO & Analytics', icon: '◎', min: 'editor' },
  { id: 'site', g: 'Configure', t: 'Site Controls', icon: '⚙', min: 'manager' },
  { id: 'security', g: 'System', t: 'Security & Users', icon: '⛨', min: 'owner' },
  { id: 'backup', g: 'System', t: 'Backup & Restore', icon: '⛁', min: 'owner' },
  { id: 'audit', g: 'System', t: 'Audit Log', icon: '☷', min: 'manager' },
  { id: 'guide', g: 'System', t: 'Admin Guide', icon: '?' },
];
function renderShell() {
  const app = $('#app');
  const groups = [...new Set(SCREENS.map(s => s.g))];
  app.innerHTML = `<div class="a-shell" id="a-shell">
    <aside class="a-side" id="a-side">
      <div class="brand"><b>MORA HOME</b><span style="font-size:.65rem;letter-spacing:.2em;opacity:.6">ADMIN</span></div>
      <nav class="a-nav">${groups.map(g => `<div class="grp">${g}</div>` + SCREENS.filter(s => s.g === g && can(s.min || 'sales')).map(s => `<a href="#/${s.id}" data-nav="${s.id}"><span>${s.icon}</span> ${s.t}</a>`).join('')).join('')}</nav>
      <div class="a-user"><div><b>${esc(ME.name)}</b><span style="font-size:.72rem;opacity:.7">${esc(ME.email)}</span></div><span class="role">${esc(ME.role)}</span><button id="a-logout">Sign out</button></div>
    </aside>
    <div class="a-main">
      <div class="a-top"><button class="a-burger" id="a-burger" aria-label="Menu">☰</button><h1 id="a-title">Dashboard</h1>
        <button class="a-kbtn" id="a-k">⌘K <span style="opacity:.7">Search</span></button>
        <a class="a-btn a-btn-ghost a-btn-sm" href="/" target="_blank" rel="noopener">View Site ↗</a></div>
      <div class="a-view" id="a-view"></div>
    </div></div>`;
  $('#a-logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); location.reload(); };
  $('#a-burger').onclick = () => $('#a-side').classList.toggle('open');
  $('#a-k').onclick = openPalette;
  document.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); } });
  window.addEventListener('hashchange', route);
  route();
}
function route() {
  $('#a-side')?.classList.remove('open');
  const [id, arg1] = (location.hash.replace(/^#\//, '') || 'dashboard').split('/');
  const sc = SCREENS.find(s => s.id === id) || SCREENS[0];
  if (!can(sc.min || 'sales')) { $('#a-view').innerHTML = '<div class="a-empty">Your role does not include this area.</div>'; return; }
  $('#a-title').textContent = sc.t;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === sc.id));
  closeDrawer(); closeModal();
  VIEWS[sc.id]($('#a-view'), arg1);
}

const VIEWS = {};
/* ============ sub-app helpers ============ */
async function settingsGet(key) { const j = await api('/settings'); return j.settings[key] || {}; }
async function settingsPut(key, data) { await api('/settings/' + key, { method: 'PUT', body: JSON.stringify(data) }); toast('Saved'); markClean(); }
function saveBar(msg) { return `<div class="a-row end" style="margin-top:1rem"><span class="a-help" style="margin-right:auto">${msg || ''}</span><button class="a-btn a-btn-pri" data-save>Save Changes</button></div>`; }
function wireSave(view, fn) { const b = $('[data-save]', view); if (b) b.onclick = fn; }
async function versionsModal(type, key, label) {
  const j = await api(`/versions/${type}/${encodeURIComponent(key)}`);
  const b = openModal('Version history — ' + label, j.rows.length ? j.rows.map(v => `
    <div class="a-listitem"><div class="grow"><b>${fmtDate(v.created_at)}</b> · by ${esc(v.created_by || '?')}<div class="a-help">${esc(v.preview)}…</div></div>
    <button class="a-btn a-btn-ghost a-btn-sm" data-vert="${v.id}">Restore</button></div>`).join('') : '<div class="a-empty">No earlier versions yet — versions are captured on each save/publish (last 20 kept).</div>');
  $$('[data-vert]', b).forEach(btn => btn.onclick = async () => {
    await api(`/versions/${type}/${encodeURIComponent(key)}/revert/${btn.dataset.vert}`, { method: 'POST', body: '{}' });
    closeModal(); toast('Restored previous version'); route();
  });
}

/* ============ generic CRUD list (faqs, testimonials, stats, trust, redirects) ============ */
function crudList(container, route, cols, editFields, label) {
  let rows = [];
  async function load() {
    const j = await api(route); rows = j.rows;
    container.innerHTML = `
      <div class="a-toolbar"><button class="a-btn a-btn-pri" id="cl-add">+ Add ${label}</button></div>
      ${rows.length ? rows.map((r, i) => `<div class="a-listitem">
        <div class="a-sort-btns"><button data-mv="${i},-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-mv="${i},1" ${i === rows.length - 1 ? 'disabled' : ''}>▼</button></div>
        <div class="grow">${cols.map(c => `<div><span class="a-help">${c.l}</span> ${c.f ? c.f(r) : esc(r[c.k])}</div>`).join('')}</div>
        ${r.enabled !== undefined ? `<span class="a-badge ${r.enabled ? 'green' : ''}">${r.enabled ? 'On' : 'Off'}</span>` : ''}
        <button class="a-btn a-btn-ghost a-btn-sm" data-ed="${r.id}">Edit</button>
        <button class="a-btn a-btn-danger a-btn-sm" data-del="${r.id}">Delete</button></div>`).join('') : `<div class="a-empty">No ${label}s yet.</div>`}`;
    $('#cl-add', container).onclick = () => edit(null);
    $$('[data-ed]', container).forEach(b => b.onclick = () => edit(rows.find(x => x.id == b.dataset.ed)));
    $$('[data-del]', container).forEach(b => b.onclick = async () => { if (await confirmAction(`Delete this ${label}?`)) { await api(`${route}/${b.dataset.del}`, { method: 'DELETE' }); toast('Deleted'); load(); } });
    $$('[data-mv]', container).forEach(b => b.onclick = async () => {
      const [i, d] = b.dataset.mv.split(',').map(Number);
      const other = rows[i + d];
      await api(`${route}/${rows[i].id}`, { method: 'PUT', body: JSON.stringify({ sort: other.sort }) });
      await api(`${route}/${other.id}`, { method: 'PUT', body: JSON.stringify({ sort: rows[i].sort }) });
      load();
    });
  }
  function edit(row) {
    const b = openModal((row ? 'Edit ' : 'Add ') + label, editFields.map(f =>
      f.k === 'enabled' ? sw('enabled', 'Enabled / visible') :
      f.type === 'ta' ? fld(f.l, ta(f.k, f.rows || 4), f.h) :
      f.type === 'img' ? imgPicker(f.k, f.l, f.h) :
      f.type === 'sel' ? fld(f.l, sel(f.k, f.opts), f.h) :
      fld(f.l, inp(f.k, f.type || 'text'), f.h, f.ex)).join('') +
      `<div class="a-row end"><button class="a-btn a-btn-ghost" data-modal-close>Cancel</button><button class="a-btn a-btn-pri" id="cl-save">Save</button></div>`);
    if (row) fill(b, row); wirePickers(b); hydratePickers(b);
    $('#cl-save', b).onclick = async () => {
      const data = collect(b);
      if (row) await api(`${route}/${row.id}`, { method: 'PUT', body: JSON.stringify(data) });
      else await api(route, { method: 'POST', body: JSON.stringify(data) });
      closeModal(); toast('Saved'); load();
    };
  }
  load();
}
const sortBtns = (arr, i, onchg) => `<div class="a-sort-btns"><button type="button" data-mv="${i},-1" ${i === 0 ? 'disabled' : ''}>▲</button><button type="button" data-mv="${i},1" ${i === arr.length - 1 ? 'disabled' : ''}>▼</button></div>`;
/* items-array editor used by sections + blocks */
function arrayEditor(container, arr, defFields, onChange) {
  function render() {
    container.innerHTML = arr.map((it, i) => `<div class="a-listitem" data-i="${i}" style="align-items:flex-start;flex-wrap:wrap">
      ${sortBtns(arr, i)}
      <div class="grow" style="min-width:220px;display:grid;gap:.4rem">
        ${defFields.map(f => f.type === 'img' ? imgPicker(`item.${i}.${f.k}`, f.l) :
          f.type === 'sel' ? `<div><label class="a-help">${f.l}</label><select data-af="${i}.${f.k}">${f.opts.map(o => `<option value="${esc(o[0])}" ${it[f.k] === o[0] ? 'selected' : ''}>${esc(o[1])}</option>`).join('')}</select></div>` :
          f.type === 'bool' ? `<label style="display:flex;gap:.5rem;align-items:center;font-weight:500;font-size:.8rem"><input type="checkbox" data-af="${i}.${f.k}" ${it[f.k] ? 'checked' : ''} style="width:auto"> ${f.l}</label>` :
          `<div><label class="a-help">${f.l}</label>${f.type === 'ta' ? `<textarea rows="2" data-af="${i}.${f.k}">${esc(it[f.k] || '')}</textarea>` : `<input data-af="${i}.${f.k}" value="${esc(it[f.k] ?? '')}">`}</div>`).join('')}
      </div>
      <button type="button" class="a-icon-btn" data-dupe title="Duplicate">⧉</button>
      <button type="button" class="a-icon-btn" data-del title="Delete">✕</button></div>`).join('') +
      `<div style="margin-top:.7rem"><button type="button" class="a-btn a-btn-ghost a-btn-sm" data-add-it>+ Add Item</button></div>`;
    $$('[data-af]', container).forEach(i => i.oninput = () => { const [idx, key] = i.dataset.af.split('.'); arr[idx][key] = i.type === 'checkbox' ? i.checked : i.value; onChange && onChange(); });
    $$('input[data-b^="item."]', container).forEach(h => h.oninput = () => { const [, idx, key] = h.dataset.b.split('.'); arr[idx][key] = h.value ? +h.value : null; onChange && onChange(); });
    $$('[data-mv]', container).forEach(b => b.onclick = () => { const [i, d] = b.dataset.mv.split(',').map(Number); [arr[i], arr[i + d]] = [arr[i + d], arr[i]]; render(); onChange && onChange(); });
    $$('[data-dupe]', container).forEach(b => b.onclick = () => { const i = +b.closest('.a-listitem').dataset.i; arr.splice(i + 1, 0, JSON.parse(JSON.stringify(arr[i]))); render(); onChange && onChange(); });
    $$('[data-del]', container).forEach(b => b.onclick = async () => { if (await confirmAction('Remove this item?')) { arr.splice(+b.closest('.a-listitem').dataset.i, 1); render(); onChange && onChange(); } });
    $('[data-add-it]', container).onclick = () => { arr.push(Object.fromEntries(defFields.filter(f => !['bool'].includes(f.type)).map(f => [f.k, f.type === 'img' ? null : '']))); render(); onChange && onChange(); };
    wirePickers(container); hydratePickers(container);
  }
  render();
}

/* ============ DASHBOARD ============ */
VIEWS.dashboard = async (v) => {
  v.innerHTML = '<div class="a-empty">Loading…</div>';
  const j = await api('/dashboard');
  const s = j.stats, w = j.warnings, c = j.checklist;
  const warns = [];
  if (w.noLogo) warns.push(['No logo uploaded', '#/theme']);
  if (w.noFavicon) warns.push(['No favicon configured', '#/theme']);
  if (w.heroNoImage) warns.push(['Hero image not uploaded — homepage shows a branded placeholder', '#/homepage']);
  if (w.productsNoImage) warns.push([`${w.productsNoImage} published product(s) have no photo`, '#/products']);
  if (w.categoriesNoImage) warns.push([`${w.categoriesNoImage} categor${w.categoriesNoImage > 1 ? 'ies' : 'y'} missing images`, '#/categories']);
  if (s.emailPending) warns.push([`${s.emailPending} email(s) waiting — check SMTP settings`, '#/email']);
  if (s.emailFailed) warns.push([`${s.emailFailed} email(s) failed to send`, '#/email']);
  const checks = [
    ['Logo uploaded', c.logo, '#/theme'], ['Favicon configured', c.favicon, '#/theme'],
    ['Hero image uploaded', c.hero, '#/homepage'], ['Contact details confirmed', c.contactConfirmed, '#/business'],
    ['WhatsApp confirmed', c.whatsappConfirmed, '#/whatsapp'], ['Email tested', c.emailTested, '#/email'],
    ['Real categories created', c.categories, '#/categories'], ['Real products created', c.products, '#/products'],
    ['Product photography uploaded', c.productsWithPhotos, '#/products'], ['Legal pages reviewed', c.legalReviewed, '#/site'],
    ['Catalogue uploaded (optional)', c.catalogue, '#/documents'], ['Analytics configured (optional)', c.analytics, '#/seo'],
    ['Demo data removed', c.demoPurged, '#/site'], ['SEO reviewed', c.seoReviewed, '#/seo']
  ];
  const done = checks.filter(x => x[1]).length;
  v.innerHTML = `
    <div class="a-grid a-grid-3">
      ${[['Leads today', s.leadsToday], ['Leads this week', s.leadsWeek], ['WhatsApp clicks (7d)', s.waWeek], ['Catalogue requests', s.catReq], ['Published products', s.published], ['Drafts', s.drafts], ['Product views (7d)', s.viewsWeek], ['Searches (7d)', s.searchesWeek], ['Zero-result searches (7d)', s.zeroWeek], ['Follow-ups / pending emails', s.emailPending], ['Media files', s.mediaTotal], ['Storage used', fmtBytes(s.storageBytes)]].map(x => `<div class="a-stat"><b>${x[1]}</b><span>${x[0]}</span></div>`).join('')}
    </div>
    <div class="a-grid a-grid-2" style="margin-top:1rem">
      <div class="a-card"><h2>Missing Content Warnings</h2>
        ${warns.length ? warns.map(x => `<div class="a-warn"><span>⚠</span><span>${esc(x[0])} <a href="${x[1]}" style="font-weight:700">Fix →</a></span></div>`).join('') : '<p class="a-help">Nothing missing — well done.</p>'}
      </div>
      <div class="a-card"><h2>Go-Live Checklist <span class="a-badge green">${done}/${checks.length}</span></h2>
        ${checks.map(x => `<div class="check-item ${x[1] ? 'done' : ''}"><span class="tick">${x[1] ? '✓' : '·'}</span>${esc(x[0])}<a href="${x[2]}">open →</a></div>`).join('')}
      </div>
    </div>
    <div class="a-card" style="margin-top:1rem"><h2>Quick Actions</h2><div class="a-row">
      <a class="a-btn a-btn-pri" href="#/products/new">+ New Product</a>
      <a class="a-btn a-btn-ghost" href="#/media">Upload Images</a>
      <a class="a-btn a-btn-ghost" href="#/homepage">Edit Homepage</a>
      <a class="a-btn a-btn-ghost" href="#/leads">Open Leads</a>
      <a class="a-btn a-btn-ghost" href="/" target="_blank">Preview Site ↗</a></div></div>`;
};

/* ============ LEADS ============ */
VIEWS.leads = async (v) => {
  let tab = 'all', page = 1, q = '', status = '', viewMode = 'table';
  async function load() {
    const j = await api(`/leads?tab=${tab}&page=${page}&q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`);
    const tabs = [['all', 'All'], ['enquiries', 'Enquiries'], ['catalogue', 'Catalogue Requests'], ['whatsapp', 'WhatsApp Leads'], ['sample', 'Sample Requests']];
    const itemsOf = id => j.items.filter(i => i.lead_id === id);
    v.innerHTML = `
      <div class="a-toolbar">
        <div class="a-tabs">${tabs.map(t => `<button class="${tab === t[0] ? 'on' : ''}" data-tab="${t[0]}">${t[1]}</button>`).join('')}</div>
        <input type="search" id="ld-q" placeholder="Search name, phone, code…" value="${esc(q)}">
        <select id="ld-status"><option value="">All statuses</option>${j.statuses.map(s => `<option ${status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select>
        <button class="a-btn a-btn-ghost a-btn-sm" id="ld-view">${viewMode === 'table' ? 'Kanban view' : 'Table view'}</button>
        <a class="a-btn a-btn-ghost a-btn-sm" href="/api/admin/leads.csv" target="_blank">Export CSV</a>
        <button class="a-btn a-btn-ghost a-btn-sm" id="ld-statuses">Manage statuses</button>
      </div>
      ${viewMode === 'table' ? `<div class="a-table-wrap"><table><thead><tr><th>When</th><th>Type</th><th>Name</th><th>Contact</th><th>Requirement</th><th>Status</th><th>Email</th><th></th></tr></thead><tbody>
        ${j.leads.map(l => `<tr data-open="${l.id}" style="cursor:pointer">
          <td style="white-space:nowrap">${new Date(l.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}<br><span class="a-help">${new Date(l.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span></td>
          <td><span class="a-badge">${esc(l.type)}</span></td>
          <td><b>${esc(l.name)}</b><br><span class="a-help">${esc(l.business || '')}</span></td>
          <td><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a><br><span class="a-help">${esc(l.email || '')}</span></td>
          <td>${l.product_code ? `<b>${esc(l.product_code)}</b> ${esc(l.product_name || '')}` : itemsOf(l.id).map(i => `<div>${i.quantity}× ${esc(i.product_code)}</div>`).join('') || '—'}${l.quantity ? `<div class="a-help">Qty ${l.quantity}</div>` : ''}</td>
          <td><span class="a-badge ${['Won'].includes(l.status) ? 'green' : ['Lost'].includes(l.status) ? 'red' : ['New'].includes(l.status) ? 'amber' : ''}">${esc(l.status)}</span></td>
          <td><span class="a-badge ${l.email_status === 'sent' ? 'green' : l.email_status === 'failed' ? 'red' : ''}">${esc(l.email_status)}</span></td>
          <td>→</td></tr>`).join('') || '<tr><td colspan="8"><div class="a-empty">No leads yet. Share the website — enquiries, WhatsApp chats and catalogue requests land here.</div></td></tr>'}
        </tbody></table></div>
        <div class="a-pager" id="ld-pager"><button class="a-btn a-btn-ghost a-btn-sm" ${page <= 1 ? 'disabled' : ''} data-p="-1">← Prev</button><span>${page} / ${j.pages} (${j.total})</span><button class="a-btn a-btn-ghost a-btn-sm" ${page >= j.pages ? 'disabled' : ''} data-p="1">Next →</button></div>`
      : `<div class="kanban">${j.statuses.map(st => { const ls = j.leads.filter(l => l.status === st); return `<div class="k-col"><h3>${esc(st)} <span class="a-badge">${ls.length}</span></h3>
          ${ls.map(l => `<div class="k-card" data-open="${l.id}"><b>${esc(l.name)}</b><span class="a-help">${esc(l.type)} · ${new Date(l.created_at).toLocaleDateString('en-IN')}</span><br>${esc(l.product_code || l.business || '')}</div>`).join('')}</div>`; }).join('')}</div>`}`;
    $$('[data-tab]', v).forEach(b => b.onclick = () => { tab = b.dataset.tab; page = 1; load(); });
    $('#ld-q', v).oninput = debounce(() => { q = $('#ld-q', v).value; page = 1; load(); }, 350);
    $('#ld-status', v).onchange = e => { status = e.target.value; page = 1; load(); };
    $('#ld-view', v).onclick = () => { viewMode = viewMode === 'table' ? 'kanban' : 'table'; load(); };
    $$('[data-p]', v).forEach(b => b.onclick = () => { page += +b.dataset.p; load(); });
    $('#ld-statuses', v).onclick = async () => {
      const st = (await settingsGet('leads')).statuses || [];
      const b = openModal('Lead statuses', `<p class="a-help">One per line. Used in the pipeline dropdown and Kanban columns.</p><textarea id="st-ta" rows="8">${esc(st.join('\n'))}</textarea><div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-pri" id="st-save">Save</button></div>`);
      $('#st-save', b).onclick = async () => { await settingsPut('leads', { statuses: $('#st-ta', b).value.split('\n').map(x => x.trim()).filter(Boolean) }); closeModal(); load(); };
    };
    $$('[data-open]', v).forEach(r => r.onclick = () => openLead(+r.dataset.open, load));
  }
  load();
};
async function openLead(id, reload) {
  const j = await api('/leads/' + id); const l = j.lead;
  const st = (await settingsGet('leads')).statuses || [];
  const waNum = String(l.phone || '').replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91');
  const d = openDrawer(`Lead #${l.id} — ${esc(l.name)}`, `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h3>Contact</h3>
        <p style="margin:.2rem 0"><b>${esc(l.name)}</b> ${l.business ? `· ${esc(l.business)}` : ''}</p>
        <p style="margin:.2rem 0"><a href="tel:${esc(l.phone)}">${esc(l.phone)}</a><br>${l.email ? `<a href="mailto:${esc(l.email)}">${esc(l.email)}</a>` : '<span class="a-help">no email</span>'}<br>${esc(l.city || '')}</p>
        <div class="a-row"><a class="a-btn a-btn-pri a-btn-sm" href="https://wa.me/${waNum}" target="_blank" rel="noopener">WhatsApp</a>
        <a class="a-btn a-btn-ghost a-btn-sm" href="tel:${esc(l.phone)}">Call</a>
        ${l.email ? `<a class="a-btn a-btn-ghost a-btn-sm" href="mailto:${esc(l.email)}">Email</a>` : ''}</div></div>
      <div class="a-card"><h3>Context</h3>
        <p class="a-help" style="margin:.2rem 0">Type: <b>${esc(l.type)}</b> · ${fmtDate(l.created_at)} · ${esc(l.device || '?')}<br>Source: ${esc(l.source_page || '—')}<br>Email status: <b>${esc(l.email_status)}</b></p>
        ${Object.keys(JSON.parse(l.utm || '{}')).length ? `<p class="a-help">UTM: ${esc(JSON.stringify(JSON.parse(l.utm)))}</p>` : ''}</div>
    </div>
    <div class="a-card" style="margin-top:.8rem"><h3>Requirement</h3>
      ${l.product_code ? `<p><b>${esc(l.product_code)}</b> — ${esc(l.product_name || '')} ${l.quantity ? `(Qty ${l.quantity})` : ''}</p>` : ''}
      ${j.items.length ? `<ul style="margin:.3rem 0;padding-left:1.1rem">${j.items.map(i => `<li>${i.quantity}× ${esc(i.product_code)} ${esc(i.product_name || '')}</li>`).join('')}</ul>` : ''}
      ${l.message ? `<p style="white-space:pre-wrap">${esc(l.message)}</p>` : ''}</div>
    <div class="a-card" style="margin-top:.8rem"><h3>Pipeline</h3>
      <div class="a-grid a-grid-3">
        <div class="a-fld"><label>Status</label><select id="ld-st">${st.map(s => `<option ${l.status === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}</select></div>
        <div class="a-fld"><label>Assignee</label><input id="ld-as" value="${esc(l.assignee || '')}" placeholder="Team member"></div>
        <div class="a-fld"><label>Follow-up date</label><input id="ld-fu" type="date" value="${esc(l.follow_up || '')}"></div>
      </div>
      <button class="a-btn a-btn-pri a-btn-sm" id="ld-save">Save Pipeline</button></div>
    <div class="a-card" style="margin-top:.8rem"><h3>Notes</h3>
      <div id="ld-notes">${j.notes.map(n => `<div class="a-listitem"><div class="grow"><b>${esc(n.user_name)}</b> <span class="a-help">${fmtDate(n.created_at)}</span><div>${esc(n.note)}</div></div></div>`).join('') || '<p class="a-help">No notes yet.</p>'}</div>
      <div class="a-row" style="margin-top:.6rem"><input id="ld-note" placeholder="Add an internal note…"><button class="a-btn a-btn-ghost" id="ld-addnote" type="button">Add</button></div></div>`);
  $('#ld-save', d).onclick = async () => { await api('/leads/' + id, { method: 'PUT', body: JSON.stringify({ status: $('#ld-st', d).value, assignee: $('#ld-as', d).value, follow_up: $('#ld-fu', d).value }) }); toast('Saved'); markClean(); reload && reload(); };
  $('#ld-addnote', d).onclick = async () => { const t = $('#ld-note', d).value.trim(); if (!t) return; await api(`/leads/${id}/notes`, { method: 'POST', body: JSON.stringify({ note: t }) }); toast('Note added'); openLead(id, reload); };
}

/* ============ PRODUCTS ============ */
VIEWS.products = async (v, arg) => {
  if (arg === 'new') return productEditor(v, null);
  if (arg) {
    const j = await api('/products/' + arg).catch(() => null);
    if (j) return productEditor(v, j.product);
  }
  let page = 1, q = '', status = '';
  async function load() {
    const j = await api(`/products?q=${encodeURIComponent(q)}&page=${page}&status=${status}`);
    v.innerHTML = `
      <div class="a-toolbar"><a class="a-btn a-btn-pri" href="#/products/new">+ New Product</a>
        <input type="search" id="pr-q" placeholder="Search name or code…" value="${esc(q)}">
        <select id="pr-st"><option value="">All statuses</option>${['draft', 'published', 'scheduled'].map(s => `<option ${status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div class="a-table-wrap"><table><thead><tr><th>Photo</th><th>Code</th><th>Name</th><th>Category</th><th>Status</th><th>Flags</th><th></th></tr></thead><tbody>
        ${j.products.map(p => `<tr>
          <td><div class="a-thumb">${p.image ? `<img src="${p.image.src}" alt="">` : '<span>No photo</span>'}</div></td>
          <td><b>${esc(p.code)}</b>${p.demo ? ' <span class="a-badge amber">demo</span>' : ''}</td>
          <td><a href="#/products/${p.id}"><b>${esc(p.name)}</b></a><br><span class="a-help">/products/${esc(p.slug)}</span></td>
          <td>${esc(p.category_name || '—')}</td>
          <td><span class="a-badge ${p.status === 'published' ? 'green' : p.status === 'scheduled' ? 'amber' : ''}">${p.status}</span></td>
          <td>${p.featured ? '<span class="a-badge">Featured</span> ' : ''}${p.is_new ? '<span class="a-badge">New</span>' : ''}</td>
          <td style="white-space:nowrap"><a class="a-btn a-btn-ghost a-btn-sm" href="/products/${esc(p.slug)}" target="_blank">View ↗</a>
            <a class="a-btn a-btn-ghost a-btn-sm" href="#/products/${p.id}">Edit</a></td></tr>`).join('') || '<tr><td colspan="7"><div class="a-empty">No products yet. Create the first one — photos are optional, branded placeholders show until you upload.</div></td></tr>'}
      </tbody></table></div>
      <div class="a-pager"><button class="a-btn a-btn-ghost a-btn-sm" ${page <= 1 ? 'disabled' : ''} id="pp">← Prev</button><span>${page} / ${j.pages} (${j.total})</span><button class="a-btn a-btn-ghost a-btn-sm" ${page >= j.pages ? 'disabled' : ''} id="pn">Next →</button></div>`;
    $('#pr-q', v).oninput = debounce(() => { q = $('#pr-q', v).value; page = 1; load(); }, 350);
    $('#pr-st', v).onchange = e => { status = e.target.value; page = 1; load(); };
    $('#pp', v).onclick = () => { page--; load(); };
    $('#pn', v).onclick = () => { page++; load(); };
  }
  load();
};
async function productEditor(v, p) {
  const isNew = !p;
  if (isNew) p = { seo: {}, tiers: [], images: [], status: 'draft', moq: 1, price_mode: 'request', food_safe: 0 };
  const cats = (await api('/categories')).categories;
  const tabs = ['basic', 'material', 'details', 'pricing', 'photos', 'seo', 'publish'];
  const T = { basic: 'Basic', material: 'Material & Care', details: 'Details', pricing: 'Pricing & MOQ', photos: 'Photos', seo: 'SEO', publish: 'Publish' };
  v.innerHTML = `
    <div class="a-toolbar"><a class="a-btn a-btn-ghost a-btn-sm" href="#/products">← All products</a>
      <h2 style="margin:0;flex:1">${isNew ? 'New product' : esc(p.code + ' — ' + p.name)}</h2>
      ${!isNew ? `<a class="a-btn a-btn-ghost a-btn-sm" href="/products/${esc(p.slug)}" target="_blank">Preview on Site ↗</a>
      <a class="a-btn a-btn-ghost a-btn-sm" href="/products/${esc(p.slug)}/spec.pdf" target="_blank">Spec PDF ↗</a>
      <button class="a-btn a-btn-danger a-btn-sm" id="pd-del">Delete</button>` : ''}</div>
    <div class="a-tabs">${tabs.map((t, i) => `<button data-pt="${t}" class="${i === 0 ? 'on' : ''}">${T[t]}</button>`).join('')}</div>
    <div id="pe-body"></div>
    <div class="a-row end" style="margin-top:1rem"><span class="a-help" id="pe-msg" style="margin-right:auto"></span>
      <button class="a-btn a-btn-pri" id="pe-save">${isNew ? 'Create Product' : 'Save Product'}</button></div>`;
  const body = $('#pe-body', v);
  function render(tab) {
    $$('[data-pt]', v).forEach(b => b.classList.toggle('on', b.dataset.pt === tab));
    if (tab === 'basic') body.innerHTML = `<div class="a-grid a-grid-2">
      ${fld('Product Code *', inp('code'), 'Unique. Buyers quote this code — keep it stable. Search treats MH-2001 / mh2001 / 2001 as the same.', 'MH-2001')}
      ${fld('Product Name *', inp('name'), '', 'Hammered Brass Serving Tray')}
      ${fld('URL Slug', inp('slug'), 'Lowercase-with-dashes. Leave blank to auto-generate.', 'brass-serving-tray')}
      ${fld('Category', sel('category_id', [['', '— choose —']].concat(cats.map(c => [c.id, c.name]))))}
      ${fld('Secondary Category', sel('secondary_category_id', [['', '— none —']].concat(cats.map(c => [c.id, c.name]))))}
      ${fld('Tagline', inp('tagline'), 'One line shown under the name.')}
      </div>${fld('Description', ta('description', 6), 'Shown on the product page. Blank lines start new paragraphs.')}`;
    if (tab === 'material') body.innerHTML = `<div class="a-grid a-grid-2">
      ${fld('Material', inp('material'), '', 'Brass / Steel / Wood / Iron / Aluminium')}
      ${fld('Grade', inp('grade'))}
      ${fld('Thickness', inp('thickness'))}
      ${fld('Finish', inp('finish'), '', 'Antique / Polished / Matte')}
      ${fld('Material Notes', ta('material_notes', 3))}${fld('Care Instructions', ta('care', 3))}
      </div>${sw('food_safe', 'Food-safe product')}`;
    if (tab === 'details') body.innerHTML = `<div class="a-grid a-grid-2">
      ${fld('Dimensions', inp('dimensions'), '', '35 × 25 × 4 cm')}
      ${fld('Weight', inp('weight'), '', '1.2 kg')}
      ${fld('Packaging', inp('packaging'), '', 'Bubble wrap + export carton')}
      ${fld('Ideal For', inp('ideal_for'), '', 'Hospitality, Gifting')}
      ${fld('Gifting Suitability', inp('gifting'), '', 'Corporate, Return gifting')}
      ${fld('Order Type', sel('order_type', [['', '—'], ['Ready Stock', 'Ready Stock'], ['Make to Order', 'Make to Order']]))}
      </div>`;
    if (tab === 'pricing') body.innerHTML = `<div class="a-grid a-grid-2">
      ${fld('Price Display', sel('price_mode', [['request', 'Price on Request (default)'], ['fixed', 'Fixed wholesale price'], ['tiers', 'Bulk tier pricing']]))}
      ${fld('Base Price (₹ / pc)', inp('base_price', 'number', 'data-num min="0"'), 'Never shows ₹0 — empty = Price on Request.')}
      ${fld('MOQ (pcs) *', inp('moq', 'number', 'data-num min="1"'), 'Minimum order quantity. Must be ≥ 1.')}
      ${fld('Lead Time', inp('lead_time'), '', '3–4 weeks')}
      ${fld('GST', inp('gst'), '', '18%')}
      <div>${sw('gst_included', 'GST included in price')}<div style="height:.6rem"></div>${sw('show_price', 'Show price publicly (otherwise “Price on Request”)')}</div>
      </div><div class="a-card"><h3>Bulk Tiers <span class="a-help">Quantity → Price per piece</span></h3><div id="tier-editor"></div></div>`;
    if (tab === 'photos') body.innerHTML = `
      <div class="a-warn" style="margin-bottom:1rem"><span>ℹ</span><span>Up to 8 photos per product. Photo 1 is the main image; photo 2 is used as the desktop hover image in listings. No photo → a branded placeholder is shown publicly.</span></div>
      ${isNew ? '<div class="a-empty">Save the product first, then add photos.</div>' : `
      <div class="a-toolbar"><button class="a-btn a-btn-pri a-btn-sm" id="pe-addimg">+ Add from Media Library</button></div>
      <div id="pe-images"></div>`}`;
    if (tab === 'seo') body.innerHTML = `<div class="a-grid a-grid-2">
      ${fld('Meta Title', inp('seo.title'), 'Shown in Google & browser tabs.', 'Brass Serving Tray MH-2001 — MORA HOME')}
      ${fld('Canonical URL', inp('seo.canonical'), 'Leave blank for default.')}
      </div>${fld('Meta Description', ta('seo.description', 3), '~155 characters for search results.')}`;
    if (tab === 'publish') body.innerHTML = `<div class="a-grid a-grid-2">
      ${fld('Status', sel('status', [['draft', 'Draft (hidden)'], ['published', 'Published (live)'], ['scheduled', 'Scheduled (auto-publishes)']]))}
      ${fld('Schedule Date/Time', inp('scheduled_at_ui', 'datetime-local'))}
      <div class="a-card"><h3>Flags</h3>${sw('featured', 'Featured (homepage “Featured Products”)')}<div style="height:.5rem"></div>${sw('is_new', 'Mark as New Arrival')}<div style="height:.8rem"></div>${fld('Badge', inp('badge'), 'Shown on the product card. e.g. “Bestseller”, “Diwali Pick”')}</div>
      <div class="a-card"><h3>Publishing notes</h3><p class="a-help">Drafts and scheduled items never appear publicly. Publishing takes effect immediately (public cache refreshes within 5 seconds).</p></div>
      </div>`;
    // fill simple fields
    const flat = { ...p, scheduled_at_ui: p.scheduled_at ? new Date(p.scheduled_at).toISOString().slice(0, 16) : '' };
    fill(body, flat);
    ['code', 'name', 'slug', 'tagline', 'description', 'material', 'grade', 'thickness', 'finish', 'material_notes', 'care', 'dimensions', 'weight', 'packaging', 'ideal_for', 'gifting', 'order_type', 'base_price', 'moq', 'lead_time', 'gst', 'badge', 'status', 'price_mode'].forEach(k => { const el = body.querySelector(`[data-b="${k}"]`); if (el) { if (el.type === 'checkbox') el.checked = !!p[k]; else el.value = p[k] ?? ''; } });
    ['featured', 'is_new', 'show_price', 'gst_included', 'food_safe'].forEach(k => { const el = body.querySelector(`[data-b="${k}"]`); if (el) el.checked = !!p[k]; });
    if (tab === 'pricing') renderTiers();
    if (tab === 'photos' && !isNew) renderImages();
  }
  function renderTiers() {
    const box = $('#tier-editor', body);
    const tiers = p.tiers || (p.tiers = []);
    box.innerHTML = tiers.map((t, i) => `<div class="a-row" data-ti="${i}" style="margin-bottom:.4rem">
      <input type="number" min="1" placeholder="Qty (e.g. 100)" value="${t.qty ?? ''}" data-tq style="max-width:140px"> →
      <input type="number" min="0" step="0.01" placeholder="₹ price / pc" value="${t.price ?? ''}" data-tp style="max-width:160px">
      <button class="a-icon-btn" data-tr type="button">✕</button></div>`).join('') +
      `<button class="a-btn a-btn-ghost a-btn-sm" id="tier-add" type="button">+ Add Tier</button>`;
    $$('[data-tq]', box).forEach((i, n) => i.oninput = () => p.tiers[n].qty = i.value);
    $$('[data-tp]', box).forEach((i, n) => i.oninput = () => p.tiers[n].price = i.value);
    $$('[data-tr]', box).forEach(b => b.onclick = () => { p.tiers.splice(+b.closest('[data-ti]').dataset.ti, 1); renderTiers(); });
    $('#tier-add', box).onclick = () => { p.tiers.push({ qty: '', price: '' }); renderTiers(); };
  }
  async function renderImages() {
    const box = $('#pe-images', body); if (!box) return;
    const j = await api('/products/' + p.id); p.images = j.product.images;
    box.innerHTML = p.images.map((im, i) => `<div class="a-listitem" data-img="${im.imgId}">
      <div class="a-sort-btns"><button data-imv="${i},-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-imv="${i},1" ${i === p.images.length - 1 ? 'disabled' : ''}>▼</button></div>
      <div class="a-thumb"><img src="${im.media.src}" alt=""></div>
      <div class="grow">${i === 0 ? '<span class="a-badge green">Main photo</span> ' : ''}${i === 1 ? '<span class="a-badge">Hover photo</span>' : ''}
        <label class="a-help" style="margin-top:.2rem">Alt text (accessibility & SEO)</label><input data-ialt value="${esc(im.alt || '')}" placeholder="e.g. Hammered brass tray, top view"></div>
      <button class="a-btn a-btn-ghost a-btn-sm" data-irep>Replace</button>
      <button class="a-btn a-btn-danger a-btn-sm" data-idel>Delete</button></div>`).join('') || '<div class="a-empty">No photos yet — the product shows a branded placeholder on the site.</div>';
    $$('[data-imv]', box).forEach(b => b.onclick = async () => {
      const [i, d] = b.dataset.imv.split(',').map(Number);
      const ids = p.images.map(x => x.imgId);
      [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
      await api(`/products/${p.id}/images/reorder`, { method: 'PUT', body: JSON.stringify({ ids }) });
      renderImages();
    });
    $$('[data-ialt]', box).forEach(inp2 => inp2.onchange = async () => {
      const id = +inp2.closest('[data-img]').dataset.img;
      await api(`/products/${p.id}/images/${id}`, { method: 'PUT', body: JSON.stringify({ alt: inp2.value }) }); toast('Alt text saved');
    });
    $$('[data-irep]', box).forEach(b => b.onclick = () => mediaPicker(async mid => {
      const id = +b.closest('[data-img]').dataset.img;
      await api(`/products/${p.id}/images/${id}/replace`, { method: 'POST', body: JSON.stringify({ media_id: mid }) });
      toast('Photo replaced'); renderImages();
    }));
    $$('[data-idel]', box).forEach(b => b.onclick = async () => { if (await confirmAction('Remove this photo from the product?')) { await api(`/products/${p.id}/images/${b.closest('[data-img]').dataset.img}`, { method: 'DELETE' }); renderImages(); } });
    $('#pe-addimg', body).onclick = () => mediaPicker(async mid => {
      try { await api(`/products/${p.id}/images`, { method: 'POST', body: JSON.stringify({ media_id: mid }) }); toast('Photo added'); renderImages(); }
      catch (e) { toast(e.message, true); }
    });
  }
  let tab = 'basic';
  render(tab);
  $$('[data-pt]', v).forEach(b => b.onclick = () => { tab = b.dataset.pt; render(tab); });
  $('#pd-del', v) && ($('#pd-del', v).onclick = async () => { if (await confirmAction(`Delete product ${p.code}? This hides it everywhere.`)) { await api('/products/' + p.id, { method: 'DELETE' }); location.hash = '#/products'; } });
  $('#pe-save', v).onclick = async () => {
    // collect from every tab: render-collect roundtrip
    const grab = {};
    const grabTab = t => { render(t); Object.assign(grab, collect(body)); };
    ['basic', 'material', 'details', 'pricing', 'seo', 'publish'].forEach(grabTab);
    render(tab);
    const data = { ...grab };
    data.seo = { title: getPath(grab, 'seo.title') || '', description: getPath(grab, 'seo.description') || '', canonical: getPath(grab, 'seo.canonical') || '' };
    data.featured = grab.featured; data.is_new = grab.is_new; data.show_price = grab.show_price; data.gst_included = grab.gst_included; data.food_safe = grab.food_safe;
    data.tiers = p.tiers;
    data.scheduled_at = grab.scheduled_at_ui ? new Date(grab.scheduled_at_ui).getTime() : null;
    delete data.seo_ui; delete data.scheduled_at_ui;
    try {
      if (isNew) { const j = await api('/products', { method: 'POST', body: JSON.stringify(data) }); toast('Product created'); location.hash = '#/products/' + j.id; }
      else { await api('/products/' + p.id, { method: 'PUT', body: JSON.stringify(data) }); toast('Product saved'); markClean(); const j = await api('/products/' + p.id); p.slug = j.product.slug; }
    } catch (e) { $('#pe-msg', v).textContent = e.message; toast(e.message, true); }
  };
}

/* ============ CATEGORIES & FILTERS ============ */
VIEWS.categories = async (v) => {
  v.innerHTML = '<div class="a-empty">Loading…</div>';
  const [cats, attrs] = await Promise.all([api('/categories'), api('/attributes')]);
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>Categories</h2><p class="a-help">Shown in the “Product Range” section, navbar and product filters. Delete is blocked while products use a category.</p>
        <div class="a-toolbar"><button class="a-btn a-btn-pri a-btn-sm" id="cat-add">+ Add Category</button></div><div id="cat-list"></div></div>
      <div class="a-card"><h2>Filter Attribute Lists</h2><p class="a-help">Values shown as filters on the Products page. Counts update automatically from product data.</p><div id="attr-list"></div></div>
    </div>`;
  const list = $('#cat-list', v);
  function renderCats() {
    list.innerHTML = cats.categories.map((c, i) => `<div class="a-listitem"><div class="a-thumb">${c.image_id ? `<img src="/media/o/PENDING" alt="">` : '<span>No img</span>'}</div>
      <div class="grow"><b>${esc(c.name)}</b> <span class="a-badge">${c.pc} products</span> ${c.active ? '' : '<span class="a-badge red">hidden</span>'} <div class="a-help">/${esc(c.slug)}</div></div>
      <button class="a-btn a-btn-ghost a-btn-sm" data-ce="${c.id}">Edit</button>
      <button class="a-btn a-btn-danger a-btn-sm" data-cd="${c.id}">Delete</button></div>`).join('');
    $$('[data-ce]', list).forEach(b => b.onclick = () => catEdit(cats.categories.find(c => c.id == b.dataset.ce)));
    $$('[data-cd]', list).forEach(b => b.onclick = async () => { if (await confirmAction('Delete this category?')) { try { await api('/categories/' + b.dataset.cd, { method: 'DELETE' }); toast('Deleted'); reload(); } catch (e) { toast(e.message, true); } } });
  }
  async function reload() { const j = await api('/categories'); cats.categories = j.categories; renderCats(); }
  function catEdit(c) {
    const isNew = !c; c = c || {};
    const b = openModal(isNew ? 'Add Category' : 'Edit ' + esc(c.name || ''), `
      ${fld('Name *', inp('name'))}${fld('Slug', inp('slug'), '', 'dining-serveware')}
      ${fld('Description', ta('description', 3), 'Shown on the category card.')}
      ${imgPicker('image_id', 'Category Image', 'Recommended 1200×900 (4:3). Placeholder shows until set.')}
      ${fld('Icon (emoji)', inp('icon'))}${fld('Sort order', inp('sort', 'number', 'data-num'))}
      ${fld('SEO — Meta title', inp('seo.title'))}${fld('SEO — Meta description', ta('seo.description', 2))}
      ${sw('active', 'Active (visible on site)')}
      <div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-ghost" data-modal-close>Cancel</button><button class="a-btn a-btn-pri" id="cat-save">Save</button></div>`);
    c.seo = typeof c.seo === 'string' ? JSON.parse(c.seo || '{}') : (c.seo || {});
    c.active = c.active !== 0 && c.active !== false;
    fill(b, c); wirePickers(b); hydratePickers(b);
    $('#cat-save', b).onclick = async () => {
      const d2 = collect(b);
      try {
        if (isNew) await api('/categories', { method: 'POST', body: JSON.stringify(d2) });
        else await api('/categories/' + c.id, { method: 'PUT', body: JSON.stringify({ ...d2, seo: { title: d2.seo?.title || c.seo.title || '', description: d2.seo?.description || '' } }) });
        closeModal(); toast('Saved'); reload();
      } catch (e) { toast(e.message, true); }
    };
  }
  $('#cat-add', v).onclick = () => catEdit(null);
  renderCats();
  // attribute values
  const attrBox = $('#attr-list', v);
  attrBox.innerHTML = attrs.lists.map(l => `<div class="a-card" style="margin-bottom:.8rem"><h3>${esc(l.name)}</h3>
    <div>${l.values.map(val => `<span class="a-badge" style="margin:.15rem">${esc(val.value)} <a data-avdel="${val.id}" title="Remove" style="color:var(--red)">✕</a></span>`).join('')}</div>
    <div class="a-row" style="margin-top:.5rem"><input data-avnew="${l.key}" placeholder="Add value…" style="max-width:180px"><button class="a-btn a-btn-ghost a-btn-sm" data-avadd="${l.key}">Add</button></div></div>`).join('');
  $$('[data-avdel]', attrBox).forEach(b => b.onclick = async () => { if (await confirmAction('Remove this filter value?')) { await api('/attributes/values/' + b.dataset.avdel, { method: 'DELETE' }); VIEWS.categories(v); } });
  $$('[data-avadd]', attrBox).forEach(b => b.onclick = async () => {
    const k = b.dataset.avadd; const val = $(`[data-avnew="${k}"]`, attrBox).value.trim(); if (!val) return;
    try { await api(`/attributes/${k}/values`, { method: 'POST', body: JSON.stringify({ value: val }) }); VIEWS.categories(v); } catch (e) { toast(e.message, true); }
  });
};

/* ============ MEDIA LIBRARY ============ */
VIEWS.media = async (v) => {
  let page = 1, q = '';
  async function load() {
    const j = await api(`/media?q=${encodeURIComponent(q)}&page=${page}`);
    v.innerHTML = `
      <div class="uploader" id="up-zone"><p style="font-size:1.05rem;font-weight:600;margin:0">Drag &amp; drop images here</p><p class="a-help">JPG, PNG, WebP, AVIF — up to 12 MB each. We keep the original and generate WebP/AVIF responsive sizes automatically.</p>
        <button class="a-btn a-btn-pri" id="up-btn" type="button">Choose Files</button><input type="file" id="up-file" accept="image/*" multiple hidden></div>
      <div class="a-toolbar" style="margin-top:1rem"><input type="search" id="md-q" placeholder="Search images…" value="${esc(q)}"><span class="a-help">${j.total} files</span></div>
      <div class="media-grid">${j.media.map(m => `<div class="media-cell" data-mid="${m.id}"><div class="mc-img"><img src="${m.src}" alt="" loading="lazy"></div><div class="mc-name">${esc(m.name)}${m.usage.length ? ` <span class="a-badge green">used×${m.usage.length}</span>` : ''}</div></div>`).join('')}</div>
      ${j.media.length === 0 ? '<div class="a-empty">Library is empty. Upload the MORA HOME logo, hero shots, workshop photos and product photography here.</div>' : ''}
      <div class="a-pager"><button class="a-btn a-btn-ghost a-btn-sm" ${page <= 1 ? 'disabled' : ''} id="mp-p">← Prev</button><span>${page} / ${j.pages}</span><button class="a-btn a-btn-ghost a-btn-sm" ${page >= j.pages ? 'disabled' : ''} id="mp-n">Next →</button></div>`;
    const zone = $('#up-zone', v), fileIn = $('#up-file', v);
    $('#up-btn', v).onclick = () => fileIn.click();
    ['dragover', 'dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => { e.preventDefault(); zone.classList.toggle('drag', ev === 'dragover'); }));
    zone.addEventListener('drop', e => uploadFiles(e.dataTransfer.files));
    fileIn.onchange = () => uploadFiles(fileIn.files);
    async function uploadFiles(files) {
      if (!files?.length) return;
      const fd = new FormData(); Array.from(files).forEach(f => fd.append('files', f));
      toast('Uploading…');
      try { const r = await fetch('/api/admin/media', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd }); const jj = await r.json(); if (!jj.ok) throw new Error(jj.error); toast('Uploaded'); load(); } catch (e) { toast(e.message, true); }
    }
    $('#md-q', v).oninput = debounce(() => { q = $('#md-q', v).value; page = 1; load(); }, 350);
    $('#mp-p', v).onclick = () => { page--; load(); };
    $('#mp-n', v).onclick = () => { page++; load(); };
    $$('.media-cell', v).forEach(c => c.onclick = () => mediaDetail(+c.dataset.mid, load));
  }
  load();
};
async function mediaDetail(id, reload) {
  let m = null;
  try { m = (await api('/media/' + id)).media; } catch (e) { }
  if (!m) { toast('Could not load image', true); return; }
  const focal = (m.focal || '50% 50%').split(' ');
  const d = openDrawer(esc(m.name), `
    <div class="a-card">
      <div class="focal-box" id="focal-box"><img src="${m.src}" alt="${esc(m.alt)}" id="focal-img">
        <div class="focal-dot" id="focal-dot" style="left:${focal[0]};top:${focal[1] || focal[0]}"></div></div>
      <p class="a-help">Click the image to set the focal point (kept in frame on all crops).</p>
      <div class="a-row" style="margin-top:.5rem">
        <a class="a-btn a-btn-ghost a-btn-sm" href="${m.original}" download download-original>Download Original</a>
        <button class="a-btn a-btn-ghost a-btn-sm" id="md-repbtn">Replace Image (same ID)</button><input type="file" id="md-repfile" accept="image/*" hidden>
        <button class="a-btn a-btn-danger a-btn-sm" id="md-del">Delete</button></div></div>
    <div class="a-card" style="margin-top:.8rem"><h3>Details</h3>
      ${fld('Name', inp('name'))}${fld('Alt text', inp('alt'), 'Describe the image for screen readers & Google.')}
      ${fld('Tags', inp('tags'), 'Comma separated, for searching.')}
      ${fld('Focal point', `<div class="a-row">${inp('fx', 'text', 'data-b="fx" placeholder="50%" style="max-width:90px"')} ${inp('fy', 'text', 'data-b="fy" placeholder="50%" style="max-width:90px"')}</div>`)}
      <div class="a-row" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="md-save">Save Details</button></div></div>
    <div class="a-card" style="margin-top:.8rem"><h3>Crop</h3>
      <p class="a-help">Percentages of the original (X, Y from top-left; width/height). Crop replaces the working image but keeps the same Media ID — everything updates automatically.</p>
      <div class="a-row">${['x', 'y', 'w', 'h'].map(k => `<input id="cr-${k}" type="number" min="0" max="100" placeholder="${k}%" style="max-width:70px">`).join('')}
      <button class="a-btn a-btn-ghost a-btn-sm" id="cr-go">Apply Crop</button></div></div>
    <div class="a-card" style="margin-top:.8rem"><h3>File Info & Usage</h3>
      <p class="a-help">${m.width}×${m.height} px · ${fmtBytes(m.size)} · uploaded ${fmtDate(m.created_at)}${m.width ? '' : ''}<br>
      Responsive variants: ${['400', '800', '1200', '1800', '2400'].filter(w => +w <= Math.max(m.width, 400)).map(w => w + 'w').join(', ')} (WebP; AVIF at smaller sizes)</p>
      <h4 style="margin:.6rem 0 .2rem">Used in (${m.usage.length})</h4>
      ${m.usage.length ? `<ul style="margin:0;padding-left:1.1rem">${m.usage.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : '<p class="a-help">Not used anywhere — safe to delete.</p>'}</div>`);
  const fox = $('#focal-box', d), dot = $('#focal-dot', d);
  const fxIn = $('[data-b="fx"]', d), fyIn = $('[data-b="fy"]', d);
  fxIn.value = focal[0]; fyIn.value = focal[1] || focal[0];
  fox.onclick = e => { const r = fox.getBoundingClientRect(); const x = Math.round((e.clientX - r.left) / r.width * 100), y = Math.round((e.clientY - r.top) / r.height * 100); fxIn.value = x + '%'; fyIn.value = y + '%'; dot.style.left = x + '%'; dot.style.top = y + '%'; markDirty(); };
  $('[data-b="name"]', d).value = m.name; $('[data-b="alt"]', d).value = m.alt || ''; $('[data-b="tags"]', d).value = m.tags || '';
  $('#md-save', d).onclick = async () => {
    await api('/media/' + id, { method: 'PUT', body: JSON.stringify({ name: $('[data-b="name"]', d).value, alt: $('[data-b="alt"]', d).value, tags: $('[data-b="tags"]', d).value, focal: `${fxIn.value} ${fyIn.value}` }) });
    toast('Saved'); markClean(); reload();
  };
  $('#md-repbtn', d).onclick = () => $('#md-repfile', d).click();
  $('#md-repfile', d).onchange = async e => {
    const fd2 = new FormData(); fd2.append('file', e.target.files[0]);
    try { const r = await fetch(`/api/admin/media/${id}/replace`, { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd2 }); const jj = await r.json(); if (!jj.ok) throw new Error(jj.error); toast('Image replaced — everywhere updated automatically'); closeDrawer(); reload(); } catch (err) { toast(err.message, true); }
  };
  $('#cr-go', d).onclick = async () => {
    const body = { x: +$('#cr-x', d).value || 0, y: +$('#cr-y', d).value || 0, w: +$('#cr-w', d).value || 100, h: +$('#cr-h', d).value || 100 };
    try { await api(`/media/${id}/crop`, { method: 'POST', body: JSON.stringify(body) }); toast('Cropped (same ID — usages updated)'); closeDrawer(); reload(); } catch (e) { toast(e.message, true); }
  };
  $('#md-del', d).onclick = async () => {
    if (m.usage.length) { toast('Cannot delete: image is in use (see usage list)', true); return; }
    if (await confirmAction('Permanently delete this image?')) { try { await api('/media/' + id, { method: 'DELETE' }); closeDrawer(); toast('Deleted'); reload(); } catch (e) { toast(e.message, true); } }
  };
}

/* ============ HOMEPAGE BUILDER ============ */
const BG_OPTS = [['cream', 'Cream White'], ['soft', 'Soft Cream'], ['white', 'White'], ['walnut', 'Dark Walnut'], ['red', 'Blood Red']];
const SPACING_OPTS = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const WIDTH_OPTS = [['narrow', 'Narrow'], ['medium', 'Medium'], ['wide', 'Wide'], ['full', 'Full width']];
const ALIGN_OPTS = [['left', 'Left'], ['center', 'Center'], ['right', 'Right']];
VIEWS.homepage = async (v) => {
  const j = await api('/sections');
  const secs = j.sections;
  v.innerHTML = `<p class="a-help">Enable, reorder and edit homepage sections. “Draft” = saved but not yet live. Publish pushes it to the site (within 5 seconds).</p><div id="hs-list"></div>`;
  const list = $('#hs-list', v);
  list.innerHTML = secs.map((s, i) => `<div class="a-listitem" data-sid="${s.id}">
    <div class="a-sort-btns"><button data-hmv="${i},-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-hmv="${i},1" ${i === secs.length - 1 ? 'disabled' : ''}>▼</button></div>
    <span class="a-dragger" title="Drag to reorder">⠿</span>
    <div class="grow"><b>${esc(s.name)}</b> ${s.draft ? '<span class="a-badge amber">unpublished draft</span>' : ''} <div class="a-help">${esc(s.key)}</div></div>
    <label class="a-switch" title="Show / hide"><input type="checkbox" data-henable ${s.enabled ? 'checked' : ''}><i></i></label>
    <button class="a-btn a-btn-ghost a-btn-sm" data-hedit>Edit</button>
    <button class="a-btn a-btn-ghost a-btn-sm" data-hdup>Duplicate</button>
    ${['hero', 'contact'].includes(s.key) ? '' : `<button class="a-btn a-btn-danger a-btn-sm" data-hdel>Delete</button>`}</div>`).join('');
  async function saveOrder() { await api('/sections/reorder', { method: 'POST', body: JSON.stringify({ ids: $$('[data-sid]', list).map(x => +x.dataset.sid) }) }); }
  $$('[data-hmv]', list).forEach(b => b.onclick = async () => {
    const rows = $$('[data-sid]', list); const [i, dir] = b.dataset.hmv.split(',').map(Number);
    const a = rows[i], bb = rows[i + dir];
    if (dir < 0) list.insertBefore(a, bb); else list.insertBefore(bb, a);
    await saveOrder(); VIEWS.homepage(v);
  });
  $$('[data-henable]', list).forEach(sw2 => sw2.onchange = async () => { await api('/sections/' + sw2.closest('[data-sid]').dataset.sid, { method: 'PUT', body: JSON.stringify({ enabled: sw2.checked }) }); toast(sw2.checked ? 'Section shown' : 'Section hidden'); });
  $$('[data-hedit]', list).forEach(b => b.onclick = () => editSection(secs.find(s => s.id == +b.closest('[data-sid]').dataset.sid)));
  $$('[data-hdup]', list).forEach(b => b.onclick = async () => { await api(`/sections/${b.closest('[data-sid]').dataset.sid}/duplicate`, { method: 'POST', body: '{}' }); VIEWS.homepage(v); });
  $$('[data-hdel]', list).forEach(b => b.onclick = async () => { if (await confirmAction('Delete this section? You can also just hide it.')) { await api('/sections/' + b.closest('[data-sid]').dataset.sid, { method: 'DELETE' }); VIEWS.homepage(v); } });

  function editSection(s) {
    const cfg = JSON.parse(JSON.stringify(s.draft || s.config));
    const common = `
      <div class="a-card"><h3>Content</h3>
      ${fld('Heading', inp('heading'))}${fld('Subheading / Kicker', inp('subheading'))}
      ${['about'].includes(s.key) ? fld('Body text', ta('text', 5)) : ''}
      ${['hero'].includes(s.key) ? `<div class="a-grid a-grid-2">${fld('Primary Button Label', inp('cta1Label'))}${fld('Primary Button URL', inp('cta1Url'))}${fld('Secondary Button Label', inp('cta2Label'))}${fld('Secondary Button URL', inp('cta2Url'))}</div>` : ''}
      ${['gifting', 'cta', 'about'].includes(s.key) ? `<div class="a-grid a-grid-2">${fld('Button Label', inp('ctaLabel'))}${fld('Button URL', inp('ctaUrl'))}</div>` : ''}
      </div>
      <div class="a-card" style="margin-top:.8rem"><h3>Layout & Style</h3><div class="a-grid a-grid-2">
      ${fld('Background', sel('bg', BG_OPTS))}${fld('Vertical Spacing', sel('spacing', SPACING_OPTS))}
      ${fld('Content Width', sel('width', WIDTH_OPTS))}${fld('Text Alignment', sel('align', ALIGN_OPTS))}
      </div><div style="margin-top:.5rem">${sw('watermark', 'Show MORA watermark in this section')}</div></div>`;
    let extra = '';
    if (s.key === 'hero') extra = `<div class="a-card" style="margin-top:.8rem"><h3>Hero Layout & Slider</h3><div class="a-grid a-grid-2">
        ${fld('Variant', sel('variant', [['centered', 'Centered'], ['text-left', 'Text left + image'], ['full', 'Full-width background']]))}
        ${fld('Height', sel('height', [['medium', 'Medium'], ['large', 'Large'], ['small', 'Compact']]))}
        ${fld('Dark Overlay %', inp('overlay', 'number', 'data-num min="0" max="90"'))}${fld('Autoplay Interval (ms)', inp('interval', 'number', 'data-num'))}
      </div><div class="a-row" style="margin-top:.5rem">${sw('showSearch', 'Show search bar')}${sw('autoplay', 'Autoplay')}${sw('dots', 'Show dots')}${sw('pauseOnHover', 'Pause on hover')}</div></div>
      <div class="a-card" style="margin-top:.8rem"><h3>Slides <span class="a-help">(up to 8 — first active slide is the default hero)</span></h3><div id="hs-slides"></div></div>`;
    if (['serve', 'why'].includes(s.key)) extra = `<div class="a-card" style="margin-top:.8rem"><h3>Items</h3><div id="hs-items"></div></div>
      <div class="a-card" style="margin-top:.8rem"><h3>Variant</h3>${fld('Cards per row', sel('variant', [['cards-3', '3 cards'], ['cards-4', '4 cards'], ['cards-6', '6 cards'], ['rows', 'Icon + text rows']]))}</div>`;
    if (s.key === 'steps') extra = `<div class="a-card" style="margin-top:.8rem"><h3>Steps</h3><div id="hs-items"></div></div>`;
    if (['featured', 'new'].includes(s.key)) extra = `<div class="a-card" style="margin-top:.8rem">${fld('Max products to show (≤ 8)', inp('max', 'number', 'data-num min="1" max="8"'), 'Section hides automatically when nothing matches.')}</div>`;
    if (['about', 'gifting'].includes(s.key)) extra = `<div class="a-card" style="margin-top:.8rem">${imgPicker('imageId', 'Section Image', 'Placeholder shows until you upload.')}${s.key === 'about' ? fld('Layout', sel('layout', [['text-left', 'Text left, image right'], ['text-right', 'Image left, text right']])) : ''}</div>`;
    const d = openDrawer('Edit — ' + esc(s.name), common + extra, `
      <a class="a-btn a-btn-ghost" href="/" target="_blank">Preview on Site ↗</a>
      <button class="a-btn a-btn-ghost" id="hs-hist">Version History</button>
      <span style="flex:1"></span>
      ${s.draft ? `<button class="a-btn a-btn-ghost" id="hs-discard">Discard Draft</button>` : ''}
      <button class="a-btn a-btn-out" id="hs-draft">Save Draft</button>
      <button class="a-btn a-btn-pri" id="hs-pub">Publish</button>`);
    fill(d, cfg); wirePickers(d); hydratePickers(d);
    if (s.key === 'hero') { cfg.slides = cfg.slides || []; arrayEditor($('#hs-slides', d), cfg.slides, [
      { k: 'imageId', l: 'Desktop image', type: 'img' }, { k: 'mobileImageId', l: 'Mobile image (optional)', type: 'img' },
      { k: 'heading', l: 'Heading' }, { k: 'subheading', l: 'Subheading', type: 'ta' }, { k: 'ctaLabel', l: 'Button label' }, { k: 'ctaUrl', l: 'Button URL' }, { k: 'active', l: 'Active', type: 'bool' }], markDirty); }
    if (['serve', 'why'].includes(s.key)) { cfg.items = cfg.items || []; arrayEditor($('#hs-items', d), cfg.items, [
      { k: 'icon', l: 'Icon', type: 'sel', opts: [['boxes', 'Boxes'], ['store', 'Store'], ['cart', 'Cart'], ['gift', 'Gift'], ['return', 'Return gift'], ['festival', 'Festive'], ['factory', 'Factory'], ['hand', 'Handcrafted'], ['truck', 'Delivery'], ['shield', 'Trust'], ['pencil', 'Custom'], ['star', 'Star']] },
      { k: 'title', l: 'Title' }, { k: 'text', l: 'Text', type: 'ta' }, { k: 'link', l: 'Link URL (optional)' }], markDirty); }
    if (s.key === 'steps') { cfg.items = cfg.items || []; arrayEditor($('#hs-items', d), cfg.items, [
      { k: 'title', l: 'Step title' }, { k: 'text', l: 'Step text', type: 'ta' }], markDirty); }
    const grabCfg = () => { const c = collect(d); delete c.item; c.items = cfg.items; c.slides = cfg.slides; return c; };
    $('#hs-hist', d).onclick = () => versionsModal('section', String(s.id), s.name);
    $('#hs-discard', d)?.addEventListener('click', async () => { if (await confirmAction('Discard the unpublished draft?')) { await api('/sections/' + s.id, { method: 'PUT', body: JSON.stringify({ config: s.config, publish: true }) }); closeDrawer(); VIEWS.homepage($('#a-view')); } });
    $('#hs-draft', d).onclick = async () => { await api('/sections/' + s.id, { method: 'PUT', body: JSON.stringify({ config: grabCfg(), publish: false }) }); toast('Draft saved'); markClean(); closeDrawer(); VIEWS.homepage($('#a-view')); };
    $('#hs-pub', d).onclick = async () => { await api('/sections/' + s.id, { method: 'PUT', body: JSON.stringify({ config: grabCfg(), publish: true }) }); toast('Published — live within 5 seconds'); markClean(); closeDrawer(); VIEWS.homepage($('#a-view')); };
  }
};

/* ============ PAGES ============ */
VIEWS.pages = async (v) => {
  const j = await api('/pages');
  v.innerHTML = `<div class="a-toolbar"><button class="a-btn a-btn-pri" id="pg-add">+ New Page</button></div><div id="pg-list"></div>`;
  const list = $('#pg-list', v);
  const locked = ['privacy', 'terms'];
  list.innerHTML = j.pages.map(p => `<div class="a-listitem"><div class="grow"><b>${esc(p.title)}</b>
      <span class="a-badge ${p.status === 'published' ? 'green' : 'amber'}">${p.status}</span>
      ${['privacy', 'terms'].includes(p.slug) ? '<span class="a-badge">legal · starter draft — have a lawyer review before launch</span>' : ''}
      <div class="a-help">/${esc(p.slug === 'about' ? 'about' : 'p/' + p.slug)} · ${JSON.parse(p.blocks?.length !== undefined ? JSON.stringify(p.blocks) : '[]').length || (p.blocks || []).length} blocks</div></div>
    <a class="a-btn a-btn-ghost a-btn-sm" href="/${p.slug === 'about' ? 'about' : 'p/' + esc(p.slug)}" target="_blank">View ↗</a>
    <button class="a-btn a-btn-ghost a-btn-sm" data-pe="${p.id}">Edit</button>
    ${['privacy', 'terms', 'about'].includes(p.slug) ? '' : `<button class="a-btn a-btn-danger a-btn-sm" data-pd="${p.id}">Delete</button>`}</div>`).join('');
  $('#pg-add', v).onclick = async () => {
    const title = prompt('Page title?'); if (!title) return;
    const r = await api('/pages', { method: 'POST', body: JSON.stringify({ title }) });
    VIEWS.pages(v); pageEditor(r.id);
  };
  $$('[data-pe]', list).forEach(b => b.onclick = () => pageEditor(+b.dataset.pe));
  $$('[data-pd]', list).forEach(b => b.onclick = async () => { if (await confirmAction('Delete this page?')) { await api('/pages/' + b.dataset.pd, { method: 'DELETE' }); VIEWS.pages(v); } });
  async function pageEditor(id) {
    const j2 = await api('/pages'); const p = j2.pages.find(x => x.id == id);
    if (!p) return;
    let blocks = JSON.parse(JSON.stringify(p.blocks || []));
    const BLOCK_TYPES = [['heading', 'Heading'], ['paragraph', 'Paragraph'], ['richtext', 'Rich text'], ['image', 'Image'], ['image-text', 'Image + Text'], ['columns', 'Columns / Cards'], ['cta', 'Call to Action'], ['products', 'Product grid'], ['faq', 'FAQ block'], ['quote', 'Quote'], ['divider', 'Divider'], ['html', 'Custom HTML']];
    const d = openDrawer('Edit page — ' + esc(p.title), `
      <div class="a-grid a-grid-2">${fld('Title', inp('title'))}${fld('URL slug', inp('slug'))}</div>
      ${fld('Status', sel('status', [['draft', 'Draft'], ['published', 'Published']]))}
      <div class="a-card"><h3>SEO</h3>${fld('Meta title', inp('seo.title'))}${fld('Meta description', ta('seo.description', 2))}</div>
      <div class="a-card" style="margin-top:.8rem"><h3>Content Blocks</h3><div id="pg-blocks"></div>
        <div style="margin-top:.6rem"><select id="pg-newtype">${BLOCK_TYPES.map(t => `<option value="${t[0]}">${t[1]}</option>`).join('')}</select>
        <button class="a-btn a-btn-ghost a-btn-sm" id="pg-addblock" style="margin-top:.4rem">+ Add Block</button></div></div>`,
      `<a class="a-btn a-btn-ghost" href="/${p.slug === 'about' ? 'about' : 'p/' + esc(p.slug)}" target="_blank">Preview on Site ↗</a><button class="a-btn a-btn-ghost" id="pg-hist">History</button><span style="flex:1"></span><button class="a-btn a-btn-pri" id="pg-save">Save Page</button>`);
    fill(d, p);
    const box = $('#pg-blocks', d);
    function renderBlocks() {
      box.innerHTML = blocks.map((b, i) => `<div class="a-listitem" data-bi="${i}">
        ${sortBtns(blocks, i)}<div class="grow"><b>${BLOCK_TYPES.find(t => t[0] === b.type)?.[1] || b.type}</b><div class="a-help">${esc((b.text || b.heading || b.html || '').slice(0, 80))}</div></div>
        <button class="a-btn a-btn-ghost a-btn-sm" data-be>Edit</button>
        <button class="a-icon-btn" data-bd title="Delete">✕</button></div>`).join('') || '<p class="a-help">No blocks yet — add your first block below.</p>';
      $$('[data-mv]', box).forEach(btn => btn.onclick = () => { const [i, dd] = btn.dataset.mv.split(',').map(Number); [blocks[i], blocks[i + dd]] = [blocks[i + dd], blocks[i]]; renderBlocks(); markDirty(); });
      $$('[data-be]', box).forEach(btn => btn.onclick = () => editBlock(+btn.closest('[data-bi]').dataset.bi));
      $$('[data-bd]', box).forEach(btn => btn.onclick = async () => { if (await confirmAction('Delete block?')) { blocks.splice(+btn.closest('[data-bi]').dataset.bi, 1); renderBlocks(); markDirty(); } });
    }
    function blockFields(bl) {
      switch (bl.type) {
        case 'heading': return fld('Heading text', inp('text')) + fld('Style', `${fld('Width', sel('width', WIDTH_OPTS))}${fld('Spacing', sel('spacing', SPACING_OPTS))}${fld('Alignment', sel('align', ALIGN_OPTS))}`);
        case 'paragraph': return fld('Text', ta('text', 6)) + fld('Width', sel('width', WIDTH_OPTS));
        case 'richtext': return fld('HTML', ta('html', 8), 'Scripts are stripped for safety.');
        case 'image': return imgPicker('imageId', 'Image') + fld('Alt text', inp('alt')) + fld('Width', sel('width', WIDTH_OPTS));
        case 'image-text': return imgPicker('imageId', 'Image') + fld('Heading', inp('heading')) + fld('Text', ta('text', 4)) + fld('Layout', sel('layout', [['image-left', 'Image left'], ['image-right', 'Image right']])) + `<div class="a-grid a-grid-2">${fld('Button label', inp('ctaLabel'))}${fld('Button URL', inp('ctaUrl'))}</div>`;
        case 'cta': return fld('Heading', inp('heading')) + fld('Text', ta('text', 3)) + `<div class="a-grid a-grid-2">${fld('Button label', inp('ctaLabel'))}${fld('Button URL', inp('ctaUrl'))}</div>`;
        case 'columns': return fld('Section heading (optional)', inp('heading')) + fld('Columns', sel('cols', [['2', '2'], ['3', '3'], ['4', '4']])) + `<div id="bl-items"></div>`;
        case 'products': return fld('Heading', inp('heading')) + fld('How many products', inp('count', 'number', 'data-num min="1" max="12"'));
        case 'quote': return fld('Quote', ta('text', 4)) + fld('Author', inp('author'));
        case 'html': return fld('HTML', ta('html', 8), 'Advanced: scripts are stripped for safety.');
        case 'faq': return '<p class="a-help">This block renders the FAQ list (manage under Content → FAQs).</p>';
        default: return '<p class="a-help">No options.</p>';
      }
    }
    function editBlock(i) {
      const bl = blocks[i];
      const b = openModal('Edit block — ' + (BLOCK_TYPES.find(t => t[0] === bl.type)?.[1] || bl.type),
        blockFields(bl) + `<div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-ghost" data-modal-close>Cancel</button><button class="a-btn a-btn-pri" id="bl-save">Apply</button></div>` +
        `${['heading', 'paragraph'].includes(bl.type) ? '' : `<div class="a-grid a-grid-2" style="margin-top:.8rem">${fld('Background', sel('bg', BG_OPTS))}${fld('Width', sel('width2dummy', WIDTH_OPTS))}</div>`}`);
      fill(b, bl); wirePickers(b); hydratePickers(b);
      if (bl.type === 'columns') { bl.items = bl.items || []; arrayEditor($('#bl-items', b), bl.items, [{ k: 'icon', l: 'Icon', type: 'sel', opts: [['star', 'Star'], ['shield', 'Trust'], ['truck', 'Delivery'], ['gift', 'Gift'], ['factory', 'Factory'], ['hand', 'Handcrafted']] }, { k: 'title', l: 'Title' }, { k: 'text', l: 'Text', type: 'ta' }]); }
      $('#bl-save', b).onclick = () => { const c = collect(b); delete c.width2dummy; Object.assign(bl, c); if (bl.type === 'columns') bl.items = bl.items; closeModal(); renderBlocks(); markDirty(); };
    }
    $('#pg-addblock', d).onclick = () => { blocks.push({ type: $('#pg-newtype', d).value }); renderBlocks(); editBlock(blocks.length - 1); markDirty(); };
    renderBlocks();
    $('#pg-hist', d).onclick = () => versionsModal('page', String(p.id), p.title);
    $('#pg-save', d).onclick = async () => {
      const c = collect(d);
      try {
        const r = await api('/pages/' + p.id, { method: 'PUT', body: JSON.stringify({ title: c.title, slug: c.slug, status: c.status, seo: c.seo, blocks }) });
        toast('Page saved'); markClean(); closeDrawer(); VIEWS.pages($('#a-view'));
      } catch (e) { toast(e.message, true); }
    };
  }
};

/* ============ NAVIGATION & FOOTER ============ */
VIEWS.nav = async (v) => {
  const [nav, navbar, footer] = await Promise.all([api('/nav'), settingsGet('navbar'), settingsGet('footer')]);
  v.innerHTML = `
    <div class="a-grid">
      <div class="a-card"><h2>Main Navigation</h2><p class="a-help">Controls the header menu (desktop + mobile drawer).</p>
        <div class="a-toolbar"><button class="a-btn a-btn-pri a-btn-sm" id="nv-add">+ Add Link</button></div><div id="nv-list"></div></div>
      <div class="a-card"><h2>Header Buttons</h2><div class="a-grid a-grid-2">
        ${fld('Enquiry Button Label', inp('ctaLabel'))}${fld('Enquiry Button URL', inp('ctaUrl'))}
        ${fld('Enquiry List Label', inp('listLabel'))}<div class="a-fld"><label>Search</label>${sw('showSearch', 'Show product search in header')}</div></div>
        <div class="a-row end"><button class="a-btn a-btn-pri a-btn-sm" id="nv-save">Save Header Settings</button></div></div>
      <div class="a-card"><h2>Footer</h2>
        ${fld('Tagline', inp('tagline'))}
        <div class="a-grid a-grid-2">${fld('Copyright', inp('copyright'), 'Use {year} for the current year.')}${fld('Background colour', inp('bg', 'color'))}</div>
        ${fld('B2B Disclaimer', ta('disclaimer', 2))}
        <div class="a-row" style="margin:.5rem 0">${sw('contactBlock', 'Show contact block')}${sw('showCatalogue', 'Show catalogue download button')}</div>
        <h3 style="margin-top:.8rem">Footer Columns</h3><p class="a-help">One link per line, as <b>Label | /url</b></p><div id="ft-cols"></div>
        <div class="a-row end" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="ft-save">Save Footer</button></div></div>
    </div>`;
  // nav items
  const list = $('#nv-list', v);
  function renderNav() {
    list.innerHTML = nav.items.map((it, i) => `<div class="a-listitem">${sortBtns(nav.items, i)}
      <div class="grow"><b>${esc(it.label)}</b> → ${esc(it.url)} ${it.visible ? '' : '<span class="a-badge red">hidden</span>'} ${it.new_tab ? '<span class="a-badge">new tab</span>' : ''}</div>
      <label class="a-switch" title="Visible"><input type="checkbox" data-nv-vis="${it.id}" ${it.visible ? 'checked' : ''}><i></i></label>
      <button class="a-btn a-btn-ghost a-btn-sm" data-nv-ed="${it.id}">Edit</button>
      <button class="a-btn a-btn-danger a-btn-sm" data-nv-del="${it.id}">✕</button></div>`).join('') || '<p class="a-help">No links.</p>';
    $$('[data-mv]', list).forEach(b => b.onclick = async () => {
      const [i, d2] = b.dataset.mv.split(',').map(Number);
      const ids = nav.items.map(x => x.id); [ids[i], ids[i + d2]] = [ids[i + d2], ids[i]];
      await api('/nav/reorder', { method: 'PUT', body: JSON.stringify({ ids }) });
      const j = await api('/nav'); nav.items = j.items; renderNav();
    });
    $$('[data-nv-vis]', list).forEach(c => c.onchange = async () => { await api('/nav/' + c.dataset.nvVis, { method: 'PUT', body: JSON.stringify({ visible: c.checked }) }); });
    $$('[data-nv-ed]', list).forEach(b => b.onclick = () => editItem(nav.items.find(x => x.id == b.dataset.nvEd)));
    $$('[data-nv-del]', list).forEach(b => b.onclick = async () => { if (await confirmAction('Remove link?')) { await api('/nav/' + b.dataset.nvDel, { method: 'DELETE' }); VIEWS.nav(v); } });
  }
  function editItem(it) {
    const isNew = !it;
    const b = openModal(isNew ? 'Add Link' : 'Edit Link', `
      ${fld('Label *', inp('label'))}${fld('URL *', inp('url'), '', '/products or https://…')}${sw('new_tab', 'Open in new tab')}
      <div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-pri" id="ni-save">Save</button></div>`);
    if (it) fill(b, it);
    $('#ni-save', b).onclick = async () => {
      const d2 = collect(b);
      try {
        if (isNew) await api('/nav', { method: 'POST', body: JSON.stringify(d2) });
        else await api('/nav/' + it.id, { method: 'PUT', body: JSON.stringify(d2) });
        closeModal(); VIEWS.nav(v);
      } catch (e) { toast(e.message, true); }
    };
  }
  $('#nv-add', v).onclick = () => editItem(null);
  renderNav();
  // header settings
  fill(v.querySelector('.a-card:nth-child(2)'), navbar);
  $('#nv-save', v).onclick = () => { const card = v.querySelector('.a-card:nth-child(2)'); settingsPut('navbar', collect(card)); };
  // footer
  const fCard = v.querySelector('.a-card:nth-child(3)');
  fill(fCard, footer);
  const colsBox = $('#ft-cols', fCard);
  const cols = footer.columns || [];
  colsBox.innerHTML = cols.map((c, i) => `<div class="a-fld" style="border:1px solid var(--line);border-radius:8px;padding:.7rem;margin-bottom:.6rem">
    <label>Column ${i + 1} title</label><input data-ft-title="${i}" value="${esc(c.title)}">
    <label style="margin-top:.4rem">Links</label><textarea rows="4" data-ft-links="${i}">${esc((c.links || []).map(l => `${l.label} | ${l.url}`).join('\n'))}</textarea>
    <button class="a-btn a-btn-danger a-btn-sm" data-ft-del="${i}" style="margin-top:.3rem">Remove column</button></div>`).join('') +
    `<button class="a-btn a-btn-ghost a-btn-sm" id="ft-addcol">+ Add Column</button>`;
  $('#ft-addcol', fCard).onclick = () => { cols.push({ title: 'New Column', links: [] }); $('#ft-save', fCard).click().then?.(() => { }); VIEWS.nav(v); };
  $$('[data-ft-del]', fCard).forEach(b => b.onclick = () => { cols.splice(+b.dataset.ftDel, 1); $('#ft-save', fCard).click(); });
  $('#ft-save', fCard).onclick = async () => {
    const data = collect(fCard);
    data.columns = $$('[data-ft-title]', fCard).map((t, i) => ({
      title: t.value,
      links: $(`[data-ft-links="${i}"]`, fCard).value.split('\n').map(l => { const [label, url] = l.split('|').map(x => (x || '').trim()); return label ? { label, url: url || '/' } : null; }).filter(Boolean)
    }));
    await settingsPut('footer', data); VIEWS.nav(v);
  };
};

/* ============ CONTENT (faqs, testimonials, stats, trust) ============ */
VIEWS.content = async (v) => {
  v.innerHTML = `<div class="a-tabs"><button data-ct="faqs" class="on">FAQs</button><button data-ct="testi">Testimonials</button><button data-ct="stats">By-the-Numbers</button><button data-ct="trust">Trust & Clients</button></div><div id="ct-body"></div>`;
  const body = $('#ct-body', v);
  const show = t => { $$('[data-ct]', v).forEach(b => b.classList.toggle('on', b.dataset.ct === t)); body.innerHTML = ''; sub[t](body); };
  const sub = {
    faqs: el => crudList(el, '/faqs', [{ k: 'question', l: 'Question' }], [
      { k: 'question', l: 'Question', ex: 'What is your MOQ?' }, { k: 'answer', l: 'Answer', type: 'ta', rows: 5 }, { k: 'enabled', l: 'Enabled' }], 'FAQ'),
    testi: el => crudList(el, '/testimonials', [{ k: 'name', l: 'Name' }, { k: 'quote', l: 'Quote', f: r => esc((r.quote || '').slice(0, 90)) + '…' }], [
      { k: 'name', l: 'Name' }, { k: 'business', l: 'Business' }, { k: 'city', l: 'City' }, { k: 'quote', l: 'Quote', type: 'ta', rows: 4 },
      { k: 'photo_id', l: 'Photo (optional)', type: 'img' }, { k: 'enabled', l: 'Show on site' }], 'testimonial'),
    stats: el => crudList(el, '/stats', [{ k: 'label', l: 'Label' }, { k: 'value', l: 'Value' }], [
      { k: 'label', l: 'Label', ex: 'Cities Served' }, { k: 'value', l: 'Value', ex: '120+', h: 'Hidden publicly when empty.' },
      { k: 'auto_products', l: 'Auto-fill with published product count', type: 'boolBool' }, { k: 'enabled', l: 'Show' }], 'counter'),
    trust: el => crudList(el, '/trust', [{ k: 'label', l: 'Label' }, { k: 'kind', l: 'Kind' }], [
      { k: 'kind', l: 'Kind', type: 'sel', opts: [['logo', 'Client logo'], ['badge', 'Trust badge'], ['cert', 'Certification'], ['doc', 'Document']] },
      { k: 'label', l: 'Label' }, { k: 'media_id', l: 'Image / file', type: 'img' }, { k: 'enabled', l: 'Show' }], 'trust item')
  };
  // boolBool doesn't exist; patch: treat as checkbox field in crudList via 'enabled' only. Handle auto_products manually:
  sub.stats = el => crudList(el, '/stats', [{ k: 'label', l: 'Label' }, { k: 'value', l: 'Value' }], [
    { k: 'label', l: 'Label', ex: 'Cities Served' }, { k: 'value', l: 'Value', ex: '120+' }, { k: 'enabled', l: 'Show' }], 'counter');
  $$('[data-ct]', v).forEach(b => b.onclick = () => show(b.dataset.ct));
  show('faqs');
};

/* ============ FORMS BUILDER ============ */
VIEWS.forms = async (v) => {
  const forms = await settingsGet('forms');
  const names = { enquiry: 'Quick Enquiry', contact: 'Full Contact', catalogue: 'Catalogue Request', sample: 'Sample Request' };
  v.innerHTML = `<p class="a-help">Control which fields appear on each public form. Name & phone remain required. Order with ▲▼.</p><div class="a-tabs">${Object.keys(names).map((k, i) => `<button data-f="${k}" class="${i === 0 ? 'on' : ''}">${names[k]}</button>`).join('')}</div><div id="fm-body"></div>`;
  const body = $('#fm-body', v);
  function show(k) {
    $$('[data-f]', v).forEach(b => b.classList.toggle('on', b.dataset.f === k));
    const fields = forms[k] || (forms[k] = []);
    const F = ['text', 'email', 'tel', 'number', 'textarea', 'select'];
    body.innerHTML = fields.map((f, i) => `<div class="a-listitem" style="flex-wrap:wrap;align-items:flex-start">${sortBtns(fields, i)}
      <div class="grow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:.5rem">
        <div><label class="a-help">Field key</label><input value="${esc(f.key)}" data-ff="${i}.key"></div>
        <div><label class="a-help">Label</label><input value="${esc(f.label)}" data-ff="${i}.label"></div>
        <div><label class="a-help">Type</label><select data-ff="${i}.type">${F.map(t => `<option ${f.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
        <div><label class="a-help">Placeholder</label><input value="${esc(f.placeholder || '')}" data-ff="${i}.placeholder"></div>
        <div><label class="a-help">Help text</label><input value="${esc(f.help || '')}" data-ff="${i}.help"></div>
        <div><label class="a-help">Options (select, one per line)</label><textarea rows="1" data-ff="${i}.options">${esc((f.options || []).join('\n'))}</textarea></div>
      </div>
      <label style="display:flex;gap:.3rem;align-items:center;font-size:.78rem"><input type="checkbox" data-ffc="${i}.visible" ${f.visible !== false ? 'checked' : ''} style="width:auto">Visible</label>
      <label style="display:flex;gap:.3rem;align-items:center;font-size:.78rem"><input type="checkbox" data-ffc="${i}.required" ${f.required ? 'checked' : ''} style="width:auto" ${['name', 'phone'].includes(f.key) ? 'disabled' : ''}>Required</label>
      <button class="a-icon-btn" data-rmf="${i}">✕</button></div>`).join('') +
      `<div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-ghost" id="fm-add">+ Add Field</button><button class="a-btn a-btn-pri" id="fm-save">Save Form</button></div>`;
    $$('[data-ff]', body).forEach(inp2 => inp2.oninput = () => { const [i, k] = inp2.dataset.ff.split('.'); fields[i][k] = k === 'options' ? inp2.value.split('\n').map(x => x.trim()).filter(Boolean) : inp2.value; markDirty(); });
    $$('[data-ffc]', body).forEach(c => c.onchange = () => { const [i, k] = c.dataset.ffc.split('.'); fields[i][k] = c.checked; markDirty(); });
    $$('[data-mv]', body).forEach(b => b.onclick = () => { const [i, d2] = b.dataset.mv.split(',').map(Number); [fields[i], fields[i + d2]] = [fields[i + d2], fields[i]]; show(k); markDirty(); });
    $$('[data-rmf]', body).forEach(b => b.onclick = async () => { if (await confirmAction('Remove field?')) { fields.splice(+b.dataset.rmf, 1); show(k); markDirty(); } });
    $('#fm-add', body).onclick = () => { fields.push({ key: 'field_' + (fields.length + 1), label: 'New Field', type: 'text', required: false, visible: true, placeholder: '', help: '' }); show(k); markDirty(); };
    $('#fm-save', body).onclick = () => settingsPut('forms', forms);
  }
  $$('[data-f]', v).forEach(b => b.onclick = () => show(b.dataset.f));
  show('enquiry');
};

/* ============ EMAIL ============ */
VIEWS.email = async (v) => {
  const [email, templates, jobs] = await Promise.all([settingsGet('email'), settingsGet('emailTemplates'), api('/email/jobs')]);
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>SMTP Settings</h2>
        ${fld('SMTP Host', inp('smtpHost'), '', 'smtp.gmail.com')}
        <div class="a-grid a-grid-2">${fld('Port', inp('smtpPort', 'number', 'data-num'))}${fld('User', inp('smtpUser'))}</div>
        ${fld('Password / App Password', inp('smtpPass', 'password'), 'For Gmail use an App Password.')}
        <div class="a-grid a-grid-2">${fld('From Name', inp('fromName'))}${fld('From Email', inp('fromEmail'))}</div>
        ${fld('Reply-To', inp('replyTo'))}
        ${sw('autoReply', 'Send auto-reply to customers')}
        <div class="a-row end" style="margin-top:.6rem"><input id="em-test-to" placeholder="you@example.com" style="max-width:200px"><button class="a-btn a-btn-ghost a-btn-sm" id="em-test">Send Test Email</button>
        <button class="a-btn a-btn-pri a-btn-sm" id="em-save">Save</button></div></div>
      <div class="a-card"><h2>Routing — where each lead type is sent</h2>
        ${fld('Enquiries →', inp('routing.enquiry'))}${fld('Catalogue requests →', inp('routing.catalogue'))}
        ${fld('Ask MORA →', inp('routing.ask'))}${fld('WhatsApp leads →', inp('routing.whatsapp'))}
        <p class="a-help">Leads are always saved to the database even if email fails. Failed emails retry 3 times with backoff.</p></div>
    </div>
    <div class="a-card" style="margin-top:1rem"><h2>Email Templates</h2><p class="a-help">Placeholders: {name} {phone} {email} {business} {city} {product} {code} {quantity} {message} {source}</p>
      <div id="em-tpls"></div>
      <div class="a-row end"><button class="a-btn a-btn-pri a-btn-sm" id="em-tplsave">Save Templates</button></div></div>
    <div class="a-card" style="margin-top:1rem"><h2>Delivery Queue</h2>
      <div class="a-toolbar"><span class="a-help">Last 50 jobs. Leads save even when email is unconfigured — configure SMTP then “Retry queued”.</span>
      <button class="a-btn a-btn-ghost a-btn-sm" id="em-retry">Retry failed / queued</button></div>
      <div class="a-table-wrap"><table><thead><tr><th>#</th><th>Kind</th><th>To</th><th>Subject</th><th>Status</th><th>Attempts</th><th>Last error</th></tr></thead><tbody>
      ${jobs.jobs.map(j => `<tr><td>${j.id}</td><td>${esc(j.kind)}</td><td>${esc(j.to_addr)}</td><td>${esc(j.subject)}</td>
        <td><span class="a-badge ${j.status === 'sent' ? 'green' : j.status === 'failed' ? 'red' : 'amber'}">${j.status}</span></td>
        <td>${j.attempts}</td><td class="a-help">${esc((j.last_error || '').slice(0, 60))}</td></tr>`).join('') || '<tr><td colspan="7">No email jobs yet.</td></tr>'}
      </tbody></table></div></div>`;
  fill(v.querySelector('.a-card'), email); fill(v.querySelectorAll('.a-card')[1], email);
  $('#em-save', v).onclick = async () => {
    const c1 = collect(v.querySelector('.a-card')); const c2 = collect(v.querySelectorAll('.a-card')[1]);
    await settingsPut('email', { ...c1, routing: c2.routing });
  };
  $('#em-test', v).onclick = async () => { try { await api('/email/test', { method: 'POST', body: JSON.stringify({ to: $('#em-test-to', v).value }) }); toast('Test email sent — check the inbox'); } catch (e) { toast(e.message, true); } };
  const tplBox = $('#em-tpls', v);
  const TPLS = { enquiry: 'Enquiry (to you)', catalogue: 'Catalogue request', whatsapp: 'WhatsApp lead', autoreply: 'Auto-reply (to customer)' };
  tplBox.innerHTML = Object.entries(TPLS).map(([k, l]) => `<div class="a-card" style="margin-bottom:.7rem"><h3>${l}</h3>
    ${fld('Subject', `<input data-tpl="${k}.subject" value="${esc(templates[k]?.subject || '')}">`)}
    ${fld('Body', `<textarea rows="5" data-tpl="${k}.body">${esc(templates[k]?.body || '')}</textarea>`)}</div>`).join('');
  $('#em-tplsave', v).onclick = () => {
    const out = {};
    $$('[data-tpl]', tplBox).forEach(i => setPath(out, i.dataset.tpl, i.value));
    settingsPut('emailTemplates', out);
  };
  $('#em-retry', v).onclick = async () => { await api('/email/retry', { method: 'POST', body: '{}' }); toast('Queue reset — delivering in the background'); setTimeout(() => VIEWS.email(v), 1500); };
};

/* ============ WHATSAPP ============ */
VIEWS.whatsapp = async (v) => {
  const [wa, biz] = await Promise.all([settingsGet('whatsapp'), settingsGet('business')]);
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>WhatsApp Channel</h2>
        <div class="a-warn" style="margin-bottom:.8rem"><span>ℹ</span><span>The number lives in <b>Business Info → WhatsApp</b> and is used everywhere (dock, product buttons, footer). Change it once.</span></div>
        <p><b>Current number:</b> ${esc(biz.whatsapp || 'not set — set it in Business Info')}</p>
        ${sw('enabled', 'WhatsApp buttons enabled site-wide')}
        ${fld('Button Text', inp('buttonText'))}
        <div class="a-grid a-grid-2">${fld('Mobile Dock Text', inp('mobileDockText'))}${fld('Desktop Bubble Tooltip', inp('desktopText'))}</div>
        <div class="a-row end" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="wa-save">Save</button></div></div>
      <div class="a-card"><h2>Message Templates</h2>
        ${fld('General message', ta('messageTemplate', 3), 'Placeholders: {name}, {business}')} 
        ${fld('Product message', ta('productMessageTemplate', 3), 'Adds {product} and {code}')}
        <h3 style="margin-top:.6rem">Live preview</h3><div class="a-card" style="background:#e7f3ec"><p id="wa-prev" style="margin:0;font-size:.9rem;white-space:pre-wrap"></p></div></div>
    </div>`;
  const c1 = v.querySelector('.a-card'); fill(c1, wa);
  const c2 = v.querySelectorAll('.a-card')[1]; fill(c2, wa);
  function prev() {
    const name = 'Rahul', bizT = waPreCollect();
    $('#wa-prev', v).textContent = (bizT.productMessageTemplate || '').replace('{name}', name).replace('{business}', ' from Sharma Traders').replace('{product}', 'Hammered Brass Tray').replace('{code}', 'MH-1001');
  }
  function waPreCollect() { return { ...collect(c1), ...collect(c2) }; }
  $$('textarea,input', c2).forEach(i => i.addEventListener('input', prev));
  prev();
  $('#wa-save', v).onclick = () => settingsPut('whatsapp', waPreCollect());
};

/* ============ SEO & ANALYTICS ============ */
VIEWS.seo = async (v) => {
  const [seo, analytics, nf, pages] = await Promise.all([settingsGet('seo'), can('owner') ? settingsGet('analytics') : {}, settingsGet('notfound'), api('/pages')]);
  const ownerScripts = can('owner') ? `
    ${fld('GA4 Measurement ID', inp('ga4'), '', 'G-XXXXXXX')}
    ${fld('Meta Pixel ID', inp('metaPixel'))}
    ${fld('Search Console verification token', inp('searchConsole'))}
    <div class="a-warn"><span>⚠</span><span>Owner-only scripts. Analytics loads on the public site only when configured here.</span></div>
    ${fld('Header scripts', ta('headerScripts', 3))}${fld('Footer scripts', ta('footerScripts', 3))}` : '<p class="a-help">Analytics & scripts are Owner-only settings.</p>';
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>Global SEO</h2>
        ${fld('Site Title', inp('title'))}${fld('Meta Description', ta('description', 3))}${fld('Keywords', inp('keywords'))}
        ${sw('robotsIndex', 'Allow search engines to index the site')}
        <div class="a-row end" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="seo-save">Save SEO</button></div>
        <p class="a-help" style="margin-top:.6rem">Per-page and per-product meta is edited on the item itself (Pages → SEO, Product → SEO tab).<br>Public files: <a href="/sitemap.xml" target="_blank">/sitemap.xml</a> · <a href="/robots.txt" target="_blank">/robots.txt</a></p></div>
      <div class="a-card"><h2>Analytics & Scripts</h2><div id="an-body">${ownerScripts}</div>
        ${can('owner') ? '<div class="a-row end" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="an-save">Save Analytics</button></div>' : ''}</div>
      <div class="a-card"><h2>404 Page</h2>${fld('Heading', inp('heading'))}${fld('Description', ta('text', 2))}<div class="a-row end" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="nf-save">Save 404</button></div></div>
      <div class="a-card"><h2>Redirects</h2><div id="redir"></div></div>
    </div>`;
  fill(v.querySelector('.a-card'), seo); fill($('#an-body', v), analytics);
  fill(v.querySelectorAll('.a-card')[2], nf);
  $('#seo-save', v).onclick = () => settingsPut('seo', collect(v.querySelector('.a-card')));
  $('#an-save') && ($('#an-save', v).onclick = () => settingsPut('analytics', collect($('#an-body', v))));
  $('#nf-save', v).onclick = () => settingsPut('notfound', collect(v.querySelectorAll('.a-card')[2]));
  crudList($('#redir', v), '/redirects', [{ k: 'from_path', l: 'From' }, { k: 'to_path', l: 'To' }], [
    { k: 'from_path', l: 'From path', ex: '/old-page' }, { k: 'to_path', l: 'To path', ex: '/products' },
    { k: 'code', l: 'HTTP code', type: 'sel', opts: [['301', '301 Permanent'], ['302', '302 Temporary']] }, { k: 'enabled', l: 'Enabled' }], 'redirect');
};

/* ============ DOCUMENTS ============ */
VIEWS.documents = async (v) => {
  const [files, pdfC] = await Promise.all([api('/catalogue'), settingsGet('pdf')]);
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>Catalogue PDFs</h2><p class="a-help">The latest <b>active</b> catalogue is served at <a href="/catalogue/latest" target="_blank">/catalogue/latest</a>.</p>
      <form id="cat-form"><div class="a-grid a-grid-2">
        ${fld('Label', '<input name="label" required>', '', 'Summer 2026 Catalogue')}
        ${fld('Version', '<input name="version" value="1.0">')}</div>
        ${fld('Notes', '<textarea name="notes" rows="2"></textarea>')}
        <input type="file" name="file" accept="application/pdf" required>
        <div style="margin-top:.6rem"><button class="a-btn a-btn-pri" type="submit">Upload Catalogue</button></div></form>
      <div style="margin-top:1rem">${files.files.map(f => `<div class="a-listitem"><div class="grow"><b>${esc(f.label)}</b> <span class="a-badge">v${esc(f.version)}</span> ${f.active ? '<span class="a-badge green">ACTIVE</span>' : ''}
        <div class="a-help">${fmtBytes(f.size)} · ${f.downloads} downloads · ${fmtDate(f.created_at)}</div></div>
        <a class="a-btn a-btn-ghost a-btn-sm" href="/api/admin/catalogue/${f.id}/download">Download</a>
        ${f.active ? '' : `<button class="a-btn a-btn-ghost a-btn-sm" data-act="${f.id}">Set Active</button>`}
        <button class="a-btn a-btn-danger a-btn-sm" data-cdel="${f.id}">✕</button></div>`).join('') || '<div class="a-empty">No catalogue uploaded yet — the site works fine without one.</div>'}</div></div>
      <div class="a-card"><h2>Product Spec-Sheet PDFs</h2><p class="a-help">Generated automatically on every product page (“Spec Sheet (PDF)” button). A4, branded, includes contact details.</p>
        ${sw('showPrice', 'Include product pricing in PDFs')}
        <div style="margin:.5rem 0">${sw('includeContact', 'Include contact details in footer')}</div>
        ${fld('PDF footer text', inp('footer'))}
        <div class="a-row end" style="margin-top:.6rem"><button class="a-btn a-btn-pri a-btn-sm" id="pdf-save">Save PDF Settings</button></div></div>
    </div>`;
  $('#cat-form', v).onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try { const r = await fetch('/api/admin/catalogue', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd }); const j = await r.json(); if (!j.ok) throw new Error(j.error); toast('Uploaded'); VIEWS.documents(v); } catch (err) { toast(err.message, true); }
  };
  $$('[data-act]', v).forEach(b => b.onclick = async () => { await api('/catalogue/' + b.dataset.act, { method: 'PUT', body: JSON.stringify({ active: true }) }); VIEWS.documents(v); });
  $$('[data-cdel]', v).forEach(b => b.onclick = async () => { if (await confirmAction('Delete this catalogue file?')) { await api('/catalogue/' + b.dataset.cdel, { method: 'DELETE' }); VIEWS.documents(v); } });
  fill(v.querySelectorAll('.a-card')[1], pdfC);
  $('#pdf-save', v).onclick = () => settingsPut('pdf', collect(v.querySelectorAll('.a-card')[1]));
};

/* ============ THEME ============ */
const MORA_CLASSIC = { cream: '#FFFDF8', creamSoft: '#FBF9F4', white: '#FFFFFF', walnut: '#5C3D2E', walnutDark: '#3B2417', walnutLight: '#8A6A52', border: '#D9CBBB', red: '#8B0000', charcoal: '#1A1A1A', grey: '#6B6B6B', success: '#3F6B4A' };
VIEWS.theme = async (v) => {
  const [brand, adv] = await Promise.all([settingsGet('brand'), settingsGet('advanced')]);
  const COLOR_KEYS = [['cream', 'Cream White'], ['creamSoft', 'Soft Cream'], ['white', 'White'], ['walnut', 'Walnut'], ['walnutDark', 'Dark Walnut'], ['walnutLight', 'Walnut Light'], ['border', 'Border'], ['red', 'Blood Red'], ['charcoal', 'Charcoal'], ['grey', 'Warm Grey'], ['success', 'Success']];
  const FONT_H = ['Cormorant Garamond', 'Playfair Display', 'Lora'], FONT_B = ['DM Sans', 'Lato', 'Inter'];
  function luminance(hex) { const c = hex.replace('#', ''); const f = i => { const x = parseInt(c.substr(i, 2), 16) / 255; return x <= .03928 ? x / 12.92 : Math.pow((x + .055) / 1.055, 2.4); }; return .2126 * f(0) + .7152 * f(2) + .0722 * f(4); }
  function wcag(fg, bg) { const l1 = luminance(fg), l2 = luminance(bg); const r = (Math.max(l1, l2) + .05) / (Math.min(l1, l2) + .05); return { val: r.toFixed(1), ok: r >= 4.5 }; }
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>Brand Assets</h2>
        ${imgPicker('logoId', 'Primary Logo', 'Shown in header/footer/emails. Transparent PNG or JPG.')}
        ${imgPicker('logoDarkId', 'Logo for dark backgrounds (optional)')}
        ${imgPicker('faviconId', 'Favicon', 'Square, will be resized by browsers.')}
        ${imgPicker('ogImageId', 'Social Share Image (OG)', '1200×630 recommended.')}
      </div>
      <div class="a-card"><h2>Colours</h2>
        <p class="a-help">HEX + picker, live contrast check against Cream White.</p>
        <div id="colors"></div>
        <div class="a-row end"><button class="a-btn a-btn-ghost a-btn-sm" id="col-reset">Reset to MORA Classic</button></div></div>
      <div class="a-card"><h2>Typography & Shape</h2>
        <div class="a-grid a-grid-2">
          ${fld('Heading Font', sel('headingFont', FONT_H.map(f => [f, f])))}
          ${fld('Body Font', sel('bodyFont', FONT_B.map(f => [f, f])))}
          ${fld('Corner Radius', inp('radius'), '', '10px')}
        </div>
        <p id="font-prev" style="font-size:1rem;border:1px solid var(--line);border-radius:8px;padding:.8rem"><span style="font-family:var(--p-fh)">Aa — Cormorant headings remain timeless.</span><br>Body text sample in your chosen typeface.</p></div>
      <div class="a-card"><h2>Watermark</h2>
        ${sw('watermark.enabled', 'Enable watermark system')}
        <div class="a-grid a-grid-2">${fld('Opacity (0–1)', inp('watermark.opacity', 'number', 'data-num step="0.01" min="0" max="0.3"'))}${fld('Size (px)', inp('watermark.size', 'number', 'data-num'))}
        ${fld('Position', sel('watermark.position', [['center', 'Center'], ['left', 'Left'], ['right', 'Right']]))}</div>
        <p class="a-help">Watermarks never overlap forms, tables or product photos; they only show where the switch is ON per section (Homepage Builder).</p></div>
      ${can('owner') ? `<div class="a-card"><h2>Custom CSS <span class="a-badge red">Owner · advanced</span></h2>
        <div class="a-warn"><span>⚠</span><span>Advanced users only. Incorrect CSS may change the visual appearance of the website.</span></div>
        <div style="margin-top:.7rem">${fld('Custom CSS', '<textarea id="adv-css" rows="8" style="font-family:monospace"></textarea>')}</div></div>` : ''}
    </div>
    <div class="a-row end" style="margin-top:1rem;position:sticky;bottom:1rem;background:var(--bg);padding:.7rem;border:1px solid var(--line);border-radius:12px">
      <a class="txt-link" href="/" target="_blank">Preview on Site ↗</a><button class="a-btn a-btn-ghost" id="th-hist">History</button><button class="a-btn a-btn-pri" id="th-save">Save Brand & Theme</button></div>`;
  const colBox = $('#colors', v);
  function renderColors() {
    colBox.innerHTML = COLOR_KEYS.map(([k, l]) => {
      const val = brand.colors?.[k] || MORA_CLASSIC[k];
      const w = ['walnut', 'walnutDark', 'red', 'success', 'charcoal', 'grey'].includes(k) ? wcag(val, brand.colors?.cream || '#FFFDF8') : null;
      return `<div class="color-row"><label style="margin:0">${l}</label><input data-col="${k}" value="${esc(val)}"><input type="color" data-cpic="${k}" value="${/^#[0-9a-f]{6}$/i.test(val) ? val : '#5C3D2E'}"><span class="wcag ${w ? (w.ok ? 'ok' : 'bad') : ''}">${w ? (w.ok ? 'AA ✓ ' + w.val : 'AA ✗ ' + w.val) : ''}</span></div>`;
    }).join('');
    $$('[data-col]', colBox).forEach(i => i.oninput = () => { brand.colors[i.dataset.col] = i.value; const p = colBox.querySelector(`[data-cpic="${i.dataset.col}"]`); if (/^#[0-9a-f]{6}$/i.test(i.value)) p.value = i.value; markDirty(); refreshWcag(); });
    $$('[data-cpic]', colBox).forEach(i => i.oninput = () => { brand.colors[i.dataset.cpic] = i.value; colBox.querySelector(`[data-col="${i.dataset.cpic}"]`).value = i.value; markDirty(); refreshWcag(); });
  }
  function refreshWcag() { renderColors(); }
  renderColors();
  $('#col-reset', v).onclick = () => { brand.colors = { ...MORA_CLASSIC }; renderColors(); markDirty(); };
  const typCard = v.querySelectorAll('.a-card')[2];
  fill(typCard, brand);
  const wmCard = v.querySelectorAll('.a-card')[3]; fill(wmCard, brand);
  wirePickers(v.querySelector('.a-card')); hydratePickers(v.querySelector('.a-card'));
  fill($('input[data-b="logoId"]')?.closest('.a-card') || v, brand);
  if (can('owner')) $('#adv-css', v).value = adv.customCss || '';
  $('#th-hist', v).onclick = () => versionsModal('settings', 'brand', 'Brand & Theme');
  $('#th-save', v).onclick = async () => {
    const cards = $$('.a-card', v);
    const c0 = collect(cards[0]); const c2 = collect(cards[2]); const c3 = collect(cards[3]);
    const data = { ...brand, ...c0, headingFont: c2.headingFont, bodyFont: c2.bodyFont, radius: c2.radius, watermark: c3.watermark };
    await settingsPut('brand', data);
    if (can('owner')) await settingsPut('advanced', { customCss: $('#adv-css', v).value });
    toast('Theme saved — live within 5 seconds');
  };
};

/* ============ BUSINESS ============ */
VIEWS.business = async (v) => {
  const biz = await settingsGet('business');
  v.innerHTML = `<div class="a-grid a-grid-2">
    <div class="a-card"><h2>Business Information</h2>
      ${fld('Business Name', inp('name'))}${fld('Tagline', inp('tagline'))}
      ${fld('Address', ta('address', 2))}
      <div class="a-grid a-grid-2">${fld('Phone (single source of truth)', inp('phone'), 'All tel: and WhatsApp links derive from this.', '+918171246275')}${fld('WhatsApp Number', inp('whatsapp'), 'Phone with country code (wa.me). Same value = enter the same.', '+918171246275')}</div>
      <div class="a-grid a-grid-2">${fld('Email 1 (Enquiries)', inp('emailPrimary'))}${fld('Email 2 (Ask MORA)', inp('emailSecondary'))}</div>
      <div class="a-grid a-grid-2">${fld('Business Hours', inp('hours'))}${fld('GST Number', inp('gst'))}</div>
      ${fld('Google Maps embed URL', inp('mapUrl'), 'Share → Embed a map → src URL.')}
    </div>
    <div class="a-card"><h2>Social Links</h2>
      ${Object.keys({ instagram: 1, facebook: 1, linkedin: 1, pinterest: 1, youtube: 1 }).map(k => fld(k[0].toUpperCase() + k.slice(1), inp('socials.' + k), '', 'https://…')).join('')}
      <button class="a-btn a-btn-pri a-btn-sm" id="biz-save">Save Business Info</button></div>
  </div><div class="a-row end" style="margin-top:1rem"><button class="a-btn a-btn-pri" id="biz-save2">Save Business Info</button></div>`;
  fill(v, biz);
  const save = () => settingsPut('business', collect(v));
  $('#biz-save', v).onclick = save; $('#biz-save2', v).onclick = save;
};

/* ============ COMMERCE ============ */
VIEWS.commerce = async (v) => {
  const c = await settingsGet('commerce');
  v.innerHTML = `<div class="a-grid a-grid-2">
    <div class="a-card"><h2>Commerce & Pricing Rules</h2>
      ${fld('Currency', sel('currency', [['INR', 'INR — ₹']]))}
      ${fld('Default Price Visibility', sel('defaultPriceVisibility', [['Hide (Price on Request)', 'Hide — Price on Request'], ['Show', 'Show when set']]), 'Never shows ₹0.')}
      ${fld('Default GST', inp('gstDefault'))}${fld('Default Lead Time', inp('leadTimeDefault'))}
      ${fld('Pricing section label', inp('pricingLabel'))}
      </div>
    <div class="a-card"><h2>MOQ & Samples</h2>
      ${fld('MOQ notice text', ta('moqMessage', 2))}${fld('Sample policy line', ta('samplePolicy', 2))}
      <div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-pri a-btn-sm" id="cm-save">Save</button></div></div></div>`;
  fill(v, c);
  $('#cm-save', v).onclick = () => settingsPut('commerce', collect(v));
};

/* ============ SITE CONTROLS ============ */
VIEWS.site = async (v) => {
  const s = await settingsGet('site');
  v.innerHTML = `<div class="a-grid a-grid-2">
    <div class="a-card"><h2>Maintenance Mode</h2>
      ${sw('maintenance', 'Maintenance mode ON (public sees “back soon”; signed-in admins still see the site)')}
      <div class="a-warn" style="margin-top:.6rem"><span>⚠</span><span>Use while making sweeping changes. Remember to turn it OFF.</span></div></div>
    <div class="a-card"><h2>Announcement Bar</h2>
      ${sw('announcement.enabled', 'Show announcement bar')}
      ${fld('Text', inp('announcement.text'))}
      <div class="a-grid a-grid-2">${fld('Link Label', inp('announcement.linkLabel'))}${fld('Link URL', inp('announcement.linkUrl'))}
      ${fld('Background', inp('announcement.bg', 'color'))}${fld('Text colour', inp('announcement.color', 'color'))}</div></div>
    <div class="a-card"><h2>Global Action Dock</h2>
      <div class="a-row" style="flex-wrap:wrap">${sw('dock.mobileEnquiry', 'Mobile: Send Enquiry')}${sw('dock.mobileWhatsApp', 'Mobile: WhatsApp')}${sw('dock.desktopWhatsApp', 'Desktop: WhatsApp bubble')}${sw('dock.desktopList', 'Desktop: Enquiry List bubble')}</div></div>
    <div class="a-card"><h2>Miscellaneous</h2>
      ${fld('Cookie / consent message (blank = off)', ta('cookieText', 2))}
      ${sw('photoWatermark', 'Apply watermark on product photos (PDF & download)')}
      <div style="margin:.4rem 0">${sw('recentlyViewed', 'Show “Recently Viewed” on product pages')}</div>
      <div style="margin:.4rem 0">${sw('legalReviewed', 'I have reviewed the legal pages (checklist)')}${sw('seoReviewed', 'I have reviewed the SEO settings (checklist)')}</div></div>
  </div>
  <div class="a-card" style="margin-top:1rem"><h2>Danger Zone</h2>
    <p class="a-help">Remove demo products and demo testimonials that shipped with the CMS. This cannot be undone (take a backup first).</p>
    <button class="a-btn a-btn-danger" id="demo-purge">Delete Demo Data</button></div>
  <div class="a-row end" style="margin-top:1rem"><button class="a-btn a-btn-pri" id="site-save">Save Site Controls</button></div>`;
  fill(v, s);
  $('#site-save', v).onclick = () => settingsPut('site', collect(v));
  $('#demo-purge', v).onclick = async () => { if (await confirmAction('Delete ALL demo data?')) { await api('/demo/purge', { method: 'POST', body: '{}' }); toast('Demo data removed'); } };
};

/* ============ SECURITY ============ */
VIEWS.security = async (v) => {
  const j = await api('/users');
  v.innerHTML = `
    <div class="a-grid a-grid-2">
      <div class="a-card"><h2>Team Accounts</h2>
        <p class="a-help"><b>Owner</b>: everything · <b>Manager</b>: all except users/backup · <b>Editor</b>: products, media, pages, homepage · <b>Sales</b>: leads + read-only products.</p>
        <div class="a-toolbar"><button class="a-btn a-btn-pri a-btn-sm" id="us-add">+ Add User</button></div>
        ${j.users.map(u => `<div class="a-listitem"><div class="grow"><b>${esc(u.name)}</b> <span class="a-badge">${esc(u.role)}</span><div class="a-help">${esc(u.email)} · last login ${u.last_login ? fmtDate(u.last_login) : 'never'}</div></div>
          <button class="a-btn a-btn-ghost a-btn-sm" data-ue="${u.id}">Edit</button>
          ${u.id === ME.id ? '' : `<button class="a-btn a-btn-danger a-btn-sm" data-ud="${u.id}">✕</button>`}</div>`).join('')}</div>
      <div class="a-card"><h2>Your Password</h2>
        ${fld('Current password', '<input type="password" id="pw-cur">')}${fld('New password (8+ chars)', '<input type="password" id="pw-new">')}
        <div class="a-row"><button class="a-btn a-btn-pri a-btn-sm" id="pw-save">Change Password</button></div>
        <div style="margin-top:1rem;border-top:1px solid var(--line);padding-top:1rem">
        <h3>Sessions</h3><button class="a-btn a-btn-ghost a-btn-sm" id="soa">Sign out everywhere else</button>
        <p class="a-help">Sessions idle-expire after 12 hours (30 days if “remember device” was used at login). Failed logins lock the account for 15 minutes after 5 tries. Login tracking appears in the Audit Log.</p></div></div>
    </div>`;
  $('#us-add', v).onclick = () => userEdit(null);
  $$('[data-ue]', v).forEach(b => b.onclick = () => userEdit(j.users.find(u => u.id == b.dataset.ue)));
  $$('[data-ud]', v).forEach(b => b.onclick = async () => { if (await confirmAction('Delete this account?')) { await api('/users/' + b.dataset.ud, { method: 'DELETE' }); VIEWS.security(v); } });
  $('#pw-save', v).onclick = async () => { try { await api('/auth/password', { method: 'PUT', body: JSON.stringify({ current: $('#pw-cur', v).value, next: $('#pw-new', v).value }) }); toast('Password changed'); } catch (e) { toast(e.message, true); } };
  $('#soa', v).onclick = async () => { await api('/auth/signout-everywhere', { method: 'POST', body: '{}' }); toast('Other sessions signed out'); };
  function userEdit(u) {
    const isNew = !u;
    const b = openModal(isNew ? 'Add User' : 'Edit ' + esc(u.name), `
      ${fld('Name', inp('name'))}${isNew ? fld('Email', inp('email', 'email')) : `<p class="a-help">${esc(u.email)}</p>`}
      ${fld('Role', sel('role', [['owner', 'Owner'], ['manager', 'Manager'], ['editor', 'Editor'], ['sales', 'Sales']]))}
      ${fld(isNew ? 'Password (8+ chars)' : 'Reset password (leave blank to keep)', inp('password', 'password'))}
      <div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-pri" id="uu-save">Save</button></div>`);
    if (u) fill(b, u);
    $('#uu-save', b).onclick = async () => {
      const d2 = collect(b);
      try {
        if (isNew) await api('/users', { method: 'POST', body: JSON.stringify(d2) });
        else await api('/users/' + u.id, { method: 'PUT', body: JSON.stringify(d2) });
        closeModal(); VIEWS.security(v);
      } catch (e) { toast(e.message, true); }
    };
  }
};

/* ============ BACKUP ============ */
VIEWS.backup = async (v) => {
  const j = await api('/backups');
  v.innerHTML = `<div class="a-grid a-grid-2">
    <div class="a-card"><h2>Create & Download Backup</h2>
      <p class="a-help">A backup is a JSON snapshot of the entire database (content, products, leads, users). Media files live on disk under <b>data/uploads</b> — copy that folder for full media backup.</p>
      <button class="a-btn a-btn-pri" id="bk-new">Create Backup Now</button>
      <div style="margin-top:1rem">${j.files.length ? j.files.map(f => `<div class="a-listitem"><div class="grow"><b>${esc(f.file)}</b><div class="a-help">${fmtBytes(f.size)} · ${fmtDate(f.created)}</div></div><a class="a-btn a-btn-ghost a-btn-sm" href="/api/admin/backups/${encodeURIComponent(f.file)}/download">Download</a></div>`).join('') : '<div class="a-empty">No backups yet.</div>'}</div></div>
    <div class="a-card"><h2>Restore</h2>
      <div class="a-warn"><span>⚠</span><span>Restoring <b>overwrites the entire database</b>. Download a fresh backup first.</span></div>
      <div class="a-fld" style="margin-top:.7rem"><label>Backup file (.json)</label><input type="file" id="rs-file" accept=".json"></div>
      <div class="a-fld"><label>Type RESTORE to confirm</label><input id="rs-confirm" placeholder="RESTORE"></div>
      <button class="a-btn a-btn-danger" id="rs-go">Restore Database</button></div></div>`;
  $('#bk-new', v).onclick = async () => { const r = await api('/backups', { method: 'POST', body: '{}' }); toast('Backup created: ' + r.file); VIEWS.backup(v); };
  $('#rs-go', v).onclick = async () => {
    const f = $('#rs-file', v).files[0];
    if (!f) return toast('Choose a backup file', true);
    const fd = new FormData(); fd.append('file', f); fd.append('confirm', $('#rs-confirm', v).value);
    try { const r = await fetch('/api/admin/backups/restore', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd }); const jj = await r.json(); if (!jj.ok) throw new Error(jj.error); toast('Database restored — sign in again if needed'); setTimeout(() => location.reload(), 900); } catch (e) { toast(e.message, true); }
  };
};

/* ============ AUDIT ============ */
VIEWS.audit = async (v) => {
  let page = 1, q = '';
  async function load() {
    const j = await api(`/audit?page=${page}&q=${encodeURIComponent(q)}`);
    v.innerHTML = `<div class="a-toolbar"><input type="search" id="au-q" placeholder="Search action, area, user…" value="${esc(q)}"></div>
      <div class="a-table-wrap"><table><thead><tr><th>When</th><th>User</th><th>Action</th><th>Area</th><th>Object</th><th>Changes</th></tr></thead><tbody>
      ${j.rows.map(r => `<tr><td style="white-space:nowrap">${fmtDate(r.created_at)}</td><td>${esc(r.user_name || 'system')}</td><td><span class="a-badge">${esc(r.action)}</span></td><td>${esc(r.area)}</td><td>${esc(r.object || '')}</td>
        <td class="a-help" style="max-width:340px;word-break:break-word">${r.prev ? `<div><b>was:</b> ${esc(r.prev.slice(0, 120))}</div>` : ''}${r.next ? `<div><b>now:</b> ${esc(r.next.slice(0, 120))}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="6">No audit entries yet.</td></tr>'}
      </tbody></table></div>
      <div class="a-pager"><button class="a-btn a-btn-ghost a-btn-sm" ${page <= 1 ? 'disabled' : ''} id="au-p">← Prev</button><span>page ${page}</span><button class="a-btn a-btn-ghost a-btn-sm" ${j.rows.length < 50 ? 'disabled' : ''} id="au-n">Next →</button></div>`;
    $('#au-q', v).oninput = debounce(() => { q = $('#au-q', v).value; page = 1; load(); }, 350);
    $('#au-p', v).onclick = () => { page--; load(); };
    $('#au-n', v).onclick = () => { page++; load(); };
  }
  load();
};

/* ============ GUIDE ============ */
VIEWS.guide = (v) => {
  const items = [
    ['Change the logo', 'Brand & Theme → Brand Assets → Primary Logo. Pick “Choose…” → upload or select. It updates everywhere (header, footer, emails, PDFs) within 5 seconds. Leave blank → a text “MORA HOME” mark shows.'],
    ['Upload photos', 'Media Library → drag & drop onto the page. Originals are preserved; WebP/AVIF responsive sizes are generated automatically. Use “Replace Image (same ID)” to swap a photo everywhere it is used.'],
    ['Change the hero', 'Homepage Builder → Hero → Edit. Upload a slide image (desktop + optional mobile), edit headings and buttons, Save Draft to stage, Publish to go live.'],
    ['Add a product', 'Products → + New Product. Fill the tabs (photos optional — branded placeholders show until the real photography is uploaded). Set status Published to go live.'],
    ['Change colours', 'Brand & Theme → Colours. Use the hex field or picker — contrast warnings appear inline. “Reset to MORA Classic” restores defaults.'],
    ['Edit homepage sections', 'Homepage Builder. Use ▲▼ to reorder, the switch to show/hide, Edit for content/layout, Duplicate to clone.'],
    ['Edit navigation', 'Navigation & Footer → Main Navigation. Footer columns, contact block and legal links are on the same screen.'],
    ['Edit forms', 'Forms Builder → choose the form → toggle fields visible/required, rename labels, reorder. Name & phone stay required.'],
    ['Change emails', 'Email → SMTP for delivery, Routing for recipients, Templates for wording. Use “Send Test Email”.'],
    ['Change WhatsApp number', 'Business Info → WhatsApp Number. Every button site-wide derives from this single value. Templates live under WhatsApp.'],
    ['Publish workflow', 'Every major editor supports: Save Draft → Preview on Site → Publish. Use Version History to revert (last 20 kept).'],
    ['Backup', 'Security-minded owner? Backup & Restore → Create Backup Now weekly. The whole content database downloads as JSON.']
  ];
  v.innerHTML = `<div class="a-card guide"><h2>Admin Guide</h2><p class="a-help">Everything on the public website is controlled from this panel — no code edits needed for normal changes.</p>
    ${items.map((it, i) => `<h3>${i + 1}. ${it[0]}</h3><p>${it[1]}</p>`).join('')}
    <h3>Roles</h3><p><b>Owner</b> everything · <b>Manager</b> everything except users/security/backup · <b>Editor</b> products, media, pages, homepage · <b>Sales</b> leads inbox only.</p>
    <h3>Keyboard</h3><p><code>Ctrl/⌘ + K</code> global search · <code>Esc</code> close panels.</p></div>`;
};

/* ============ command palette ============ */
function openPalette() {
  if (!ME) return;
  if ($('.palette')) { $('.palette').remove(); return; }
  const p = document.createElement('div'); p.className = 'palette';
  p.innerHTML = `<div class="palette-card"><input id="pal-q" placeholder="Search products, leads, media, pages, screens… (Esc to close)"><div class="palette-res" id="pal-r"><div class="p-item"><span class="p-type">Tip</span>Type “MH-1001”, a name, or @screen (e.g. @media)</div></div></div>`;
  document.body.appendChild(p);
  const q = $('#pal-q', p); q.focus();
  p.onclick = e => { if (e.target === p) p.remove(); };
  document.addEventListener('keydown', function esc2(e) { if (e.key === 'Escape') { p.remove(); document.removeEventListener('keydown', esc2); } });
  q.oninput = debounce(async () => {
    const term = q.value.trim();
    if (!term) return;
    const out = [];
    try {
      const [pr, ld, md] = await Promise.all([
        can('editor') ? api('/products?q=' + encodeURIComponent(term) + '&page=1').catch(() => null) : null,
        can('sales') ? api('/leads?q=' + encodeURIComponent(term)).catch(() => null) : null,
        can('editor') ? api('/media?q=' + encodeURIComponent(term)).catch(() => null) : null
      ]);
      SCREENS.filter(s => can(s.min || 'sales') && s.t.toLowerCase().includes(term.toLowerCase())).slice(0, 3)
        .forEach(s => out.push(`<div class="p-item" data-go="#/${s.id}"><span class="p-type">Screen</span>${s.t}</div>`));
      if (pr) pr.products.slice(0, 5).forEach(x => out.push(`<div class="p-item" data-go="#/products/${x.id}"><span class="p-type">Product</span><b>${esc(x.code)}</b> ${esc(x.name)}</div>`));
      if (ld) ld.leads.slice(0, 4).forEach(l => out.push(`<div class="p-item" data-go="#/leads"><span class="p-type">Lead</span>${esc(l.name)} · ${esc(l.type)}</div>`));
      if (md) md.media.slice(0, 4).forEach(m => out.push(`<div class="p-item" data-go="#/media"><span class="p-type">Media</span>${esc(m.name)}</div>`));
    } catch (e) { }
    $('#pal-r', p).innerHTML = out.join('') || '<div class="p-item"><span class="p-type">—</span>No matches</div>';
    $$('.p-item[data-go]', p).forEach(it => it.onclick = () => { location.hash = it.dataset.go; p.remove(); });
  }, 250);
}

/* ============ auth screens ============ */
function showAuth(mode) {
  const app = $('#app');
  app.innerHTML = `<div class="wiz"><div class="a-card">
    <div class="boot-logo" style="justify-content:center;margin-bottom:1rem"><b>MORA</b><span>HOME</span></div>
    <h2 style="text-align:center">Admin Sign In</h2>
    ${fld('Email', '<input type="email" id="lg-email" autocomplete="username">')}
    ${fld('Password', '<input type="password" id="lg-pass" autocomplete="current-password">')}
    <label style="display:flex;gap:.5rem;align-items:center;font-weight:500"><input type="checkbox" id="lg-rem" style="width:auto" checked> Remember this device (30 days)</label>
    <div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-pri" id="lg-go">Sign In</button></div>
    <div class="a-help" id="lg-err" style="color:var(--red);text-align:center"></div></div></div>`;
  $('#lg-go').onclick = doLogin;
  $('#lg-pass').onkeydown = e => { if (e.key === 'Enter') doLogin(); };
  async function doLogin() {
    try {
      const j = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#lg-email').value, password: $('#lg-pass').value, remember: $('#lg-rem').checked }) });
      CSRF = j.csrf; ME = j.user; renderShell();
    } catch (e) { $('#lg-err').textContent = e.message; }
  }
}
function showSetup() {
  const app = $('#app');
  let step = 0; const data = {};
  const steps = [
    () => `<h2>Welcome to MORA HOME</h2><p class="a-help">Step 1/4 — create the Owner account. There are no default credentials — this is the only way in.</p>
      ${fld('Your name', '<input id="st-name">')}${fld('Email', '<input id="st-email" type="email">')}${fld('Password (8+ chars)', '<input id="st-pass" type="password">')}
      <div class="a-row end"><button class="a-btn a-btn-pri" id="st-next">Create Owner →</button></div><div class="a-help" id="st-err" style="color:var(--red)"></div>`,
    () => `<h2>Business information</h2><p class="a-help">Step 2/4 — editable later under Business Info.</p>
      ${fld('Phone', '<input id="st-phone" value="+918171246275">')}${fld('WhatsApp number', '<input id="st-wa" value="+918171246275">')}
      ${fld('Primary email', '<input id="st-em1" value="writemora@gmail.com">')}${fld('Address', '<textarea id="st-addr" rows="2">Moradabad, Uttar Pradesh, India</textarea>')}
      <div class="a-row end"><button class="a-btn a-btn-ghost" id="st-skip">Skip</button><button class="a-btn a-btn-pri" id="st-next">Continue →</button></div>`,
    () => `<h2>Upload your logo</h2><p class="a-help">Step 3/4 — optional now; a text “MORA HOME” wordmark shows until you upload one.</p>
      <input type="file" id="st-logo" accept="image/*">
      <div class="a-row end" style="margin-top:.8rem"><button class="a-btn a-btn-ghost" id="st-skip">Skip</button><button class="a-btn a-btn-pri" id="st-next">Upload & Continue →</button></div>`,
    () => `<h2>All set!</h2><p class="a-help">Step 4/4 — your website is live with branded placeholders. Upload real photography from the Media Library, create products, then invite the team under Security.</p>
      <a class="a-btn a-btn-pri a-btn-block" href="#/dashboard" id="st-done">Open Dashboard →</a>`
  ];
  function render() {
    app.innerHTML = `<div class="wiz"><div class="a-card">
      <div class="wiz-steps">${steps.map((_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>
      <div class="boot-logo" style="margin-bottom:1rem"><b>MORA</b><span>HOME</span></div>${steps[step]()}</div></div>`;
    $('#st-next') && ($('#st-next').onclick = next);
    $('#st-skip') && ($('#st-skip').onclick = () => { step++; render(); });
  }
  async function next() {
    if (step === 0) {
      try {
        const j = await api('/auth/setup', { method: 'POST', body: JSON.stringify({ name: $('#st-name').value, email: $('#st-email').value, password: $('#st-pass').value }) });
        CSRF = j.csrf; step++; render();
      } catch (e) { $('#st-err').textContent = e.message; }
    } else if (step === 1) {
      try { await settingsPut('business', { ...await settingsGet('business'), phone: $('#st-phone').value, whatsapp: $('#st-wa').value, emailPrimary: $('#st-em1').value, address: $('#st-addr').value }); } catch (e) { }
      step++; render();
    } else if (step === 2) {
      const f = $('#st-logo').files[0];
      if (f) {
        try {
          const fd = new FormData(); fd.append('files', f);
          const r = await fetch('/api/admin/media', { method: 'POST', headers: { 'X-CSRF-Token': CSRF }, body: fd });
          const jj = await r.json();
          const id = jj.media?.[0]?.id;
          if (id) await settingsPut('brand', { ...(await settingsGet('brand')), logoId: id, faviconId: id, ogImageId: id });
        } catch (e) { }
      }
      step++; render();
    }
  }
  render();
}

/* ============ boot ============ */
(async function boot() {
  try {
    const j = await api('/auth/me');
    if (!j.hasUsers) return showSetup();
    if (!j.user) return showAuth();
    ME = j.user; CSRF = j.csrf;
    renderShell();
  } catch (e) {
    $('#app').innerHTML = '<div class="boot"><p>Admin is unavailable (' + esc(e.message) + '). Check that the server is running.</p></div>';
  }
})();
})();
