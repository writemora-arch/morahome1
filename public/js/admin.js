/* ═══════════════════════════════════════════════════════════════
   MORA HOME — No-Code Admin Control Center (vanilla ES6 SPA)
   ═══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));

  let STATE = null, SCHEMAS = null, SCREEN = 'dashboard';

  async function api(path, opts = {}) {
    const o = Object.assign({ headers: {} }, opts);
    if (o.json) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(o.json); delete o.json; }
    const r = await fetch(path, o);
    if (r.status === 401) { location.href = '/admin/login'; throw new Error('Session expired'); }
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('json') ? await r.json() : await r.text();
    if (!r.ok) throw new Error((data && data.error) || 'Request failed');
    return data;
  }
  async function refresh() { STATE = await api('/api/admin/state'); renderTop(); render(); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600); }

  /* ───────────────────────── modal ───────────────────────── */
  function openModal(html) {
    const m = $('#adminModal'); $('#adminModalBody').innerHTML = `<button class="modal-x" type="button" data-close-admin-modal aria-label="Close">✕</button>` + html;
    m.hidden = false;
  }
  window.__closeAdminModal = () => { $('#adminModal').hidden = true; };
  $('#adminModal').addEventListener('click', (e) => { if (e.target.id === 'adminModal') window.__closeAdminModal(); });
  /* CSP-safe: one delegated listener instead of inline onclick attributes */
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-close-admin-modal]'); if (b) window.__closeAdminModal(); });

  /* ───────────────────────── top bar ───────────────────────── */
  function renderTop() {
    const el = $('#publishState');
    el.textContent = STATE.dirty ? '● Unpublished changes' : '✔ Live is up to date';
    el.className = 'publish-state' + (STATE.dirty ? ' dirty' : '');
  }
  $('#publishBtn').addEventListener('click', async () => { await api('/api/admin/publish', { method: 'POST' }); toast('🚀 Published! The live website is updated.'); await refresh(); });
  $('#revertBtn').addEventListener('click', async () => { if (!confirm('Discard all unpublished changes?')) return; await api('/api/admin/revert', { method: 'POST' }); toast('Changes reverted to live version.'); await refresh(); });
  $('#adminLogout').addEventListener('click', () => { location.href = '/admin/logout'; });
  $$('#adminNav button').forEach((b) => b.addEventListener('click', () => {
    $$('#adminNav button').forEach((x) => x.classList.remove('active'));
    b.classList.add('active'); SCREEN = b.dataset.screen; render();
  }));

  /* ───────────────────────── helpers ───────────────────────── */
  const field = (label, inner, hint) => `<label class="afield">${label}${inner}${hint ? `<span class="field-hint">${hint}</span>` : ''}</label>`;
  const input = (name, value, type = 'text', extra = '') => `<input type="${type}" data-f="${name}" value="${esc(value)}" ${extra}>`;
  const area = (name, value, rows = 3) => `<textarea data-f="${name}" rows="${rows}">${esc(value)}</textarea>`;
  function readForm(root) {
    const out = {};
    $$('[data-f]', root).forEach((el) => {
      if (el.type === 'checkbox') out[el.dataset.f] = el.checked;
      else out[el.dataset.f] = el.value;
    });
    return out;
  }
  function contrastRatio(a, b) {
    const lum = (hex) => { const c = hex.replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
    const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /* ═════════════════════ SCREENS ═════════════════════ */
  function render() {
    const c = $('#adminContent');
    const titles = { dashboard: 'Dashboard', customizer: 'Customize Design & Layout', sections: 'Homepage Section Builder', products: 'Product Manager', categories: 'Category Manager', leads: 'Leads Inbox (CRM)', contact: 'Contact & WhatsApp Manager', footer: 'Footer & Social Links', seo: 'SEO & Navigation', catalogue: 'Catalogue & PDF Spec Sheets', backup: 'Backup & Restore', guide: 'How to Use This Admin', settings: 'Settings & Demo Data' };
    $('#adminTitle').textContent = titles[SCREEN] || 'Admin';
    const fn = { dashboard: sDashboard, customizer: sCustomizer, sections: sSections, products: sProducts, categories: sCategories, leads: sLeads, contact: sContact, footer: sFooter, seo: sSeo, catalogue: sCatalogue, backup: sBackup, guide: sGuide, settings: sSettings }[SCREEN];
    c.innerHTML = ''; fn(c);
  }

  /* ───────────── dashboard ───────────── */
  function sDashboard(c) {
    const s = STATE.stats;
    c.innerHTML = `
    <div class="stat-tiles">
      <div class="tile"><b>${s.products}</b><span>Products (${s.published} published)</span></div>
      <div class="tile"><b>${s.leads}</b><span>Total leads captured</span></div>
      <div class="tile"><b>${s.newLeads}</b><span>New leads to reply</span></div>
      <div class="tile"><b>${s.categories}</b><span>Categories</span></div>
    </div>
    <div class="agrid two">
      <div class="acard"><h3>👋 Welcome to your Control Center</h3>
        <p class="hint">Everything on your website — texts, photos, colours, products, enquiries — is managed here. No coding ever needed.</p>
        <ul class="checklist">
          <li>1️⃣ Change colours & fonts in <b>Customize Design & Layout</b>, then press <b>Publish</b>.</li>
          <li>2️⃣ Add your real product photos in <b>Products</b> (demo products are pre-loaded).</li>
          <li>3️⃣ Reply to buyers from <b>Leads Inbox</b> — every enquiry lands there safely.</li>
          <li>4️⃣ Upload your wholesale PDF in <b>Catalogue & PDF Spec Sheets</b>.</li>
          <li>5️⃣ Take a <b>Backup</b> once a week (one click, one .zip file).</li>
        </ul>
      </div>
      <div class="acard"><h3>📥 Latest leads</h3>
        ${STATE.leads.slice(0, 5).map((l) => `<p style="margin:6px 0"><b>${esc(l.name || l.type)}</b> · ${esc(l.type)} · <i>${esc(l.status)}</i><br><span class="lead-meta">${esc(l.created_at)} · ${esc(l.phone || l.email || '')}</span></p>`).join('') || '<p class="hint">No leads yet — they will appear here the moment a visitor enquires.</p>'}
        <button class="abtn ghost small" data-goto="leads">Open Leads Inbox →</button>
      </div>
    </div>`;
    $('[data-goto]', c).addEventListener('click', () => { $('#adminNav button[data-screen="leads"]').click(); });
  }

  /* ───────────── customizer (split-screen live editor) ───────────── */
  function sCustomizer(c) {
    const t = clone(STATE.theme);
    c.innerHTML = `<div class="customizer">
      <div class="panel" id="czPanel">
        <button class="abtn ghost preset-btn" id="czReset">♻️ Reset to MORA Classic Theme</button>
        <div class="group-title">Brand & Logo</div>
        <label class="afield">Logo style on website
          <select data-t="logoMode">
            <option value="crest"${t.logoMode === 'crest' ? ' selected' : ''}>Ornamental Mandala Crest</option>
            <option value="wordmark"${t.logoMode === 'wordmark' ? ' selected' : ''}>Minimalist Wordmark (MORA / HOME)</option>
            <option value="both"${t.logoMode === 'both' ? ' selected' : ''}>Crest + Wordmark together</option>
          </select></label>
        <div class="agrid two">
          <label class="afield">Crest photo (transparent)<input type="file" id="upCrest" accept="image/*"></label>
          <label class="afield">Crest on ivory (footer/PDF)<input type="file" id="upCrestIvory" accept="image/*"></label>
        </div>
        <div class="group-title">Colours</div>
        <div class="agrid two">
          ${colorField('Page background', 'bgPrimary', t.bgPrimary)}
          ${colorField('Card background', 'bgSurface', t.bgSurface)}
          ${colorField('Headings (dark walnut)', 'walnutDark', t.walnutDark)}
          ${colorField('Icons & outlines (walnut)', 'walnut', t.walnut)}
          ${colorField('Small accents (light walnut)', 'walnutLight', t.walnutLight)}
          ${colorField('Borders', 'borderSubtle', t.borderSubtle)}
          ${colorField('Buttons (blood red)', 'crimson', t.crimson)}
          ${colorField('Button hover', 'crimsonHover', t.crimsonHover)}
          ${colorField('Body text', 'textPrimary', t.textPrimary)}
          ${colorField('Muted text', 'textMuted', t.textMuted)}
          ${colorField('WhatsApp green', 'waGreen', t.waGreen)}
          ${colorField('Alt section background', 'bgSecondary', t.bgSecondary)}
        </div>
        <div id="czWarnings"></div>
        <div class="group-title">Fonts & Sizes</div>
        <div class="agrid two">
          <label class="afield">Heading font<select data-t="headingFont">${['Playfair Display', 'Cormorant Garamond'].map((f) => `<option${t.headingFont === f ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
          <label class="afield">Body font<select data-t="bodyFont">${['DM Sans', 'Inter'].map((f) => `<option${t.bodyFont === f ? ' selected' : ''}>${f}</option>`).join('')}</select></label>
        </div>
        <label class="afield">Text size scale — <span id="czScaleVal">${t.sizeScale}%</span>
          <input type="range" min="90" max="115" step="1" data-t="sizeScale" value="${t.sizeScale}"></label>
        <div class="group-title">Cards & Buttons</div>
        <label class="afield">Card corner roundness — <span id="czCardVal">${t.cardRadius}px</span>
          <input type="range" min="0" max="24" data-t="cardRadius" value="${t.cardRadius}"></label>
        <label class="afield">Button corner roundness — <span id="czBtnVal">${t.btnRadius}px</span>
          <input type="range" min="0" max="50" data-t="btnRadius" value="${t.btnRadius}"></label>
        <label class="afield">Section vertical spacing
          <select data-t="spacing"><option value="compact"${t.spacing === 'compact' ? ' selected' : ''}>Compact</option><option value="normal"${t.spacing === 'normal' ? ' selected' : ''}>Normal</option><option value="spacious"${t.spacing === 'spacious' ? ' selected' : ''}>Spacious</option></select></label>
        <label class="afield">Mobile product grid
          <select data-t="mobileGridCols"><option value="2"${String(t.mobileGridCols) === '2' ? ' selected' : ''}>2 Columns (Recommended)</option><option value="1"${String(t.mobileGridCols) === '1' ? ' selected' : ''}>1 Column</option></select></label>
        <div class="group-title">Sidebar & Button Borders</div>
        <label class="afield">Sidebar / drawer button colour (2-colour option)
          <select data-t="drawerBtn">
            <option value="walnut"${t.drawerBtn !== 'crimson' ? ' selected' : ''}>Walnut Brown (#5C3D2E)</option>
            <option value="crimson"${t.drawerBtn === 'crimson' ? ' selected' : ''}>Blood Red (#8B0000)</option>
          </select></label>
        <div class="switch-row"><input type="checkbox" class="switch" data-t="redBorder" ${t.redBorder ? 'checked' : ''}><span>Blood-red borders — master switch</span></div>
        <div class="afield border-target-fields">Mark borders on… (choose where)
          <div class="switch-row"><input type="checkbox" class="switch" data-t="borderTargets" data-v="buttons" ${(t.borderTargets || []).includes('buttons') ? 'checked' : ''}><span>Buttons</span></div>
          <div class="switch-row"><input type="checkbox" class="switch" data-t="borderTargets" data-v="cards" ${(t.borderTargets || []).includes('cards') ? 'checked' : ''}><span>Cards & boxes</span></div>
          <div class="switch-row"><input type="checkbox" class="switch" data-t="borderTargets" data-v="inputs" ${(t.borderTargets || []).includes('inputs') ? 'checked' : ''}><span>Inputs & forms</span></div>
          <div class="switch-row"><input type="checkbox" class="switch" data-t="borderTargets" data-v="header" ${(t.borderTargets || []).includes('header') ? 'checked' : ''}><span>Header, footer & sidebar</span></div>
          <div class="switch-row"><input type="checkbox" class="switch" data-t="borderTargets" data-v="badges" ${(t.borderTargets || []).includes('badges') ? 'checked' : ''}><span>Badges & codes</span></div>
        </div>
        <div class="group-title">Gifting Banner Watermark</div>
        <div class="switch-row"><input type="checkbox" class="switch" data-t="watermarkOn" ${t.watermarkOn ? 'checked' : ''}><span>Show mandala watermark</span></div>
        <label class="afield">Watermark opacity — <span id="czWmVal">${t.watermarkOpacity}%</span>
          <input type="range" min="3" max="20" data-t="watermarkOpacity" value="${t.watermarkOpacity}"></label>
      </div>
      <div class="preview-wrap">
        <div class="preview-toolbar">
          <b>Live Preview</b>
          <div>
            <button class="abtn ghost small" id="pvMobile">📱 Mobile View</button>
            <button class="abtn ghost small" id="pvDesktop">💻 Desktop View</button>
            <button class="abtn ghost small" id="pvReload">⟳ Refresh</button>
          </div>
        </div>
        <div class="preview-frame-holder" id="pvHolder"><iframe id="pvFrame" src="/?preview=1"></iframe></div>
        <p class="hint" style="padding:8px 14px">💡 Click any heading or section inside the preview to jump straight to its edit box.</p>
      </div>
    </div>`;

    const frame = $('#pvFrame');
    const pushTheme = () => frame.contentWindow && frame.contentWindow.postMessage({ type: 'mora-theme', theme: STATE.theme }, '*');
    frame.addEventListener('load', pushTheme);
    $('#pvMobile').onclick = () => $('#pvHolder').classList.add('mobile');
    $('#pvDesktop').onclick = () => $('#pvHolder').classList.remove('mobile');
    $('#pvReload').onclick = () => { frame.src = '/?preview=1&r=' + Date.now(); };

    let saveTimer = null;
    const scheduleSave = () => { clearTimeout(saveTimer); saveTimer = setTimeout(async () => { await api('/api/admin/theme', { method: 'PUT', json: STATE.theme }); renderTop(); }, 500); };
    function warn() {
      const t = STATE.theme; const ws = [];
      if (contrastRatio(t.crimson, '#FFFFFF') < 3) ws.push('Button colour vs white text has low contrast — text may be hard to read.');
      if (contrastRatio(t.walnutDark, t.bgPrimary) < 3) ws.push('Heading colour vs page background has low contrast.');
      if (contrastRatio(t.textPrimary, t.bgPrimary) < 3) ws.push('Body text vs page background has low contrast.');
      $('#czWarnings').innerHTML = ws.map((w) => `<div class="contrast-warn">⚠️ ${w}</div>`).join('');
    }
    $('#czPanel').addEventListener('input', (e) => {
      const k = e.target.dataset.t; if (!k) return;
      if (k === 'borderTargets') {
        const cur = new Set(Array.isArray(STATE.theme.borderTargets) ? STATE.theme.borderTargets : []);
        if (e.target.checked) cur.add(e.target.dataset.v); else cur.delete(e.target.dataset.v);
        STATE.theme.borderTargets = [...cur];
        pushTheme(); scheduleSave(); return;
      }
      let v = e.target.value;
      if (e.target.type === 'checkbox') v = e.target.checked;
      if (['sizeScale', 'cardRadius', 'btnRadius', 'watermarkOpacity', 'mobileGridCols'].includes(k)) v = Number(v);
      STATE.theme[k] = v;
      if (k === 'sizeScale') $('#czScaleVal').textContent = v + '%';
      if (k === 'cardRadius') $('#czCardVal').textContent = v + 'px';
      if (k === 'btnRadius') $('#czBtnVal').textContent = v + 'px';
      if (k === 'watermarkOpacity') $('#czWmVal').textContent = v + '%';
      warn(); pushTheme(); scheduleSave();
    });
    $('#czReset').onclick = async () => {
      STATE.theme = { bgPrimary: '#FFFDF8', bgSecondary: '#FBF9F4', bgSurface: '#FFFFFF', walnut: '#5C3D2E', walnutDark: '#3B2417', walnutLight: '#8A6A52', borderSubtle: '#E5DEC9', crimson: '#8B0000', crimsonHover: '#6E0000', textPrimary: '#1A1A1A', textMuted: '#66625B', waGreen: '#25D366', headingFont: 'Playfair Display', bodyFont: 'DM Sans', sizeScale: 100, cardRadius: 14, btnRadius: 8, spacing: 'normal', mobileGridCols: 2, watermarkOn: true, watermarkOpacity: 8, logoMode: STATE.theme.logoMode, drawerBtn: 'walnut', redBorder: false, borderTargets: ['buttons'] };
      await api('/api/admin/theme', { method: 'PUT', json: STATE.theme });
      toast('Theme reset to the MORA Classic look.'); render();
    };
    async function uploadBrand(inputEl, key) {
      const f = inputEl.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f); fd.append('folder', 'brand');
      const r = await api('/api/admin/upload', { method: 'POST', body: fd });
      STATE.settings.brand[key] = r.path;
      await api('/api/admin/settings/brand', { method: 'PUT', json: STATE.settings.brand });
      toast('Logo updated — press Publish to push it live.'); renderTop();
    }
    $('#upCrest').onchange = (e) => uploadBrand(e.target, 'crestPath');
    $('#upCrestIvory').onchange = (e) => uploadBrand(e.target, 'crestIvoryPath');
    warn();
  }
  const colorField = (label, key, val) => `<label class="afield">${label}<input type="color" data-t="${key}" value="${esc(val)}"></label>`;

  /* ───────────── section builder ───────────── */
  function sSections(c) {
    c.innerHTML = `<div class="acard"><h3>Drag to reorder · switch to show/hide · edit content per section</h3>
      <p class="hint">Changes are saved as a draft — press <b>Publish</b> (top right) to push them to the live website.</p>
      <div id="secList">${STATE.sections.map((s) => sectionRow(s)).join('')}</div></div>`;
    const list = $('#secList');
    $$('#secList .section-row').forEach((row) => {
      row.querySelector('.drag-handle').addEventListener('mousedown', () => row.setAttribute('draggable', 'true'));
      row.addEventListener('dragstart', () => row.classList.add('dragging'));
      row.addEventListener('dragend', () => { row.classList.remove('dragging'); row.removeAttribute('draggable'); dropOrder(); });
    });
    list.addEventListener('dragover', (e) => {
      e.preventDefault();
      const after = [...list.querySelectorAll('.section-row:not(.dragging)')].reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        return offset < 0 && offset > closest.offset ? { offset, element: child } : closest;
      }, { offset: -Infinity }).element;
      const dragging = list.querySelector('.dragging');
      if (after) list.insertBefore(dragging, after); else list.appendChild(dragging);
    });
    async function dropOrder() {
      const order = $$('#secList .section-row').map((r, i) => ({ id: Number(r.dataset.id), order: i }));
      await api('/api/admin/sections/order', { method: 'PUT', json: { order } });
      await refresh();
    }
    $$('#secList [data-act]').forEach((btn) => btn.addEventListener('click', async () => {
      const id = Number(btn.closest('.section-row').dataset.id);
      const sec = STATE.sections.find((s) => s.id === id);
      if (btn.dataset.act === 'toggle') {
        await api(`/api/admin/sections/${id}`, { method: 'PUT', json: { visible: btn.checked } });
        renderTop(); toast(btn.checked ? 'Section will show after Publish.' : 'Section will hide after Publish.');
      }
      if (btn.dataset.act === 'edit') openSectionEditor(sec);
      if (btn.dataset.act === 'dup') { await api(`/api/admin/sections/${id}/duplicate`, { method: 'POST' }); toast('Section duplicated (hidden by default).'); await refresh(); }
    }));
  }
  const sectionRow = (s) => `<div class="section-row" data-id="${s.id}">
    <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
    <span class="name">${esc(s.name)}<small>${esc(s.key)} · ${s.visible ? 'visible' : 'hidden'}</small></span>
    <span class="actions">
      <input type="checkbox" class="switch" data-act="toggle" ${s.visible ? 'checked' : ''} title="Show / hide on website">
      <button class="abtn ghost small" data-act="edit">✏️ Edit Content</button>
      <button class="abtn ghost small" data-act="dup">📄 Duplicate</button>
    </span></div>`;

  function schemaFor(key) {
    const base = String(key).replace(/_\d+$/, '');
    return (SCHEMAS.sections.find((s) => s.key === base)) || null;
  }
  function openSectionEditor(sec, focusField) {
    const schema = schemaFor(sec.key);
    const content = clone(sec.content);
    if (!schema) { openModal(`<h3>${esc(sec.name)}</h3><p class="hint">This copied section uses free-form content.</p><pre>${esc(JSON.stringify(content, null, 2))}</pre>`); return; }
    let html = `<h3>✏️ ${esc(sec.name)}</h3><p class="hint">${esc(schema.hint || '')}</p><div id="secForm" class="agrid">`;
    schema.fields.forEach((f) => { html += renderField(f, content, ''); });
    html += `</div><div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
      <button class="abtn ghost" type="button" data-close-admin-modal>Cancel</button>
      <button class="abtn primary" id="secSave">💾 Save Section</button></div>`;
    openModal(html);
    bindRepeaters($('#secForm'), schema.fields, content);
    if (focusField) { const el = $(`[data-f="${focusField}"]`, $('#secForm')); if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); } }
    $('#secSave').onclick = async () => {
      collectRepeaters($('#secForm'), schema.fields, content);
      const flat = readForm($('#secForm'));
      schema.fields.forEach((f) => { if (f.type !== 'repeater' && flat[f.key] !== undefined) content[f.key] = flat[f.key]; });
      await api(`/api/admin/sections/${sec.id}`, { method: 'PUT', json: { content } });
      window.__closeAdminModal(); toast('Section saved (draft). Press Publish to go live.');
      await refresh(); reloadPreview();
    };
  }
  function renderField(f, content, prefix) {
    const val = content[f.key];
    const hint = f.hint ? `<span class="field-hint">${esc(f.hint)}</span>` : '';
    if (f.type === 'repeater') {
      return `<div class="afield" data-rep="${f.key}"><b style="font-size:12.5px;color:#5C3D2E">${esc(f.label)}</b>
        <div class="rep-list"></div><button class="abtn ghost small" data-rep-add="${f.key}" type="button">＋ Add ${esc(f.label.replace(/s$/i, ''))}</button>${hint}</div>`;
    }
    if (f.type === 'textarea') return field(f.label, area(prefix + f.key, val || ''), f.hint);
    if (f.type === 'select') return field(f.label, `<select data-f="${prefix + f.key}">${(f.options || []).map((o) => `<option value="${esc(o)}"${val === o ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`, f.hint);
    if (f.type === 'image') return field(f.label, `<input type="text" data-f="${prefix + f.key}" value="${esc(val || '')}" placeholder="/uploads/pages/….webp (or leave empty)">
      <input type="file" data-imgfor="${prefix + f.key}" accept="image/*" style="font-size:12px">
      ${val ? `<img src="${esc(val)}" style="max-width:120px;border-radius:10px;margin-top:6px">` : ''}`, f.hint);
    return field(f.label, input(prefix + f.key, val || ''), f.hint);
  }
  function bindRepeaters(root, fields, content) {
    fields.filter((f) => f.type === 'repeater').forEach((f) => {
      const wrap = $(`[data-rep="${f.key}"] .rep-list`, root);
      const draw = () => {
        wrap.innerHTML = (content[f.key] || []).map((item, i) => `<div class="rep-item" data-rep-item="${f.key}:${i}">
          <div class="rep-head"><span>${esc(f.label.replace(/s$/i, ''))} #${i + 1}${item.title || item.text || item.headline ? ' — ' + esc((item.title || item.text || item.headline).slice(0, 34)) : ''}</span>
          <button class="rep-remove" type="button" data-rep-rm="${f.key}:${i}">Remove</button></div>
          <div class="agrid">${f.fields.map((sf) => renderField(sf, item, `${f.key}.${i}.`)).join('')}</div></div>`).join('');
        /* nested repeaters are not used in MORA schemas — bind image uploads inside */
        $$('[data-imgfor]', wrap).forEach(bindImagePick);
        $$('[data-rep-rm]', wrap).forEach((b) => b.onclick = () => { const [k, i] = b.dataset.repRm.split(':'); content[k].splice(Number(i), 1); draw(); });
      };
      draw();
      $(`[data-rep-add="${f.key}"]`, root).onclick = () => { (content[f.key] = content[f.key] || []).push({}); if (f.max && content[f.key].length > f.max) { toast(`Maximum ${f.max} allowed.`); content[f.key].pop(); return; } draw(); };
    });
    $$('[data-imgfor]', root).forEach(bindImagePick);
  }
  function collectRepeaters(root, fields, content) {
    fields.filter((f) => f.type === 'repeater').forEach((f) => {
      (content[f.key] || []).forEach((item, i) => {
        f.fields.forEach((sf) => {
          const el = $(`[data-f="${f.key}.${i}.${sf.key}"]`, root);
          if (el) item[sf.key] = el.value;
        });
      });
    });
  }
  async function bindImagePick(el) {
    el.onchange = async () => {
      const f = el.files[0]; if (!f) return;
      if (!/^image\//.test(f.type) && !/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(f.name)) { toast('Please choose an image file (JPG, PNG, WebP…).'); el.value = ''; return; }
      const fd = new FormData(); fd.append('file', f); fd.append('folder', el.dataset.folder || 'pages');
      toast('Uploading… please wait');
      let r;
      try { r = await api('/api/admin/upload', { method: 'POST', body: fd }); }
      catch (e) { toast('Upload failed: ' + e.message); el.value = ''; return; }
      /* look ONLY inside this field's own box (label/cell) so every category gets its own photo */
      const scope = el.closest('label') || el.parentElement || document;
      const target = $(`[data-f="${el.dataset.imgfor}"]`, scope);
      if (target) target.value = r.path;
      /* category photos are saved to the database immediately, so they can never "disappear" */
      const catBox = el.closest('[data-cat-box]');
      if (catBox) {
        try {
          const v = readForm(catBox); v.sort = Number(v.sort || 0);
          await api(`/api/admin/categories/${catBox.dataset.catBox}`, { method: 'PUT', json: v });
          toast('Photo uploaded & saved ✔'); await refresh();
        } catch (e) { toast('Photo uploaded but saving failed: ' + e.message); }
        return;
      }
      toast('Image uploaded ✔');
    };
  }
  function reloadPreview() { const f = $('#pvFrame'); if (f) f.src = '/?preview=1&r=' + Date.now(); }

  /* click-to-edit bridge from preview iframe */
  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'mora-edit' && SCREEN === 'customizer') {
      const sec = STATE.sections.find((s) => String(s.key).replace(/_\d+$/, '') === d.section || s.key === d.section);
      if (sec) openSectionEditor(sec, d.field);
    }
  });

  /* ───────────── products ───────────── */
  function sProducts(c) {
    c.innerHTML = `<div class="acard">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
        <h3>Your products (${STATE.products.length})</h3>
        <button class="abtn primary" id="newProd">＋ Add New Product</button>
      </div>
      <p class="hint">Demo products show the exact reference layout. Upload real photos any time — or clear all demo data in Settings.</p>
      <div style="overflow-x:auto"><table class="prod-table"><thead><tr><th></th><th>Code</th><th>Price</th><th>Name</th><th>Badge</th><th>Category</th><th>MOQ</th><th>Status</th><th></th></tr></thead>
      <tbody>${STATE.products.map((p) => `<tr>
        <td>${p.images[0] ? `<img class="prod-thumb" src="${esc(p.images[0].path)}" alt="">` : '<span class="prod-thumb" style="display:inline-flex;align-items:center;justify-content:center;font-size:9px;color:#8A6A52">PH</span>'}</td>
        <td><b>${esc(p.code)}</b>${p.demo ? ' <span class="badge-pill">demo</span>' : ''}${p.featured ? ' <span class="badge-pill">★ featured</span>' : ''}</td>
        <td>${p.price ? `<span class="badge-pill">${esc(p.price)}</span>` : '<span class="hint" style="font-size:10px">On request</span>'}</td>
        <td>${esc(p.name)}</td><td>${p.badge ? `<span class="badge-pill">${esc(p.badge)}</span>` : '—'}</td>
        <td>${esc(p.category_slug)}</td><td>${esc(p.moq)}</td>
        <td><span class="status-pill ${p.status}">${esc(p.status)}</span></td>
        <td style="white-space:nowrap"><button class="abtn ghost small" data-edit-prod="${p.id}">✏️ Edit</button>
        <a class="abtn ghost small" href="/products/${esc(p.code)}" target="_blank">👁 View</a>
        <button class="abtn danger small" data-del-prod="${p.id}">🗑</button></td></tr>`).join('')}</tbody></table></div></div>`;
    $('#newProd').onclick = () => openProductEditor(null);
    $$('[data-edit-prod]').forEach((b) => b.onclick = () => openProductEditor(STATE.products.find((p) => p.id === Number(b.dataset.editProd))));
    $$('[data-del-prod]').forEach((b) => b.onclick = async () => {
      if (!confirm('Delete this product permanently?')) return;
      await api(`/api/admin/products/${b.dataset.delProd}`, { method: 'DELETE' }); toast('Product deleted.'); await refresh();
    });
  }

  function openProductEditor(p) {
    const isNew = !p;
    const d = p ? clone(p) : { code: '', name: '', badge: '', category_slug: '', material: '', size: '', moq: '', price: '', description: '', specs: [], price_on_request: true, featured: false, status: 'published', images: [] };
    if (p) { try { d.specs = JSON.parse(p.specs_json || '[]'); } catch { d.specs = []; } }
    const BADGES = ['Diwali Gifting', 'Occasion & Return Gifting', 'Corporate Gifting', 'Best Seller', 'New Arrival', 'None'];
    openModal(`<h3>${isNew ? '＋ Add New Product' : '✏️ Edit ' + esc(p.code)}</h3>
    <p class="hint">Fill the boxes exactly as they should appear on the product card. The live preview on the right updates as you type.</p>
    <div class="live-preview-zone">
      <div class="lp-col" style="flex:1.2">
        <div class="agrid two">
          ${field('Product Code *', input('code', d.code), 'e.g. MH-2017 — must be unique.')}
          ${field('Product Name *', input('name', d.name), 'e.g. Festive Diya & Tealight Hamper')}
          ${field('Top-Left Badge Text', `<select data-f="badge">${BADGES.map((b) => `<option${d.badge === b ? ' selected' : ''}>${b}</option>`).join('')}</select>`, 'Shows as a cream pill on the photo.')}
          ${field('Category', `<select data-f="category_slug"><option value="">— none —</option>${STATE.categories.map((cc) => `<option value="${esc(cc.slug)}"${d.category_slug === cc.slug ? ' selected' : ''}>${esc(cc.name)}</option>`).join('')}</select>`)}
          ${field('Card Line 1 — Material', input('material', d.material), 'e.g. Brass or Steel, Wood')}
          ${field('Card Line 2 — Size / Dimensions', input('size', d.size), 'e.g. Box 30 × 22 × 10 cm')}
          ${field('Card Line 3 — MOQ', input('moq', d.moq), 'e.g. 50 pcs')}
          ${field('Price Box — shown beside the code on every card, page, catalogue & spec sheet', input('price', d.price || ''), 'e.g. ₹1,249 / pc or ₹850–₹1,100. Leave empty and the pill shows “On request”.')}
          ${field('Status', `<select data-f="status"><option value="published"${d.status === 'published' ? ' selected' : ''}>Published (visible)</option><option value="draft"${d.status === 'draft' ? ' selected' : ''}>Draft (hidden)</option></select>`)}
        </div>
        ${field('Description (detail page)', area('description', d.description, 4))}
        <div class="switch-row"><input type="checkbox" class="switch" data-f="featured" ${d.featured ? 'checked' : ''}><span>Show in Homepage “Featured Products”</span></div>
        <div class="switch-row"><input type="checkbox" class="switch" data-f="price_on_request" ${d.price_on_request ? 'checked' : ''}><span>Price on Request (recommended for B2B)</span></div>
        <div class="group-title">Detailed Specifications Table</div>
        <div class="spec-rows" id="specRows"></div>
        <button class="abtn ghost small" id="addSpec" type="button">＋ Add specification row</button>
        <div class="group-title">Photos (up to 8) — drag & drop or click</div>
        <div class="uploader" id="prodUploader"><b>📷 Upload Real Photo</b><br><span class="hint">Square 1:1 crop is applied automatically. After upload, click on a photo to set the focal point.</span>
        <input type="file" id="prodFile" accept="image/*" multiple hidden></div>
        <div class="img-grid" id="imgGrid"></div>
        <div style="margin-top:16px;display:flex;gap:10px;justify-content:flex-end">
          <button class="abtn ghost" type="button" data-close-admin-modal>Cancel</button>
          <button class="abtn primary" id="prodSave">💾 Save Product</button></div>
      </div>
      <div class="lp-col">
        <h4>Live mobile card preview</h4>
        <div class="lp-phone"><div class="product-grid" id="lpCard"></div></div>
        <h4 style="margin-top:14px">Detail page preview</h4>
        <div class="acard" id="lpDetail" style="margin:0"></div>
      </div>
    </div>`);

    const form = $('#adminModalBody');
    const drawSpecs = () => { $('#specRows').innerHTML = d.specs.map((s, i) => `<div class="spec-row">
      <input value="${esc(s.k)}" data-spec-k="${i}" placeholder="Label (e.g. Finish)">
      <input value="${esc(s.v)}" data-spec-v="${i}" placeholder="Value">
      <button class="abtn danger small" data-spec-rm="${i}" type="button">✕</button></div>`).join('');
      $$('[data-spec-k]', form).forEach((el) => el.oninput = () => { d.specs[Number(el.dataset.specK)].k = el.value; preview(); });
      $$('[data-spec-v]', form).forEach((el) => el.oninput = () => { d.specs[Number(el.dataset.specV)].v = el.value; preview(); });
      $$('[data-spec-rm]', form).forEach((b) => b.onclick = () => { d.specs.splice(Number(b.dataset.specRm), 1); drawSpecs(); preview(); });
    };
    $('#addSpec').onclick = () => { d.specs.push({ k: '', v: '' }); drawSpecs(); };
    drawSpecs();

    const drawImgs = () => { $('#imgGrid').innerHTML = (d.images || []).map((im) => `<div class="img-cell">
      <img src="${esc(im.path)}" data-focal="${im.id}" style="object-position:${50 + ((im.focal_x || .5) - .5) * 100}% ${50 + ((im.focal_y || .5) - .5) * 100}%" alt="">
      <span class="focal-dot" style="left:${(im.focal_x || .5) * 100}%;top:${(im.focal_y || .5) * 100}%"></span>
      <button data-img-rm="${im.id}" type="button">✕</button>
      <span class="focal-hint">click photo = focal point</span></div>`).join('');
      $$('[data-focal]', form).forEach((img) => img.onclick = async (e) => {
        const r = img.getBoundingClientRect();
        const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const fy = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        const im = d.images.find((x) => x.id === Number(img.dataset.focal));
        im.focal_x = fx; im.focal_y = fy;
        await api(`/api/admin/images/${im.id}`, { method: 'PUT', json: { focal_x: fx, focal_y: fy } });
        drawImgs(); preview(); toast('Focal point updated.');
      });
      $$('[data-img-rm]', form).forEach((b) => b.onclick = async () => {
        await api(`/api/admin/images/${b.dataset.imgRm}`, { method: 'DELETE' });
        d.images = d.images.filter((x) => x.id !== Number(b.dataset.imgRm)); drawImgs(); preview();
      });
    };
    drawImgs();

    $('#prodUploader').onclick = () => $('#prodFile').click();
    ['dragover', 'dragleave', 'drop'].forEach((ev) => $('#prodUploader').addEventListener(ev, (e) => {
      e.preventDefault();
      $('#prodUploader').classList.toggle('dragover', ev === 'dragover');
      if (ev === 'drop' && e.dataTransfer.files.length) {
        $('#prodFile').files = e.dataTransfer.files;
        $('#prodFile').onchange({ target: $('#prodFile') });
      }
    }));
    $('#prodFile').onchange = async (e) => {
      const files = [...e.target.files].slice(0, 8 - (d.images || []).length);
      for (const f of files) {
        if (isNew) { toast('Save the product first, then upload photos.'); return; }
        const blob = await squareCrop(f, 0.5, 0.5);
        const fd = new FormData(); fd.append('file', blob, 'crop.webp'); fd.append('focal_x', '0.5'); fd.append('focal_y', '0.5');
        const r = await api(`/api/admin/products/${d.id}/images`, { method: 'POST', body: fd });
        d.images.push({ id: r.id, path: r.path, focal_x: 0.5, focal_y: 0.5 });
      }
      drawImgs(); preview(); toast('Photo uploaded ✔');
    };

    function preview() {
      const cur = readForm(form);
      const obj = Object.assign(clone(d), cur, { specs: d.specs, img: (d.images || [])[0] || null });
      $('#lpCard').innerHTML = miniCard(obj);
      $('#lpDetail').innerHTML = `<b>${esc(obj.code || 'CODE')}</b> · ${esc(obj.badge || 'no badge')}<br><strong style="font-family:Georgia,serif;font-size:18px">${esc(obj.name || 'Product name')}</strong>
        <p style="color:#66625B;font-size:12.5px">Material: ${esc(obj.material || '—')} · Size: ${esc(obj.size || '—')} · MOQ: ${esc(obj.moq || '—')}</p>
        <table style="width:100%;font-size:12px;border-collapse:collapse">${d.specs.filter((s) => s.k).map((s) => `<tr><td style="border-bottom:1px solid #eee;padding:4px;color:#5C3D2E;font-weight:600">${esc(s.k)}</td><td style="border-bottom:1px solid #eee;padding:4px">${esc(s.v)}</td></tr>`).join('')}</table>`;
    }
    form.addEventListener('input', preview);
    preview();

    $('#prodSave').onclick = async () => {
      const cur = readForm(form);
      const payload = Object.assign({}, d, cur, { specs: d.specs.filter((s) => s.k || s.v), featured: cur.featured === true || cur.featured === 'true', price_on_request: cur.price_on_request === true || cur.price_on_request === 'true' });
      if (payload.badge === 'None') payload.badge = '';
      try {
        if (isNew) { const r = await api('/api/admin/products', { method: 'POST', json: payload }); d.id = r.id; }
        else await api(`/api/admin/products/${d.id}`, { method: 'PUT', json: payload });
        window.__closeAdminModal(); toast('Product saved ✔'); await refresh();
      } catch (err) { toast(err.message); }
    };
  }

  /* client-side square crop around focal point before upload */
  function squareCrop(file, fx, fy) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = Math.max(0, Math.min(img.width - side, fx * img.width - side / 2));
        const sy = Math.max(0, Math.min(img.height - side, fy * img.height - side / 2));
        const canvas = document.createElement('canvas');
        canvas.width = 1200; canvas.height = 1200;
        canvas.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 1200, 1200);
        canvas.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('crop failed')); }, 'image/webp', 0.86);
      };
      img.onerror = reject;
      img.src = url;
    });
  }

  function miniCard(p) {
    const img = p.img ? `<img class="card-img" src="${esc(p.img.path)}" style="object-position:${50 + ((p.img.focal_x || .5) - .5) * 100}% ${50 + ((p.img.focal_y || .5) - .5) * 100}%">`
      : `<div class="ph-frame"><svg viewBox="0 0 200 200" class="ph-svg"><rect x="6" y="6" width="188" height="188" rx="14" fill="none" stroke="currentColor" stroke-width="1.4"/><text x="100" y="98" text-anchor="middle" font-family="Georgia,serif" font-size="16" fill="currentColor" stroke="none">${esc(p.code || 'CODE')}</text><text x="100" y="118" text-anchor="middle" font-size="8" fill="currentColor" stroke="none">PHOTO PENDING — UPLOAD IN ADMIN</text></svg></div>`;
    return `<article class="p-card"><div class="p-card-media">${p.badge && p.badge !== 'None' ? `<span class="card-badge">${esc(p.badge)}</span>` : ''}${img}</div>
      <div class="p-card-body"><div class="p-code-row"><p class="p-code">${esc(p.code || 'CODE')}</p><span class="p-price${p.price ? '' : ' on-req'}">${esc(p.price || 'On request')}</span></div><h3 class="p-title">${esc(p.name || 'Product name')}</h3>
      <div class="p-specs"><span class="spec-line">Material: ${esc(p.material || '—')}</span><span class="spec-line">Size: ${esc(p.size || '—')}</span><span class="spec-line">MOQ: ${esc(p.moq || '—')}</span></div></div>
      <div class="p-card-foot"><span class="btn btn-crimson btn-block">Send Enquiry</span></div></article>`;
  }

  /* ───────────── categories ───────────── */
  function sCategories(c) {
    c.innerHTML = `<div class="acard"><h3>Categories (${STATE.categories.length})</h3>
      <p class="hint">These power the homepage “Our Product Range” grid and the product page tabs.</p>
      <div id="catList">${STATE.categories.map((cat) => `<div class="agrid" data-cat-box="${cat.id}" style="border:1px dashed #cbbfa8;border-radius:12px;padding:12px;margin-bottom:10px">
        <div class="agrid two">
          ${field('Name', input('name', cat.name))}${field('Subtitle (materials line)', input('subtitle', cat.subtitle))}
          ${field('Sort order', input('sort', cat.sort, 'number'))}
          <label class="afield">Photo<input type="text" data-f="image" value="${esc(cat.image || '')}" placeholder="leave empty for placeholder"><input type="file" data-imgfor="image" data-folder="categories" accept="image/*,.jpg,.jpeg,.png,.webp,.gif,.avif,.heic" style="font-size:12px">${cat.image ? `<span style="display:flex;align-items:center;gap:10px;margin-top:6px"><img src="${esc(cat.image)}" alt="" style="width:64px;height:64px;object-fit:cover;border-radius:8px;border:1px solid #cbbfa8"><button type="button" class="abtn small" data-cat-img-clear="${cat.id}">Remove photo</button></span>` : ''}</label>
        </div>
        <div class="switch-row"><input type="checkbox" class="switch" data-f="visible" ${cat.visible ? 'checked' : ''}><span>Visible on website</span></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="abtn danger small" data-cat-del="${cat.id}">🗑 Delete</button>
        <button class="abtn primary small" data-cat-save="${cat.id}">💾 Save</button></div></div>`).join('')}</div>
      <button class="abtn primary" id="catAdd">＋ Add Category</button></div>`;
    $$('[data-cat-save]').forEach((b) => b.onclick = async () => {
      const wrap = b.closest('[data-cat-box]');
      const v = readForm(wrap);
      v.sort = Number(v.sort || 0);
      await api(`/api/admin/categories/${b.dataset.catSave}`, { method: 'PUT', json: v });
      toast('Category saved ✔'); await refresh();
    });
    $$('[data-cat-img-clear]').forEach((b) => b.onclick = async () => {
      const wrap = b.closest('[data-cat-box]'); const v = readForm(wrap); v.image = ''; v.sort = Number(v.sort || 0);
      await api(`/api/admin/categories/${b.dataset.catImgClear}`, { method: 'PUT', json: v });
      toast('Photo removed'); await refresh();
    });
    $$('[data-cat-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('Delete this category? Products keep their category code but the tab disappears.')) return;
      await api(`/api/admin/categories/${b.dataset.catDel}`, { method: 'DELETE' }); await refresh();
    });
    $$('[data-imgfor]', c).forEach(bindImagePick);
    $('#catAdd').onclick = async () => {
      const name = prompt('New category name (e.g. Garden & Outdoor):');
      if (!name) return;
      const sub = prompt('Short subtitle (e.g. Planters & brass garden accents):') || '';
      await api('/api/admin/categories', { method: 'POST', json: { name, subtitle: sub } });
      await refresh();
    };
  }

  /* ───────────── leads CRM ───────────── */
  function sLeads(c) {
    const statuses = ['New', 'Contacted', 'Quoted', 'Won', 'Closed'];
    c.innerHTML = `<div class="acard">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center">
        <h3>Leads Inbox (${STATE.leads.length})</h3>
        <div><a class="abtn ghost small" href="/api/admin/leads/export.csv">📥 Export to Excel/CSV</a></div>
      </div>
      <p class="hint">Every website enquiry, bulk list, catalogue request and WhatsApp click is stored here first — nothing is ever lost.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin:10px 0">${['All', ...statuses].map((s, i) => `<button class="abtn ${i === 0 ? 'primary' : 'ghost'} small" data-lead-filter="${s}">${s}</button>`).join('')}</div>
      <div id="leadList"></div></div>`;
    let filter = 'All';
    function draw() {
      const list = STATE.leads.filter((l) => filter === 'All' || l.status === filter);
      $('#leadList').innerHTML = list.map((l) => {
        let items = []; try { items = JSON.parse(l.items_json || '[]'); } catch { items = []; }
        return `<div class="lead-card status-${esc(l.status)}">
        <div class="lead-head"><div><b>${esc(l.name || '(no name)')}</b> ${l.company ? `· ${esc(l.company)}` : ''} <span class="badge-pill">${esc(l.type)}</span> <span class="status-pill ${l.status === 'New' ? 'draft' : 'published'}">${esc(l.status)}</span>
          <div class="lead-meta">${esc(l.created_at)} · ${esc(l.phone || '')} ${l.email ? '· ' + esc(l.email) : ''} ${l.city ? '· ' + esc(l.city) : ''}</div></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            <select data-lead-status="${l.id}" class="abtn ghost small">${statuses.map((s) => `<option${s === l.status ? ' selected' : ''}>${s}</option>`).join('')}</select>
            ${l.phone ? `<a class="abtn wa small" href="https://wa.me/${esc(String(l.phone).replace(/[^0-9]/g, ''))}" target="_blank" rel="noopener">💬 WhatsApp</a>` : ''}
            ${l.phone ? `<a class="abtn ghost small" href="tel:${esc(l.phone)}">📞 Call</a>` : ''}
            <button class="abtn danger small" data-lead-del="${l.id}">🗑</button>
          </div></div>
        ${l.message ? `<p style="margin:8px 0 0">${esc(l.message)}</p>` : ''}
        ${items.length ? `<div class="lead-items">${items.map((i) => `<span class="badge-pill">${esc(i)}</span>`).join('')}</div>` : ''}
        <div class="lead-notes">${(l.notes || []).map((n) => `<div>📝 ${esc(n.note)} <i>(${esc(n.created_at)})</i></div>`).join('')}
          <div style="display:flex;gap:8px;margin-top:6px"><input placeholder="Add internal note…" data-note-input="${l.id}" style="flex:1;border:1px solid #D9CBBB;border-radius:8px;padding:7px 10px">
          <button class="abtn ghost small" data-note-add="${l.id}">Add note</button></div></div>
      </div>`; }).join('') || '<p class="hint">No leads in this view.</p>';
      $$('[data-lead-status]').forEach((s) => s.onchange = async () => { await api(`/api/admin/leads/${s.dataset.leadStatus}`, { method: 'PUT', json: { status: s.value } }); await refresh(); });
      $$('[data-note-add]').forEach((b) => b.onclick = async () => {
        const inp = $(`[data-note-input="${b.dataset.noteAdd}"]`);
        if (!inp.value.trim()) return;
        await api(`/api/admin/leads/${b.dataset.noteAdd}/notes`, { method: 'POST', json: { note: inp.value } }); await refresh();
      });
      $$('[data-lead-del]').forEach((b) => b.onclick = async () => { if (confirm('Delete this lead?')) { await api(`/api/admin/leads/${b.dataset.leadDel}`, { method: 'DELETE' }); await refresh(); } });
    }
    $$('[data-lead-filter]').forEach((b) => b.onclick = () => {
      $$('[data-lead-filter]').forEach((x) => x.className = 'abtn ghost small');
      b.className = 'abtn primary small'; filter = b.dataset.leadFilter; draw();
    });
    draw();
  }

  /* ───────────── contact & whatsapp ───────────── */
  function sContact(c) {
    const ct = clone(STATE.settings.contact);
    const tpl = STATE.settings.whatsapp_template || '';
    c.innerHTML = `<div class="agrid two">
      <div class="acard"><h3>📞 Global Contact Details</h3>
        <p class="hint">Change once → updates Header, Contact page, Footer, Floating button and PDF spec sheets after Publish.</p>
        <div class="agrid">
          ${field('Phone', input('phone', ct.phone))}
          ${field('WhatsApp number (digits only, with country code)', input('whatsapp', ct.whatsapp), 'e.g. 918171246275')}
          ${field('Email 1 (Write to Us)', input('email1', ct.email1))}
          ${field('Email 2 (Ask MORA)', input('email2', ct.email2))}
          ${field('Address line', input('address', ct.address))}
          ${field('Google Maps link (“Open in Maps”)', input('mapLink', ct.mapLink))}
          ${field('Embedded map URL', input('mapEmbed', ct.mapEmbed), 'Must end with &output=embed')}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="abtn primary" id="ctSave">💾 Save Contact Details</button></div>
      </div>
      <div class="acard"><h3>💬 WhatsApp Message Template</h3>
        <p class="hint">Placeholders you can use: {name} {company} {product} {code}</p>
        <textarea id="waTpl" rows="6" style="width:100%;border:1px solid #D9CBBB;border-radius:10px;padding:10px">${esc(tpl)}</textarea>
        <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="abtn primary" id="waSave">💾 Save Template</button></div>
      </div></div>`;
    $('#ctSave').onclick = async () => {
      await api('/api/admin/settings/contact', { method: 'PUT', json: readForm(c) });
      toast('Contact details saved — press Publish to go live.'); renderTop();
    };
    $('#waSave').onclick = async () => {
      await api('/api/admin/settings/whatsapp_template', { method: 'PUT', json: $('#waTpl').value });
      toast('WhatsApp template saved — press Publish to go live.'); renderTop();
    };
  }

  /* ───────────── footer & social (audit M7/M8) ───────────── */
  function sFooter(c) {
    const ft = clone(STATE.settings.footer || {});
    const soc = ft.socials || {};
    const SOCIAL_FIELDS = [
      ['instagram', 'Instagram profile URL'], ['facebook', 'Facebook page URL'],
      ['linkedin', 'LinkedIn company URL'], ['youtube', 'YouTube channel URL'],
      ['indiamart', 'IndiaMART profile URL'], ['google_business', 'Google Business Profile URL'],
      ['whatsapp', 'WhatsApp link (optional — defaults to your WhatsApp number)'],
    ];
    const linkRows = (arr, tag) => (arr || []).map((l, i) => `<div class="spec-row"><input value="${esc(l.label)}" data-${tag}-l="${i}" placeholder="Label"><input value="${esc(l.url)}" data-${tag}-u="${i}" placeholder="/url"><button class="abtn danger small" type="button" data-${tag}-rm="${i}" aria-label="Remove">✕</button></div>`).join('');
    c.innerHTML = `<div class="agrid two">
      <div class="acard"><h3>🦶 Footer Text</h3>
        <p class="hint">Shown in the dark walnut footer on every page. Changes apply after <b>Publish</b>.</p>
        <div class="agrid">
          ${field('Tagline (under the crest)', input('tagline', ft.tagline || ''))}
          ${field('About blurb', area('about_blurb', ft.about_blurb || '', 3))}
          ${field('Catalogue card heading', input('catalogue_heading', ft.catalogue_heading || ''))}
          ${field('Catalogue card text', area('catalogue_text', ft.catalogue_text || '', 2))}
          ${field('Catalogue card button', input('catalogue_button', ft.catalogue_button || ''))}
          ${field('Registered business line (audit M8)', input('company_line', ft.company_line || ''), 'Recommended: “MORA HOME (Prop. …) · GSTIN: 09XXXXX…Z · Workshop address, Moradabad, UP” — builds export-buyer trust. Leave empty to hide.')}
          ${field('B2B disclaimer', area('disclaimer', ft.disclaimer || '', 2))}
        </div>
      </div>
      <div class="acard"><h3>🔗 Social Profiles (audit M7)</h3>
        <p class="hint">Paste full URLs (https://…). Icons appear in the footer only for the profiles you fill in — social proof matters for B2B buyers.</p>
        <div class="agrid">
          ${SOCIAL_FIELDS.map(([k, label]) => field(label, input('soc_' + k, soc[k] || ''), k === 'indiamart' || k === 'google_business' ? '' : '')).join('')}
        </div>
      </div>
      <div class="acard"><h3>Quick Links</h3>
        <div id="ftQuickRows">${linkRows(ft.quick_links, 'q')}</div>
        <button class="abtn ghost small" id="ftQuickAdd" type="button" style="margin-top:8px">＋ Add link</button>
      </div>
      <div class="acard"><h3>Legal Links</h3>
        <div id="ftLegalRows">${linkRows(ft.legal_links, 'g')}</div>
        <button class="abtn ghost small" id="ftLegalAdd" type="button" style="margin-top:8px">＋ Add link</button>
      </div>
    </div>
    <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="abtn primary" id="ftSave">💾 Save Footer (then Publish)</button></div>`;

    const addRow = (holder, tag) => {
      const d = document.createElement('div'); d.className = 'spec-row';
      d.innerHTML = `<input placeholder="Label"><input placeholder="/url"><button class="abtn danger small" type="button" aria-label="Remove">✕</button>`;
      d.querySelector('button').addEventListener('click', () => d.remove());
      $(holder).appendChild(d);
    };
    $('#ftQuickAdd').onclick = () => addRow('#ftQuickRows', 'q');
    $('#ftLegalAdd').onclick = () => addRow('#ftLegalRows', 'g');
    const bindRm = (sel) => $$(sel).forEach((b) => { b.onclick = () => b.closest('.spec-row').remove(); });
    bindRm('[data-q-rm]'); bindRm('[data-g-rm]');
    const readLinks = (holder, tag) => $$(`${holder} .spec-row`).map((r) => ({ label: r.children[0].value, url: r.children[1].value })).filter((l) => l.label || l.url);

    $('#ftSave').onclick = async () => {
      const form = readForm(c);
      const socials = {};
      SOCIAL_FIELDS.forEach(([k]) => { socials[k] = String(form['soc_' + k] || '').trim(); delete form['soc_' + k]; });
      const payload = Object.assign({}, ft, form, {
        socials,
        quick_links: readLinks('#ftQuickRows', 'q'),
        legal_links: readLinks('#ftLegalRows', 'g'),
      });
      await api('/api/admin/settings/footer', { method: 'PUT', json: payload });
      toast('Footer saved — press 🚀 Publish to make it live.'); renderTop();
    };
  }

  /* ───────────── seo & nav ───────────── */
  function sSeo(c) {
    const seo = clone(STATE.settings.seo); const nav = clone(STATE.settings.nav);
    c.innerHTML = `<div class="acard"><h3>🔍 Search Engine (SEO) Tags</h3>
      <div class="agrid two">
        ${field('Home title', input('home_title', seo.home_title))}${field('Home description', area('home_desc', seo.home_desc, 2))}
        ${field('Products title', input('products_title', seo.products_title))}${field('Products description', area('products_desc', seo.products_desc, 2))}
        ${field('About title', input('about_title', seo.about_title))}${field('About description', area('about_desc', seo.about_desc, 2))}
        ${field('Contact title', input('contact_title', seo.contact_title))}${field('Contact description', area('contact_desc', seo.contact_desc, 2))}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="abtn primary" id="seoSave">💾 Save SEO</button></div></div>
      <div class="acard"><h3>🧭 Header Navigation Links</h3>
      <div id="navRows">${nav.map((n, i) => `<div class="spec-row"><input value="${esc(n.label)}" data-nav-l="${i}" placeholder="Label"><input value="${esc(n.url)}" data-nav-u="${i}" placeholder="/url"><button class="abtn danger small" data-nav-rm="${i}">✕</button></div>`).join('')}</div>
      <div style="display:flex;gap:8px;margin-top:10px"><button class="abtn ghost small" id="navAdd">＋ Add link</button>
      <button class="abtn primary" id="navSave">💾 Save Navigation</button></div></div>`;
    const getNav = () => $$('#navRows .spec-row').map((r) => ({ label: r.children[0].value, url: r.children[1].value }));
    $('#navAdd').onclick = () => { const d = document.createElement('div'); d.className = 'spec-row'; d.innerHTML = `<input placeholder="Label"><input placeholder="/url"><button class="abtn danger small" type="button" aria-label="Remove link">✕</button>`; d.querySelector('button').addEventListener('click', () => d.remove()); $('#navRows').appendChild(d); };
    $$('[data-nav-rm]').forEach((b) => b.onclick = () => b.closest('.spec-row').remove());
    $('#navSave').onclick = async () => { await api('/api/admin/settings/nav', { method: 'PUT', json: getNav() }); toast('Navigation saved — Publish to go live.'); renderTop(); };
    $('#seoSave').onclick = async () => { await api('/api/admin/settings/seo', { method: 'PUT', json: readForm(c) }); toast('SEO saved — Publish to go live.'); renderTop(); };
  }

  /* ───────────── catalogue & pdf ───────────── */
  function sCatalogue(c) {
    const cat = STATE.settings.catalogue || {};
    const cov = STATE.settings.catalogue_cover || {};
    const wm = Object.assign({ enabled: true, logoPath: '', phone: '+91 8171246275', email: 'writemora@gmail.com', whatsapp: '918171246275', website: 'morahome.in', opacity: 13 }, STATE.settings.watermark || {});
    c.innerHTML = `<div class="agrid two">
      <div class="acard"><h3>🎨 Catalogue Cover Page (front of every PDF)</h3>
        <p class="hint">Your designed cover is placed as <b>page 1</b> of the auto-generated catalogue — the full catalogue <i>and</i> every per-range catalogue. Current cover: ${cov.path ? `<a href="${esc(cov.path)}" target="_blank">${esc(cov.path)}</a>` : '<b>none set</b> — the built-in generated cover is used instead.'} ${cov.note ? `<br><i>${esc(cov.note)}</i>` : ''}</p>
        <div class="uploader" id="covUp"><b>📤 Upload / replace cover page (PDF, A4)</b><input type="file" id="covFile" accept="application/pdf" hidden></div>
        ${cov.path ? '<button class="abtn danger" id="covRm" style="margin-top:10px">Remove cover (fall back to generated page 1)</button>' : ''}
      </div>
      <div class="acard"><h3>📄 Master Wholesale Catalogue PDF</h3>
        <p class="hint">Optional override for <b>/catalogue/latest</b>. If set, visitors download THIS file instead of the auto-generated one (your cover page is not added to it). Current file: ${cat.path ? `<a href="${esc(cat.path)}" target="_blank">${esc(cat.path)}</a>` : 'none — the auto-generated catalogue is served.'} ${cat.note ? `<br><i>${esc(cat.note)}</i>` : ''}</p>
        <div class="uploader" id="catUp"><b>📤 Upload master catalogue PDF</b><input type="file" id="catFile" accept="application/pdf" hidden></div>
      </div></div>
      <div class="agrid two" style="margin-top:18px">
      <div class="acard"><h3>🧺 Download Buttons Per Product Range</h3>
        <p class="hint">The Products page shows a download pill for <b>every category automatically</b> — add a category and its “Download catalogue” button appears with no extra work. Live links:</p>
        <ul>${STATE.categories.map((cc) => `<li><a href="/catalogue/latest?cat=${encodeURIComponent(cc.slug)}" target="_blank">${esc(cc.name)}</a> <span class="hint" style="font-size:10px">(/catalogue/latest?cat=${esc(cc.slug)})</span></li>`).join('') || '<li class="hint">No categories yet.</li>'}
        <li><a href="/catalogue/latest" target="_blank">All categories (full catalogue)</a></li></ul>
      </div>
      <div class="acard"><h3>🖨 Auto PDF Spec Sheets</h3>
        <p class="hint">Every product automatically gets a printable A4 spec sheet with your logo, specs, price, MOQ and contact details — no setup needed.</p>
        <ul>${STATE.products.slice(0, 6).map((p) => `<li><a href="/products/${esc(p.code)}/spec-sheet" target="_blank">${esc(p.code)} — printable A4</a> · <a href="/products/${esc(p.code)}/spec-sheet.pdf" target="_blank">PDF</a></li>`).join('')}</ul>
      </div></div>
      <div class="agrid" style="margin-top:18px">
      <div class="acard"><h3>💧 Catalogue Watermark (every page of every PDF)</h3>
        <p class="hint">A tiled diagonal watermark — your logo + phone + email + website — is baked into <b>every page</b> of the Selected Products catalogue and the All Categories catalogue (≈ −30°, behind the products). It is part of the page itself, not a removable layer. These fields are also the <b>single source</b> for the phone / email / website printed in the catalogue header &amp; footer — change them here and the next downloaded PDF updates automatically, no Publish needed.</p>
        <div class="agrid three">
          ${field('Phone', input('wm_phone', wm.phone))}
          ${field('Email', input('wm_email', wm.email))}
          ${field('WhatsApp (digits, with country code)', input('wm_whatsapp', wm.whatsapp), 'e.g. 918171246275')}
          ${field('Website', input('wm_website', wm.website))}
          ${field(`Watermark opacity — <b id="wmOpVal">${wm.opacity}%</b>`, `<input type="range" min="5" max="25" step="1" value="${wm.opacity}" id="wmOpacity">`, '5 % (barely visible) → 25 % (strong). Default 13 %.')}
          <label class="switch-row" style="align-self:end"><input type="checkbox" class="switch" id="wmEnabled" ${wm.enabled ? 'checked' : ''}><span>Watermark ON</span></label>
        </div>
        <div class="agrid two" style="margin-top:12px">
          <div>
            <p class="hint" style="margin-bottom:6px">Watermark logo — currently: ${wm.logoPath ? `<a href="${esc(wm.logoPath)}" target="_blank">${esc(wm.logoPath)}</a>` : '<b>brand crest</b> (default)'}</p>
            <div class="uploader" id="wmLogoUp"><b>📤 Upload watermark logo (PNG, transparent background)</b><input type="file" id="wmLogoFile" accept="image/png,image/jpeg,image/webp" hidden></div>
            ${wm.logoPath ? '<button class="abtn danger small" id="wmLogoRm" style="margin-top:8px">Use brand crest again</button>' : ''}
          </div>
          <div style="display:flex;flex-direction:column;justify-content:flex-end;gap:8px">
            <button class="abtn primary" id="wmSave">💾 Save Watermark Settings</button>
            <p class="hint" style="margin:0">Saved settings apply to the <b>next</b> catalogue download immediately.</p>
          </div>
        </div>
      </div></div>`;
    $('#catUp').onclick = () => $('#catFile').click();
    $('#catFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      await api('/api/admin/catalogue', { method: 'POST', body: fd });
      toast('Catalogue uploaded ✔ (live immediately).'); await refresh();
    };
    $('#covUp').onclick = () => $('#covFile').click();
    $('#covFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      await api('/api/admin/catalogue-cover', { method: 'POST', body: fd });
      toast('Cover page updated ✔ (live in all catalogue PDFs).'); await refresh();
    };
    const rm = $('#covRm');
    if (rm) rm.onclick = async () => {
      if (!confirm('Remove your uploaded cover page? Catalogues will fall back to the generated page 1.')) return;
      await api('/api/admin/catalogue-cover', { method: 'DELETE' });
      toast('Cover removed.'); await refresh();
    };
    /* ── catalogue watermark ── */
    const op = $('#wmOpacity');
    if (op) op.addEventListener('input', () => { const v = $('#wmOpVal'); if (v) v.textContent = op.value + '%'; });
    $('#wmSave').onclick = async () => {
      await api('/api/admin/immediate/catalogue-watermark', {
        method: 'PUT',
        json: {
          enabled: $('#wmEnabled').checked,
          logoPath: wm.logoPath || '',
          phone: $('[data-f="wm_phone"]').value,
          email: $('[data-f="wm_email"]').value,
          whatsapp: $('[data-f="wm_whatsapp"]').value,
          website: $('[data-f="wm_website"]').value,
          opacity: Number($('#wmOpacity').value),
        },
      });
      toast('💧 Watermark saved — live in the next catalogue download.'); await refresh();
    };
    $('#wmLogoUp').onclick = () => $('#wmLogoFile').click();
    $('#wmLogoFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('file', f);
      await api('/api/admin/watermark-logo', { method: 'POST', body: fd });
      toast('Watermark logo updated ✔'); await refresh();
    };
    const wmRm = $('#wmLogoRm');
    if (wmRm) wmRm.onclick = async () => {
      await api('/api/admin/watermark-logo', { method: 'DELETE' });
      toast('Watermark logo reset to the brand crest.'); await refresh();
    };
  }

  /* ───────────── backup ───────────── */
  function sBackup(c) {
    c.innerHTML = `<div class="agrid two">
      <div class="acard"><h3>💾 Download Full Website Backup</h3>
        <p class="hint">One .zip with your entire database (products, leads, pages, theme) + all uploaded images.</p>
        <a class="abtn primary" href="/api/admin/backup.zip">💾 Download Full Website Backup (.zip)</a>
      </div>
      <div class="acard"><h3>♻️ Restore From Backup</h3>
        <p class="hint">Upload a backup .zip to restore. This replaces current data — download a fresh backup first if unsure!</p>
        <div class="uploader" id="resUp"><b>⬆️ Choose backup .zip</b><input type="file" id="resFile" accept=".zip" hidden></div>
      </div></div>`;
    $('#resUp').onclick = () => $('#resFile').click();
    $('#resFile').onchange = async (e) => {
      const f = e.target.files[0]; if (!f) return;
      if (!confirm('Restore will REPLACE current website data with the backup. Continue?')) return;
      const fd = new FormData(); fd.append('file', f);
      const r = await api('/api/admin/restore', { method: 'POST', body: fd });
      toast(`Restore complete (db: ${r.dbRestored ? 'yes' : 'no'}, files: ${r.files}). Reloading…`);
      setTimeout(() => location.reload(), 1200);
    };
  }

  /* ───────────── guide ───────────── */
  function sGuide(c) {
    c.innerHTML = `<div class="acard"><h3>📘 How to Use This Admin — plain-English checklists</h3>
      <div class="guide-step"><b>Uploading your logo</b><br>1. Open <i>Customize Design & Layout</i>. 2. In “Brand & Logo”, choose the crest image file from your computer. 3. Press <b>Publish</b> (top right). The header, footer and PDFs update everywhere.</div>
      <div class="guide-step"><b>Adding a product</b><br>1. Open <i>Products → ＋ Add New Product</i>. 2. Fill Code (like MH-2030), Name, Badge, Category, Material, Size, MOQ. 3. Click the photo box to upload real photos (they are cropped square automatically — click a photo to move the focal point). 4. Press <b>Save Product</b>. It appears on the website instantly.</div>
      <div class="guide-step"><b>Replacing demo products with yours</b><br>Open <i>Settings & Demo Data → 🗑 Clear All Demo Data</i>. Your own products stay; the six samples disappear.</div>
      <div class="guide-step"><b>Changing colours / fonts / roundness</b><br><i>Customize Design & Layout</i> → pick colours with the colour boxes, move the sliders, watch the live preview on the right (switch 📱/💻). Press <b>Publish</b>.</div>
      <div class="guide-step"><b>Rearranging the homepage</b><br><i>Homepage Section Builder</i>: drag the ⋮⋮ handle to reorder, flip the switch to hide a section, ✏️ to rewrite its texts. Press <b>Publish</b>.</div>
      <div class="guide-step"><b>Handling enquiries</b><br><i>Leads Inbox</i>: click 💬 WhatsApp or  Call to reply, change the status (New → Contacted → Quoted → Won), add private notes, and export everything to Excel any time.</div>
      <div class="guide-step"><b>Changing phone / WhatsApp / email</b><br><i>Contact & WhatsApp Manager</i> — edit once, Publish, and every button on the site updates.</div>
      <div class="guide-step"><b>Sleep well at night</b><br><i>Backup & Restore</i> → download the .zip weekly and keep it on your computer/Drive.</div>
    </div>`;
  }

  /* ───────────── settings & demo ───────────── */
  function sSettings(c) {
    const a = STATE.settings;
    c.innerHTML = `<div class="agrid two">
      <div class="acard"><h3>🔐 Admin Login</h3>
        <div class="agrid">${field('Username', input('user', a.admin_user || 'admin'))}
        ${field('Current password', input('current', '', 'password'))}
        ${field('New password (min 6 chars)', input('next', '', 'password'))}</div>
        <div style="display:flex;justify-content:flex-end;margin-top:10px"><button class="abtn primary" id="pwSave">💾 Update Login</button></div>
      </div>
      <div class="acard"><h3>🧪 Demo Data</h3>
        <p class="hint">Demo mode: <b>${a.demo_mode ? 'ON — sample products are showing' : 'OFF'}</b>. Sample products use branded MORA placeholders until you upload real photos.</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="abtn danger" id="demoClear">🗑️ Clear All Demo Data</button>
          <button class="abtn ghost" id="demoReseed">＋ Re-add Sample Demo Products</button>
        </div>
      </div>
      <div class="acard"><h3>🛠 System</h3>
        <p class="hint">Image optimisation (WebP via sharp): <b>${STATE.hasSharp ? 'enabled ✔' : 'not available — originals stored'}</b><br>
        Database: SQLite file <code>data/mora.db</code> (swap-ready for PostgreSQL).<br>Node server: <code>server.js</code> · Media folder: <code>data/uploads</code>.</p>
      </div>
    </div>`;
    $('#pwSave').onclick = async () => {
      try { await api('/api/admin/password', { method: 'POST', json: readForm(c) }); toast('Login updated ✔'); await refresh(); }
      catch (e) { toast(e.message); }
    };
    $('#demoClear').onclick = async () => {
      if (!confirm('Remove all sample demo products? Your own products are kept.')) return;
      const r = await api('/api/admin/demo/clear', { method: 'POST' });
      toast(`Removed ${r.removed} demo products.`); await refresh();
    };
    $('#demoReseed').onclick = async () => {
      const r = await api('/api/admin/demo/reseed', { method: 'POST' });
      toast(`Added ${r.added} sample products.`); await refresh();
    };
  }

  /* ───────────── boot ───────────── */
  (async () => {
    try {
      [STATE, SCHEMAS] = await Promise.all([api('/api/admin/state'), api('/api/admin/schemas')]);
      renderTop(); render();
    } catch (e) { toast(e.message); }
  })();
})();
