/* MORA HOME — public site interactions (vanilla ES6+). */
(function () {
  'use strict';
  /* config: CSP-friendly JSON island (no inline <script>), with window.MORA fallback */
  let M = window.MORA || {};
  try { const el = document.getElementById('moraConfig'); if (el) M = JSON.parse(el.textContent); } catch (e) { /* keep fallback */ }
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => { t.hidden = true; }, 2600);
  }

  /* ---------- mobile drawer (sidebar) ---------- */
  const navToggle = $('#navToggle'), drawer = $('#siteDrawer'), backdrop = $('#drawerBackdrop');
  function drawerOpen(open) {
    if (!drawer || !backdrop) return;
    if (open) { drawer.hidden = false; backdrop.hidden = false; }
    requestAnimationFrame(() => {
      drawer.classList.toggle('open', open);
      backdrop.classList.toggle('open', open);
    });
    document.body.classList.toggle('drawer-lock', open);
    if (navToggle) navToggle.setAttribute('aria-expanded', String(open));
    if (!open) setTimeout(() => {
      if (!drawer.classList.contains('open')) { drawer.hidden = true; backdrop.hidden = true; }
    }, 320);
  }
  if (navToggle) navToggle.addEventListener('click', () => drawerOpen(!drawer.classList.contains('open')));
  if (backdrop) backdrop.addEventListener('click', () => drawerOpen(false));
  const drawerCloseBtn = $('#drawerClose');
  if (drawerCloseBtn) drawerCloseBtn.addEventListener('click', () => drawerOpen(false));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') drawerOpen(false); });
  if (drawer) drawer.addEventListener('click', (e) => { if (e.target.closest('a')) drawerOpen(false); });

  /* ---------- hero slider ---------- */
  const slides = $$('.hero-slide'), dots = $$('.hero-dot');
  if (slides.length > 1) {
    let i = 0;
    const go = (n) => {
      slides[i].classList.remove('active'); dots[i] && dots[i].classList.remove('active');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('active'); dots[i] && dots[i].classList.add('active');
    };
    dots.forEach((d) => d.addEventListener('click', () => go(Number(d.dataset.slide))));
    setInterval(() => { if (!document.hidden) go(i + 1); }, 6500);
  }

  /* ---------- product gallery ---------- */
  $$('.gal-thumb').forEach((t) => t.addEventListener('click', () => {
    $$('.gal-thumb').forEach((x) => x.classList.remove('active'));
    $$('.gal-main').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $$('.gal-main')[Number(t.dataset.gal)].classList.add('active');
  }));

  /* ---------- enquiry list (bulk) ---------- */
  const LIST_KEY = 'moraEnqList';
  const getList = () => { try { return JSON.parse(localStorage.getItem(LIST_KEY) || '[]'); } catch { return []; } };
  const setList = (l) => { localStorage.setItem(LIST_KEY, JSON.stringify(l)); renderFab(); };
  function renderFab() {
    const fab = $('#enqFabCounter'); const l = getList();
    if (!fab) return;
    if (l.length) { fab.hidden = false; fab.textContent = ` ${l.length} in enquiry list`; }
    else fab.hidden = true;
  }
  function addToList(code) {
    const grid = $('#productGrid');
    let name = code;
    const src = window.__PRODUCTS__ || [];
    const found = src.find((p) => p.code === code);
    if (found) name = found.name;
    else {
      const card = grid && grid.querySelector(`[data-code="${code}"] .p-title`);
      if (card) name = card.textContent.trim();
    }
    const l = getList();
    if (!l.find((x) => x.code === code)) { l.push({ code, name }); setList(l); toast(`${code} added to your enquiry list`); }
    else toast(`${code} is already in your list`);
  }
  document.addEventListener('click', (e) => {
    const add = e.target.closest('[data-add-enquiry]');
    if (add) { e.preventDefault(); addToList(add.dataset.addEnquiry); }
    const fab = e.target.closest('#enqFabCounter, [data-open-list]');
    if (fab) openEnqList();
  });
  function openEnqList() {
    const body = $('#enqListBody'); const l = getList();
    body.innerHTML = l.length ? l.map((x) => `<div class="enq-list-item"><span><b>${esc(x.code)}</b> — ${esc(x.name)}</span><button data-rm="${esc(x.code)}" type="button">Remove</button></div>`).join('')
      : '<p style="color:var(--text-muted)">Your list is empty. Tap the + icon on any product card to shortlist it.</p>';
    openModal('enqListModal');
  }
  document.addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { setList(getList().filter((x) => x.code !== rm.dataset.rm)); openEnqList(); }
  });
  $('#enqListClear') && $('#enqListClear').addEventListener('click', () => { setList([]); openEnqList(); });
  $('#enqListSend') && $('#enqListSend').addEventListener('click', () => {
    closeModal('enqListModal');
    openEnquiry({ code: '', name: '' }, getList());
  });

  /* ---------- selected-products catalogue (v8.3) ----------
     Selection lives in localStorage so it survives page/category changes.
     The ✓ button on each card toggles selection; the + button above it keeps
     its original Enquiry-List behaviour (untouched). */
  const SEL_KEY = 'moraSelectedProducts';
  const getSel = () => { try { const v = JSON.parse(localStorage.getItem(SEL_KEY) || '[]'); return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []; } catch { return []; } };
  const setSel = (l) => { localStorage.setItem(SEL_KEY, JSON.stringify(l)); };

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 4000);
  }

  /* sticky "X selected | Clear | Download PDF" bar (above the WhatsApp dock) */
  const selBar = document.createElement('div');
  selBar.id = 'selectBar';
  selBar.className = 'select-bar';
  selBar.hidden = true;
  selBar.innerHTML = '<span class="sel-count" id="selCount">0 selected</span>'
    + '<button type="button" class="sel-clear" id="selClear">Clear</button>'
    + '<button type="button" class="sel-download" id="selDownload">Download PDF</button>';
  document.body.appendChild(selBar);

  function refreshSelectionUi() {
    const sel = getSel();
    $$('[data-select-code]').forEach((b) => {
      const on = sel.includes(b.dataset.selectCode);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      const card = b.closest('.p-card');
      if (card) card.classList.toggle('p-card-selected', on);
    });
    selBar.hidden = !sel.length;
    document.body.classList.toggle('has-selbar', !!sel.length);
    const cnt = $('#selCount');
    if (cnt) cnt.textContent = `${sel.length} selected`;
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-select-code]');
    if (!b) return;
    const code = b.dataset.selectCode;
    let sel = getSel();
    if (sel.includes(code)) { sel = sel.filter((c) => c !== code); toast(`${code} removed from selection`); }
    else { sel.push(code); toast(`${code} selected for your catalogue`); }
    setSel(sel);
    refreshSelectionUi();
  });
  $('#selClear').addEventListener('click', () => { setSel([]); refreshSelectionUi(); toast('Selection cleared.'); });
  $('#selDownload').addEventListener('click', async () => {
    const codes = getSel();
    if (!codes.length) { toast('No products selected yet.'); return; }
    const btn = $('#selDownload');
    const old = btn.textContent;
    btn.textContent = 'Downloading…'; btn.disabled = true;
    try {
      const r = await fetch('/api/selected-catalogue', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes }),
      });
      if (!r.ok) {
        let m = ''; try { m = (await r.json()).error || ''; } catch (err) { /* non-JSON */ }
        throw new Error(m || 'Could not build the PDF — please try again.');
      }
      saveBlob(await r.blob(), 'MORA-HOME-Selected-Catalogue.pdf');
      toast('✔ Your selected catalogue is downloading.');
    } catch (err) {
      toast((err && err.message) || 'Download failed — please try again.');
    } finally {
      btn.textContent = old; btn.disabled = false;
    }
  });

  /* ---------- one-tap PDF catalogue downloads (v8.3) ----------
     Fetch as blob + programmatic <a download> so a single tap saves the file
     instead of navigating to / opening the PDF viewer (mobile Chrome fix).
     href + download attribute remain as the no-JS fallback. */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-catalogue-download]');
    if (!link) return;
    e.preventDefault();
    if (link.classList.contains('is-loading')) return;
    const href = link.getAttribute('href');
    const fname = link.getAttribute('download') || 'MORA-HOME-Catalogue.pdf';
    const label = link.querySelector('span') || link;
    const oldHtml = label.innerHTML;
    label.textContent = 'Downloading…';
    link.classList.add('is-loading');
    link.setAttribute('aria-busy', 'true');
    fetch(href, { credentials: 'same-origin' })
      .then((r) => {
        const ct = r.headers.get('content-type') || '';
        if (!r.ok || ct.indexOf('pdf') === -1) throw new Error(r.ok ? 'Unexpected response — please try again.' : `Catalogue unavailable (HTTP ${r.status}).`);
        return r.blob();
      })
      .then((blob) => { saveBlob(blob, fname); toast('✔ Catalogue download started.'); })
      .catch((err) => { toast((err && err.message) || 'Download failed — please try again.'); })
      .finally(() => {
        label.innerHTML = oldHtml;
        link.classList.remove('is-loading');
        link.removeAttribute('aria-busy');
      });
  });

  /* ---------- selection mode (?select=1 from the sidebar button) ---------- */
  if ($('#productGrid') && new URLSearchParams(location.search).has('select')) {
    const hint = document.createElement('div');
    hint.className = 'select-hint';
    hint.setAttribute('role', 'status');
    hint.innerHTML = '<b>Selection mode:</b> tap the ✓ button on products to select them — then use the bottom bar to download your custom PDF catalogue.';
    const gridEl = $('#productGrid');
    gridEl.parentNode.insertBefore(hint, gridEl);
    setTimeout(() => {
      const y = gridEl.getBoundingClientRect().top + window.scrollY - 150;
      window.scrollTo({ top: Math.max(y, 0), behavior: 'smooth' });
    }, 150);
  }

  /* ---------- modals ---------- */
  function openModal(id) { const m = $('#' + id); if (m) { m.hidden = false; document.body.style.overflow = 'hidden'; hideDock(true); } }
  function closeModal(id) { const m = $('#' + id); if (m) { m.hidden = true; document.body.style.overflow = ''; hideDock(false); } }
  document.addEventListener('click', (e) => {
    const x = e.target.closest('[data-close-modal]');
    if (x) closeModal(x.dataset.closeModal);
    if (e.target.classList.contains('modal-backdrop')) closeModal(e.target.id);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') $$('.modal-backdrop').forEach((m) => { if (!m.hidden) closeModal(m.id); }); });

  /* ---------- enquiry modal ---------- */
  let enqItems = [];
  let enqProductCode = '';
  function openEnquiry(product, items) {
    enqItems = items || [];
    enqProductCode = (product && product.code) || '';
    const chip = $('#enqChip'); const listChip = $('#enqListChip');
    if (enqProductCode) { chip.hidden = false; chip.innerHTML = `Enquiring about: <b>${esc(product.code)}</b> — ${esc(product.name)}`; }
    else chip.hidden = true;
    if (enqItems.length) { listChip.hidden = false; listChip.innerHTML = `Bulk list attached: ${enqItems.map((i) => esc(i.code)).join(', ')}`; }
    else listChip.hidden = true;
    openModal('enquiryModal');
  }
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.enquiry-open');
    if (btn) openEnquiry({ code: btn.dataset.code || '', name: btn.dataset.name || '' }, []);
  });
  const enqForm = $('#enquiryForm');
  enqForm && enqForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(enqForm);
    const payload = Object.fromEntries(f.entries());
    if (!payload.name || !payload.phone) { toast('Please fill your name and phone number.'); return; }
    payload.type = 'enquiry';
    payload.items = enqItems.length ? enqItems.map((i) => i.code) : (enqProductCode ? [enqProductCode] : []);
    if (enqProductCode) payload.message = `[Product: ${enqProductCode}] ` + (payload.message || '');
    try {
      const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) {
        let msg = '';
        try { const j = await r.json(); msg = (j && j.error) || ''; } catch (err) { /* non-JSON */ }
        throw new Error(msg || 'Could not save the enquiry — please try WhatsApp.');
      }
      closeModal('enquiryModal'); enqForm.reset();
      if (enqItems.length) { setList([]); }
      toast('✔ Enquiry saved! Our team will reply within one working day.');
    } catch (err) { toast((err && err.message) || 'Could not save the enquiry — please try WhatsApp.'); }
  });

  /* ---------- inline quick enquiry (contact section) ---------- */
  const inline = $('#inlineEnquiryForm');
  inline && inline.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(inline); const payload = Object.fromEntries(f.entries());
    if (!payload.name || !payload.phone) { toast('Please fill your name and phone number.'); return; }
    payload.type = 'enquiry'; payload.source = 'contact-form';
    const r = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    if (r.ok) { inline.reset(); toast('✔ Thank you! Your requirement has been saved.'); }
    else {
      let msg = '';
      try { const j = await r.json(); msg = (j && j.error) || ''; } catch (err) { /* non-JSON */ }
      toast(msg || 'Could not save the enquiry — please try WhatsApp.');
    }
  });

  /* ---------- WhatsApp modal ---------- */
  const waPreview = $('#waPreview');
  let waFound = null;          // { code, name, description, price } from /api/product-lookup
  let waLookupTimer = null;
  function waLookup(raw) {
    const chip = $('#waLookupChip');
    const code = norm(raw);
    if (code.length < 2) { waFound = null; if (chip) chip.hidden = true; return; }
    clearTimeout(waLookupTimer);
    waLookupTimer = setTimeout(async () => {
      try {
        const r = await fetch('/api/product-lookup?code=' + encodeURIComponent(code));
        if (!r.ok) { waFound = null; if (chip) chip.hidden = true; return; }
        waFound = await r.json();
        if (chip) {
          chip.hidden = false;
          chip.textContent = `✔ ${waFound.name} (${waFound.code})${waFound.price ? ' · ' + waFound.price : ''} — details will be added to your message`;
        }
      } catch (e) { waFound = null; if (chip) chip.hidden = true; }
      fillWaPreview(waForm);
    }, 300);
  }
  function fillWaPreview(form) {
    if (!form || !waPreview) return;
    const f = new FormData(form);
    const tpl = M.waTemplate || 'Hello MORA HOME! I am {name} from {company}. I am interested in {product} (Code: {code}). Please share wholesale pricing and MOQ details.';
    const rawProduct = f.get('product') || '';
    const productLabel = waFound ? `${waFound.name} (${waFound.code})` : rawProduct;
    let msg = tpl
      .replace('{name}', f.get('name') || '…').replace('{company}', f.get('company') || '—')
      .replace('{product}', productLabel || 'your products').replace('{code}', waFound ? waFound.code : ((rawProduct || '').match(/[A-Z]{2}-?\d+/i) || [])[0] || '—');
    /* auto-append the product description when a valid code was entered */
    if (waFound && waFound.description) msg += `\n\nProduct details — ${waFound.name} (${waFound.code}): ${waFound.description}`;
    waPreview.value = msg;
  }
  const waForm = $('#waForm');
  const waProductInput = $('#waProductInput');
  waProductInput && waProductInput.addEventListener('input', () => waLookup(waProductInput.value));
  document.addEventListener('click', (e) => {
    const w = e.target.closest('.wa-open, #dockWhatsapp');
    if (w && waForm) {
      const prod = w.dataset && w.dataset.product;
      if (prod) waForm.elements.product.value = prod;
      fillWaPreview(waForm);
      openModal('whatsappModal');
    }
  });
  waForm && waForm.addEventListener('input', () => fillWaPreview(waForm));
  waForm && waForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(waForm);
    if (!f.get('name')) { toast('Please tell us your name first.'); return; }
    await fetch('/api/track/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.get('name'), company: f.get('company'), product: f.get('product'), website: f.get('website') }) });
    const url = `https://wa.me/${M.whatsapp || '918171246275'}?text=${encodeURIComponent(waPreview.value)}`;
    window.open(url, '_blank', 'noopener');
    closeModal('whatsappModal');
    toast('Opening WhatsApp…');
  });

  /* ---------- catalogue request ---------- */
  $$('.catalogue-request').forEach((b) => b.addEventListener('click', () => {
    openEnquiry({ code: '', name: '' }, []);
    const msg = $('#enquiryForm').elements.message;
    msg.value = 'Please send me the latest MORA HOME wholesale catalogue (PDF) with price list.';
  }));

  /* ---------- floating dock collision control ---------- */
  const dock = $('#floatDock');
  let dockForceHide = false, dockFormHide = false;
  function hideDock(force) { dockForceHide = force; updateDock(); }
  function updateDock() { if (dock) dock.classList.toggle('dock-hidden', dockForceHide || dockFormHide); }
  const inlineTarget = $('.inline-enquiry');
  if (inlineTarget && 'IntersectionObserver' in window) {
    new IntersectionObserver((ents) => {
      dockFormHide = ents.some((en) => en.isIntersecting);
      updateDock();
    }, { threshold: 0.25 }).observe(inlineTarget);
  }

  /* ---------- products page live engine ---------- */
  const grid = $('#productGrid');
  if (grid) {
    let PRODUCTS = [];
    try { PRODUCTS = JSON.parse($('#productsJson').textContent); } catch { PRODUCTS = []; }
    window.__PRODUCTS__ = PRODUCTS;
    const badges = [...new Set(PRODUCTS.map((p) => p.badge).filter(Boolean))];
    const badgeSelect = $('#badgeSelect');
    badges.forEach((b) => { const o = document.createElement('option'); o.value = b; o.textContent = b; badgeSelect.appendChild(o); });

    /* material filter pills (built from the products' own Material text, e.g. "Brass, Steel") */
    const matTokens = (str) => String(str || '').split(/\s*(?:,|&|\/|\+|\band\b)\s*/i).map((x) => x.trim()).filter(Boolean);
    const materials = [];
    PRODUCTS.forEach((p) => matTokens(p.material).forEach((m) => {
      const label = m.charAt(0).toUpperCase() + m.slice(1).toLowerCase();
      if (!materials.includes(label)) materials.push(label);
    }));
    materials.sort();
    const matBox = $('#materialPills');
    if (matBox) {
      if (!materials.length) $('#materialGroup').hidden = true;
      matBox.innerHTML = '<button type="button" class="pill active" data-material="">Any</button>' +
        materials.map((m) => `<button type="button" class="pill" data-material="${esc(m.toLowerCase())}">${esc(m)}</button>`).join('');
    }
    const setMatUi = () => $$('.pill', matBox).forEach((x) => x.classList.toggle('active', x.dataset.material === state.material));

    const urlParams = new URLSearchParams(location.search);
    const state = { q: urlParams.get('q') || '', cat: urlParams.get('cat') || '', sort: 'new', badge: '', moq: '', material: '', featured: false };
    const prodSearch = $('#prodSearch');
    if (prodSearch && state.q) prodSearch.value = state.q;

    const phSvg = (code) => `<div class="ph-frame"><svg viewBox="0 0 200 200" class="ph-svg"><rect x="6" y="6" width="188" height="188" rx="14" fill="none" stroke="currentColor" stroke-width="1.4"/><rect x="14" y="14" width="172" height="172" rx="10" fill="none" stroke="currentColor" stroke-width=".8" stroke-dasharray="3 4"/><g fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M100 46c-16 12-24 25-24 39 0 16 11 28 24 35 13-7 24-19 24-35 0-14-8-27-24-39z"/><path d="M100 66c-7.5 6.5-11.5 13-11.5 19.5 0 8 4.8 14 11.5 18.3 6.7-4.3 11.5-10.3 11.5-18.3 0-6.5-4-13-11.5-19.5z"/><circle cx="100" cy="38" r="2.4" fill="currentColor" stroke="none"/></g><text x="100" y="146" text-anchor="middle" font-family="Georgia,serif" font-size="17" letter-spacing="2" fill="currentColor" stroke="none">${esc(code)}</text><text x="100" y="163" text-anchor="middle" font-family="Verdana,sans-serif" font-size="7.4" letter-spacing="1" fill="currentColor" stroke="none" opacity=".8">PHOTO PENDING — UPLOAD IN ADMIN</text></svg></div>`;

    function cardHtml(p) {
      const img = p.img
        ? `<img class="card-img" src="${esc(p.img.path)}" alt="${esc(p.name)}" width="1200" height="1200" loading="lazy" style="object-position:${50 + ((p.img.focal_x || .5) - .5) * 100}% ${50 + ((p.img.focal_y || .5) - .5) * 100}%">`
        : phSvg(p.code);
      return `<article class="p-card" data-code="${esc(p.code)}">
        <div class="p-card-media">
          ${p.badge ? `<span class="card-badge">${esc(p.badge)}</span>` : ''}
          <button class="card-quick-add" type="button" data-add-enquiry="${esc(p.code)}" title="Add to Enquiry List" aria-label="Add to enquiry list"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 5v14M5 12h14"/></svg></button>
          <button class="card-select" type="button" data-select-code="${esc(p.code)}" aria-pressed="false" title="Select for Selected Catalogue" aria-label="Select for selected-products catalogue"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
          <a class="card-media-link" href="/products/${encodeURIComponent(p.code)}">${img}</a>
        </div>
        <div class="p-card-body">
          <div class="p-code-row">
            <p class="p-code">${esc(p.code)}</p>
            <span class="p-price${p.price ? '' : ' on-req'}">${esc(p.price || 'On request')}</span>
          </div>
          <h3 class="p-title"><a href="/products/${encodeURIComponent(p.code)}">${esc(p.name)}</a></h3>
          <div class="p-specs">
            <span class="spec-line">Material: ${esc(p.material || '—')}</span>
            <span class="spec-line">Size: ${esc(p.size || '—')}</span>
            <span class="spec-line">MOQ: ${esc(p.moq || '—')}</span>
          </div>
        </div>
        <div class="p-card-foot"><button class="btn btn-crimson btn-block enquiry-open" type="button" data-code="${esc(p.code)}" data-name="${esc(p.name)}">Send Enquiry</button></div>
      </article>`;
    }

    function apply() {
      const qn = norm(state.q);
      let list = PRODUCTS.filter((p) => {
        if (state.cat && p.cat !== state.cat) return false;
        if (state.badge && p.badge !== state.badge) return false;
        if (state.moq && parseInt(p.moq, 10) > parseInt(state.moq, 10)) return false;
        if (state.material && !matTokens(p.material).some((m) => m.toLowerCase() === state.material)) return false;
        if (state.featured && !Number(p.featured)) return false;
        if (qn) {
          const code = norm(p.code), name = p.name.toUpperCase();
          if (!code.includes(qn) && !norm(p.name).includes(qn) && !name.includes(state.q.toUpperCase())) return false;
        }
        return true;
      });
      const moqNum = (p) => parseInt(String(p.moq).replace(/\D/g, ''), 10) || 99999;
      if (state.sort === 'code') list.sort((a, b) => a.code.localeCompare(b.code));
      if (state.sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name));
      if (state.sort === 'moq') list.sort((a, b) => moqNum(a) - moqNum(b));
      if (state.sort === 'new') list.sort((a, b) => (b.created || '').localeCompare(a.created || ''));
      grid.innerHTML = list.map(cardHtml).join('');
      $('#emptyState').hidden = list.length !== 0;
      $('#resultsCounter').textContent = `Showing ${list.length} of ${PRODUCTS.length} products`;
      const chips = [];
      if (state.cat) chips.push(['cat', `Category: ${$('.cat-tab.active') ? $('.cat-tab.active').textContent : state.cat}`]);
      if (state.badge) chips.push(['badge', `Badge: ${state.badge}`]);
      if (state.moq) chips.push(['moq', `MOQ ≤ ${state.moq}`]);
      if (state.material) chips.push(['material', `Material: ${state.material.charAt(0).toUpperCase() + state.material.slice(1)}`]);
      if (state.featured) chips.push(['featured', 'Top picks']);
      if (state.q) chips.push(['q', `Search: “${state.q}”`]);
      const nAct = (state.badge ? 1 : 0) + (state.moq ? 1 : 0) + (state.material ? 1 : 0) + (state.featured ? 1 : 0) + (state.sort !== 'new' ? 1 : 0);
      const cnt = $('#fsCount'); if (cnt) { cnt.textContent = nAct; cnt.hidden = !nAct; }
      const ap = $('#filterApply'); if (ap) ap.textContent = list.length ? `Show ${list.length} product${list.length === 1 ? '' : 's'}` : 'No products match';
      $('#filterChips').innerHTML = chips.map(([k, l]) => `<span class="chip">${esc(l)}<button data-chip="${k}" type="button" aria-label="Clear filter">✕</button></span>`).join('');
      refreshSelectionUi();   // re-apply ✓ selection state after every grid re-render
    }

    $('#prodSearch').addEventListener('input', (e) => { state.q = e.target.value; apply(); });
    $$('.cat-tab').forEach((t) => t.addEventListener('click', () => {
      $$('.cat-tab').forEach((x) => x.classList.remove('active'));
      t.classList.add('active'); state.cat = t.dataset.cat; apply();
    }));
    /* floating filter panel — fixed to the screen, so it opens right where you are scrolled */
    const drawer = $('#filterDrawer'), fsBtn = $('#filterSortBtn');
    document.body.appendChild(drawer);
    function fsOpen(open) {
      drawer.hidden = !open;
      fsBtn.setAttribute('aria-expanded', String(open));
      document.documentElement.classList.toggle('fs-lock', open);
      if (open) { const c = $('#filterClose'); if (c) c.focus(); } else { fsBtn.focus({ preventScroll: true }); }
    }
    fsBtn.addEventListener('click', () => fsOpen(drawer.hidden));
    $('#filterClose').addEventListener('click', () => fsOpen(false));
    $('#filterBackdrop').addEventListener('click', () => fsOpen(false));
    $('#filterApply').addEventListener('click', () => fsOpen(false));
    document.addEventListener('keydown', (e) => {
      if (drawer.hidden) return;
      if (e.key === 'Escape') { fsOpen(false); return; }
      if (e.key === 'Tab') {
        const f = $$('button, select, input', drawer).filter((x) => !x.disabled && x.offsetParent !== null);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    if (matBox) matBox.addEventListener('click', (e) => {
      const b = e.target.closest('.pill'); if (!b) return;
      state.material = b.dataset.material; setMatUi(); apply();
    });
    $('#featuredToggle').addEventListener('change', (e) => { state.featured = e.target.checked; apply(); });
    $('#sortSelect').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
    $('#badgeSelect').addEventListener('change', (e) => { state.badge = e.target.value; apply(); });
    $('#moqSelect').addEventListener('change', (e) => { state.moq = e.target.value; apply(); });
    function clearAll() {
      state.q = ''; state.cat = ''; state.badge = ''; state.moq = ''; state.sort = 'new'; state.material = ''; state.featured = false;
      $('#featuredToggle').checked = false; setMatUi();
      $('#prodSearch').value = ''; $('#sortSelect').value = 'new'; $('#badgeSelect').value = ''; $('#moqSelect').value = '';
      $$('.cat-tab').forEach((x) => x.classList.toggle('active', x.dataset.cat === ''));
      apply();
    }
    $('#clearFilters').addEventListener('click', clearAll);
    $('#emptyClear').addEventListener('click', clearAll);
    document.addEventListener('click', (e) => {
      const c = e.target.closest('[data-chip]');
      if (!c) return;
      const k = c.dataset.chip;
      if (k === 'q') { state.q = ''; $('#prodSearch').value = ''; }
      if (k === 'cat') { state.cat = ''; $$('.cat-tab').forEach((x) => x.classList.toggle('active', x.dataset.cat === '')); }
      if (k === 'badge') { state.badge = ''; $('#badgeSelect').value = ''; }
      if (k === 'moq') { state.moq = ''; $('#moqSelect').value = ''; }
      if (k === 'material') { state.material = ''; setMatUi(); }
      if (k === 'featured') { state.featured = false; $('#featuredToggle').checked = false; }
      apply();
    });
    apply();
  }

  renderFab();
  refreshSelectionUi();
})();
/* ═══ v7.2 ADD-ON — removes the extra 3-line icon button from the top bar ═══ */
(function () {
  function clean() {
    document.querySelectorAll('.site-header button, .site-header a').forEach(function (el) {
      if (el.querySelector('img')) return;                        // keep the logo
      var t = (el.textContent || '').trim();
      if (t !== '' && t !== '\u2261' && t !== '\u2630') return;   // keep buttons with words
      var cs = getComputedStyle(el);
      var bw = parseFloat(cs.borderTopWidth) || 0;
      if (bw > 0 && cs.borderTopStyle !== 'none') el.style.display = 'none';  // outlined + icon-only = the extra one
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', clean);
  else clean();
  setTimeout(clean, 600);
  setTimeout(clean, 1800);
})();
