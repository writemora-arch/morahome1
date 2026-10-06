/* MORA HOME — public site JS (vanilla, no dependencies) */
(function () {
  'use strict';
  const $ = (s, c) => (c || document).querySelector(s);
  const $$ = (s, c) => Array.from((c || document).querySelectorAll(s));
  const CFG = window.MORA_CONFIG || {};
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inr = (n) => (!n || isNaN(+n) || +n <= 0) ? 'Price on Request' : '₹' + (+n).toLocaleString('en-IN');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function track(name, data) {
    try { window.gtag && gtag('event', name, data || {}); } catch (e) { }
    try { window.fbq && fbq('trackCustom', name, data || {}); } catch (e) { }
  }

  /* ---------- toast ---------- */
  let toastT;
  function toast(msg) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ---------- drawer ---------- */
  const drawer = $('#drawer'), backdrop = $('.drawer-backdrop');
  function openDrawer() { drawer.hidden = false; backdrop.hidden = false; document.body.style.overflow = 'hidden'; $('.nav-toggle')?.setAttribute('aria-expanded', 'true'); drawer.querySelector('a,button,input')?.focus(); }
  function closeDrawer() { drawer.hidden = true; backdrop.hidden = true; document.body.style.overflow = ''; $('.nav-toggle')?.setAttribute('aria-expanded', 'false'); }
  $('.nav-toggle')?.addEventListener('click', openDrawer);
  $('.drawer-close')?.addEventListener('click', closeDrawer);
  backdrop?.addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeWa(); closeLb(); } });

  /* ---------- hero slider ---------- */
  $$('.hero').forEach(hero => {
    const slides = $$('.hero-slide', hero);
    if (slides.length < 2) return;
    const dots = $$('.hero-dots button', hero);
    let i = 0, timer = null;
    const show = (n) => {
      slides[i].classList.remove('is-on'); dots[i]?.setAttribute('aria-selected', 'false');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('is-on'); dots[i]?.setAttribute('aria-selected', 'true');
    };
    dots.forEach((d, n) => d.addEventListener('click', () => { show(n); restart(); }));
    const auto = +hero.dataset.autoplay || 0;
    const start = () => { if (auto && !reduceMotion) timer = setInterval(() => show(i + 1), auto); };
    const stop = () => clearInterval(timer);
    const restart = () => { stop(); start(); };
    if (hero.dataset.pause !== 'false') { hero.addEventListener('mouseenter', stop); hero.addEventListener('mouseleave', start); }
    start();
  });

  /* ---------- WhatsApp flow ---------- */
  const waModal = $('#wa-modal');
  let waCtx = { context: 'page', code: '', product: '', source: location.pathname };
  function openWa(data) {
    waCtx = { ...waCtx, ...(data || {}) };
    waModal.hidden = false; document.body.style.overflow = 'hidden';
    setTimeout(() => $('#wa-name')?.focus(), 30);
    track('whatsapp_open', { context: waCtx.context });
  }
  function closeWa() { if (waModal && !waModal.hidden) { waModal.hidden = true; document.body.style.overflow = ''; } }
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-wa-open]');
    if (btn) { e.preventDefault(); openWa({ context: btn.dataset.waContext || 'page', code: btn.dataset.code || '', product: btn.dataset.product || '' }); }
    if (e.target.closest('.wa-close') || e.target === waModal) closeWa();
  });
  $('#wa-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const name = $('#wa-name').value.trim(), business = $('#wa-biz').value.trim();
    if (!name) { $('#wa-name').classList.add('invalid'); $('#wa-name').focus(); return; }
    const t = CFG.wa || {};
    const biz = business ? ` from ${business}` : '';
    let msg = (waCtx.code && t.productMessageTemplate ? t.productMessageTemplate : t.messageTemplate || 'Hello MORA HOME, my name is {name}{business}. I would like to know more about your products.')
      .replace('{name}', name).replace('{business}', biz).replace('{product}', waCtx.product || '').replace('{code}', waCtx.code || '');
    const num = String(CFG.waNumber || '').replace(/\D/g, '').replace(/^0/, '').replace(/^(?!91)/, '91');
    track('whatsapp_click', { code: waCtx.code || undefined });
    try {
      await fetch('/api/forms/whatsapp-click', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, business, product_code: waCtx.code, product_name: waCtx.product, source_page: waCtx.source })
      });
    } catch (err) { }
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    closeWa();
    toast('Opening WhatsApp…');
  });

  /* ---------- enquiry list store (30 days) ---------- */
  const LKEY = 'mora_enquiry_v1', LEXP = 30 * 86400e3;
  const getList = () => {
    try { const raw = JSON.parse(localStorage.getItem(LKEY) || '[]'); return raw.filter(x => x.t > Date.now() - LEXP); }
    catch (e) { return []; }
  };
  const setList = (l) => { localStorage.setItem(LKEY, JSON.stringify(l)); updateBadges(); };
  function addToList(code, name, qty) {
    const l = getList();
    const ex = l.find(x => x.code === code);
    if (ex) ex.qty = Math.min(999999, ex.qty + (qty || 1));
    else l.push({ code, name: name || '', qty: qty || 1, t: Date.now() });
    setList(l); toast(`${code} added to your enquiry list`); track('add_to_enquiry_list', { code });
  }
  function updateBadges() {
    const n = getList().length;
    $$('#list-count, [data-list-count]').forEach(b => { b.hidden = n === 0; b.textContent = n; });
    $$('[data-cmp-count]').forEach(b => b.textContent = getCmp().length);
    if ($('#compare-open')) $('#compare-open').hidden = getCmp().length < 2;
  }

  /* ---------- compare store ---------- */
  const CKEY = 'mora_compare_v1';
  const getCmp = () => { try { return JSON.parse(localStorage.getItem(CKEY) || '[]').slice(0, 4); } catch (e) { return []; } };
  const setCmp = (l) => { localStorage.setItem(CKEY, JSON.stringify(l.slice(0, 4))); updateBadges(); syncCmpChecks(); };
  function syncCmpChecks() {
    const l = getCmp();
    $$('[data-compare]').forEach(ch => { ch.checked = l.includes(ch.dataset.code); });
  }

  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add-list]');
    if (add) { addToList(add.dataset.code, add.dataset.name, 1); }
    if (e.target.closest('[data-add-open-list]')) location.href = '/enquiry-list';
    const share = e.target.closest('[data-share]');
    if (share) {
      const data = { title: document.title, url: location.href };
      if (navigator.share) navigator.share(data).catch(() => { });
      else { navigator.clipboard?.writeText(location.href); toast('Link copied'); }
    }
  });
  document.addEventListener('change', e => {
    const ch = e.target.closest('[data-compare]');
    if (ch) {
      const l = getCmp();
      if (ch.checked) { if (l.length >= 4) { ch.checked = false; toast('Compare holds up to 4 products'); return; } l.push(ch.dataset.code); }
      else l.splice(l.indexOf(ch.dataset.code), 1);
      setCmp(l);
      toast(ch.checked ? 'Added to compare' : 'Removed from compare');
    }
  });

  /* ---------- lead forms ---------- */
  function validateForm(form) {
    let ok = true;
    $$('[required]', form).forEach(f => {
      const bad = !f.value.trim() || (f.type === 'email' && f.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value));
      f.classList.toggle('invalid', bad);
      if (bad && ok) { f.focus(); ok = false; } else if (bad) ok = false;
    });
    return ok;
  }
  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-lead-form]');
    if (!form) return;
    e.preventDefault();
    if (!validateForm(form)) return;
    const msg = $('.form-msg', form);
    msg.className = 'form-msg'; msg.textContent = 'Sending…';
    const data = Object.fromEntries(new FormData(form).entries());
    data.source_page = form.dataset.source || location.pathname;
    const type = form.dataset.leadForm;
    if (type === 'enquiry-list') data.items = getList().map(x => ({ code: x.code, name: x.name, qty: x.qty }));
    if (new URLSearchParams(location.search).get('product') && !data.product_code) data.product_code = new URLSearchParams(location.search).get('product');
    try {
      const r = await fetch('/api/forms/' + type, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!j.ok) throw new Error(j.error || 'Could not send');
      track('lead_submit', { type });
      msg.classList.add('ok'); msg.textContent = j.message || 'Thank you! We will respond within one business day.';
      form.reset();
      if (type === 'enquiry-list') { setList([]); renderEList(); }
    } catch (err) { msg.classList.add('err'); msg.textContent = err.message || 'Something went wrong — please try again or WhatsApp us.'; }
  });

  /* ---------- counters ---------- */
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(ents => ents.forEach(en => {
    if (en.isIntersecting) { const b = en.target; io.unobserve(b); const v = b.dataset.count; if (!v) return; b.style.opacity = 0; requestAnimationFrame(() => { b.style.transition = 'opacity .6s'; b.style.opacity = 1; }); }
  }), { threshold: .4 }) : null;
  $$('[data-count]').forEach(b => io && io.observe(b));

  /* ---------- product card renderer (client) ---------- */
  function cardHtml(p) {
    const img = p.image
      ? `<picture>${p.image.srcsetAvif ? `<source type="image/avif" srcset="${esc(p.image.srcsetAvif)}" sizes="(min-width:1024px) 25vw,50vw">` : ''}<img class="pcard-img" src="${esc(p.image.src)}" ${p.image.srcset ? `srcset="${esc(p.image.srcset)}"` : ''} sizes="(min-width:1024px) 25vw,50vw" alt="${esc(p.name)}" loading="lazy" ${p.image.w ? `width="${p.image.w}" height="${p.image.h}"` : ''}></picture>`
      : `<div class="ph"><svg viewBox="0 0 64 72" width="44" height="50" aria-hidden="true"><path d="M32 2 62 20v32L32 70 2 52V20Z" fill="none" stroke="currentColor" stroke-width="3"/><path d="M32 14 50 24v20L32 54 14 44V24Z" fill="none" stroke="currentColor" stroke-width="2" opacity=".55"/><text x="32" y="40" text-anchor="middle" font-size="15" font-family="Georgia,serif" fill="currentColor">M</text></svg><b>MORA&nbsp;HOME</b><span>Photo coming soon</span></div>`;
    const specs = [p.material, p.finish, p.dimensions].filter(Boolean).join(' · ');
    return `<article class="pcard" data-code="${esc(p.code)}">
      <a class="pcard-media" href="${esc(p.url)}">${p.badge ? `<span class="pcard-badge">${esc(p.badge)}</span>` : ''}${img}</a>
      <div class="pcard-body">
        ${p.category ? `<span class="pcard-cat">${esc(p.category)}</span>` : ''}
        <h3><a href="${esc(p.url)}">${esc(p.name)}</a></h3>
        <span class="pcard-code">${esc(p.code)}</span>
        ${specs ? `<p class="pcard-spec">${esc(specs)}</p>` : ''}
        <div class="pcard-acts">
          <button class="btn btn-small btn-primary" data-add-list data-code="${esc(p.code)}" data-name="${esc(p.name)}">Enquiry List</button>
          <a class="btn btn-small btn-ghost" href="/contact?product=${esc(p.code)}">Send Enquiry</a>
          <label class="cmp"><input type="checkbox" data-compare data-code="${esc(p.code)}"> Compare</label>
        </div></div></article>`;
  }

  /* ---------- products listing ---------- */
  const grid = $('#product-grid');
  if (grid) {
    const state = { q: new URLSearchParams(location.search).get('q') || '', category: new URLSearchParams(location.search).get('category') || 'all', material: [], ideal_for: [], order_type: [], finish: [], sort: 'newest', page: 1, pages: 1, total: 0 };
    const LISTMAP = { material: 'material', ideal_for: 'ideal_for', order_type: 'order_type', finish: 'finish' };
    async function loadFilters() {
      const r = await fetch('/api/public/filters'); const j = await r.json();
      const wrap = $('#filter-groups'); wrap.innerHTML = '';
      const labels = { material: 'Material', ideal_for: 'Ideal For', order_type: 'Order Type', finish: 'Finish', business_type: 'Business Type' };
      for (const key of Object.keys(LISTMAP)) {
        const vals = j.lists.filter(l => l.key === key);
        if (!vals.length) continue;
        const g = document.createElement('div'); g.className = 'fgroup';
        g.innerHTML = `<h3>${labels[key]}</h3>` + vals.map(v => `<label class="fopt"><input type="checkbox" data-flt="${key}" value="${esc(v.value)}"> ${esc(v.value)} <span class="cnt">${j.counts[key + ':' + v.value] || 0}</span></label>`).join('');
        wrap.appendChild(g);
      }
      const tabs = $('#cat-tabs');
      tabs.innerHTML = `<button role="tab" data-cat="all" aria-selected="${state.category === 'all'}">All</button>` +
        j.categories.map(c => `<button role="tab" data-cat="${esc(c.slug)}" aria-selected="${state.category === c.slug}">${esc(c.name)} <span class="cnt">${c.c}</span></button>`).join('');
      $$('button[data-cat]', tabs).forEach(b => b.addEventListener('click', () => { state.category = b.dataset.cat; state.page = 1; $$('button[data-cat]', tabs).forEach(x => x.setAttribute('aria-selected', x === b)); load(); }));
      $$('#filters [data-flt]').forEach(ch => ch.addEventListener('change', () => {
        const key = ch.dataset.flt;
        state[key] = $$('#filters [data-flt="' + key + '"]:checked').map(x => x.value);
        state.page = 1; load();
      }));
      $('#filters-clear').addEventListener('click', () => { $$('#filters input:checked').forEach(x => x.checked = false); ['material', 'ideal_for', 'order_type', 'finish'].forEach(k => state[k] = []); state.page = 1; load(); });
    }
    async function load(append) {
      const params = new URLSearchParams();
      if (state.q) params.set('q', state.q);
      if (state.category !== 'all') params.set('category', state.category);
      for (const k of Object.keys(LISTMAP)) state[k].forEach(v => params.set(k, v));
      params.set('sort', state.sort); params.set('page', state.page);
      history.replaceState({}, '', '/products' + (params.toString() ? '?' + params : ''));
      grid.setAttribute('aria-busy', 'true');
      if (!append) grid.innerHTML = Array.from({ length: 8 }, () => '<div class="skeleton"></div>').join('');
      try {
        const r = await fetch('/api/public/products?' + params); const j = await r.json();
        state.total = j.total; state.pages = j.pages;
        if (!append) grid.innerHTML = '';
        grid.innerHTML += j.products.map(cardHtml).join('');
        $('#plist-count').textContent = j.total ? `${j.total} product${j.total === 1 ? '' : 's'}` : '';
        $('#plist-empty').hidden = j.total !== 0;
        $('#plist-more').hidden = state.page >= j.pages || !j.total;
        syncCmpChecks();
        track('products_view', { q: state.q || undefined, results: j.total });
      } catch (e) { if (!append) grid.innerHTML = ''; $('#plist-empty').hidden = false; }
      grid.removeAttribute('aria-busy');
    }
    loadFilters().then(load);
    $('#plist-search')?.addEventListener('submit', e => { e.preventDefault(); state.q = $('#plist-search input').value.trim(); state.page = 1; load(); });
    $('#sort')?.addEventListener('change', e => { state.sort = e.target.value; state.page = 1; load(); });
    $('#plist-more button')?.addEventListener('click', () => { state.page += 1; load(true); });
  }

  /* ---------- enquiry list page ---------- */
  const elWrap = $('#elist-items');
  async function renderEList() {
    if (!elWrap) return;
    const l = getList();
    updateBadges();
    $('#elist-empty').hidden = l.length > 0;
    $('#elist-form').hidden = l.length === 0;
    if (!l.length) { elWrap.innerHTML = ''; return; }
    const r = await fetch('/api/public/products/by-codes?codes=' + encodeURIComponent(l.map(x => x.code).join(',')));
    const j = await r.json();
    const byCode = Object.fromEntries((j.products || []).map(p => [p.code, p]));
    elWrap.innerHTML = l.map(item => {
      const p = byCode[item.code];
      const thumb = p?.image ? `<img src="${esc(p.image.src)}" alt="" width="84" height="84" style="object-fit:cover;width:84px;height:84px">` : `<div class="ph" style="border:0"><span>${esc(item.code)}</span></div>`;
      return `<div class="elist-item" data-code="${esc(item.code)}">
        <div class="elist-thumb">${thumb}</div>
        <div>
          <h3>${p ? `<a href="${esc(p.url)}">${esc(p.name || item.name || item.code)}</a>` : esc(item.name || item.code)}</h3>
          <span class="pcard-code">${esc(item.code)}${p?.category ? ' · ' + esc(p.category) : ''}</span>
          ${p?.moq ? `<div class="elist-moq">MOQ: ${p.moq} pcs — quantities below MOQ cannot be calculated</div>` : '<div class="elist-moq">MOQ on request</div>'}
          <div class="elist-qty">
            <button type="button" data-dq="-1" aria-label="Decrease quantity">−</button>
            <input type="number" min="1" value="${item.qty}" data-qty aria-label="Quantity">
            <button type="button" data-dq="1" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="elist-remove" type="button" data-remove>Remove</button>
      </div>`;
    }).join('');
  }
  elWrap?.addEventListener('click', e => {
    const row = e.target.closest('.elist-item'); if (!row) return;
    const code = row.dataset.code;
    const l = getList(); const it = l.find(x => x.code === code); if (!it) return;
    if (e.target.closest('[data-remove]')) { setList(l.filter(x => x.code !== code)); renderEList(); return; }
    const dq = e.target.closest('[data-dq]');
    if (dq) { it.qty = Math.max(1, it.qty + (+dq.dataset.dq)); setList(l); row.querySelector('[data-qty]').value = it.qty; }
  });
  elWrap?.addEventListener('change', e => {
    const inp = e.target.closest('[data-qty]'); if (!inp) return;
    const row = inp.closest('.elist-item'); const l = getList();
    const it = l.find(x => x.code === row.dataset.code); if (!it) return;
    it.qty = Math.max(1, Math.min(999999, +inp.value || 1)); inp.value = it.qty; setList(l);
  });
  $('#paste-add')?.addEventListener('click', async () => {
    const raw = $('#paste-codes').value;
    const codes = raw.split(/[,\s;]+/).map(s => s.trim()).filter(Boolean).map(s => {
      const d = s.toUpperCase().replace(/[^A-Z0-9]/g, '');
      return /^MH/.test(d) ? 'MH-' + d.replace(/^MH/, '') : (d ? 'MH-' + d : '');
    }).filter(c => c.length > 3);
    if (!codes.length) { toast('No codes found'); return; }
    const r = await fetch('/api/public/products/by-codes?codes=' + encodeURIComponent(codes.join(',')));
    const j = await r.json();
    const found = new Set(); let added = 0;
    (j.products || []).forEach(p => { found.add(p.code); if (!getList().find(x => x.code === p.code)) { addToList(p.code, p.name, 1); added++; } });
    renderEList();
    const missing = codes.filter(c => !found.has(c));
    toast(added ? `${added} product(s) added${missing.length ? `; ${missing.length} code(s) not found` : ''}` : (missing.length ? `Not found: ${missing.join(', ')}` : 'Already in your list'));
    $('#paste-codes').value = '';
  });
  renderEList();

  /* ---------- compare page ---------- */
  const cmpWrap = $('#cmp-wrap');
  if (cmpWrap) {
    (async () => {
      const codes = getCmp();
      $('#cmp-empty').hidden = codes.length > 0;
      if (!codes.length) return;
      const r = await fetch('/api/public/products/by-codes?codes=' + encodeURIComponent(codes.join(',')));
      const j = await r.json();
      const ps = codes.map(c => (j.products || []).find(p => p.code === c)).filter(Boolean);
      if (!ps.length) { $('#cmp-empty').hidden = false; return; }
      const rows = (label, fn) => `<tr><th scope="row">${label}</th>${ps.map(p => `<td>${esc(fn(p) ?? '—')}</td>`).join('')}</tr>`;
      cmpWrap.hidden = false;
      cmpWrap.innerHTML = `<table class="cmp-table"><thead><tr><th></th>${ps.map(p => `<th>
          <div class="pc-mini">${p.image ? `<img src="${esc(p.image.src)}" alt="" width="64" height="64" style="object-fit:cover">` : `<div class="ph" style="border:0"><span>${esc(p.code)}</span></div>`}</div>
          <a href="${esc(p.url)}"><b>${esc(p.name)}</b></a><br><span class="pcard-code">${esc(p.code)}</span><br>
          <button class="cmp-remove" data-code="${esc(p.code)}">Remove</button></th>`).join('')}</tr></thead><tbody>
        ${rows('Category', p => p.category)}
        ${rows('Material', p => p.material)}
        ${rows('Finish', p => p.finish)}
        ${rows('Dimensions', p => p.dimensions)}
        ${rows('MOQ', p => p.moq ? p.moq + ' pcs' : 'On request')}
        ${rows('Lead Time', p => p.leadTime)}
        ${rows('GST', p => p.gst || 'As applicable')}
        ${rows('Price', p => (p.showPrice && p.priceMode !== 'tiers' && p.basePrice > 0) ? inr(p.basePrice) + ' / pc' : (p.showPrice && p.priceMode === 'tiers' ? 'Tiered — see product page' : 'Price on Request'))}
        <tr><th></th>${ps.map(p => `<td><button class="btn btn-small btn-primary" data-add-list data-code="${esc(p.code)}" data-name="${esc(p.name)}">Enquiry List</button></td>`).join('')}</tr>
        </tbody></table>`;
      $$('.cmp-remove', cmpWrap).forEach(b => b.addEventListener('click', () => { setCmp(getCmp().filter(c => c !== b.dataset.code)); location.reload(); }));
    })();
  }

  /* ---------- product detail: gallery, lightbox, recent ---------- */
  const lb = $('#lightbox'), lbImg = $('#lb-img'), lbCap = $('#lb-cap');
  function openLb(src, cap) { if (!lb) return; lbImg.src = src; lbCap.textContent = cap || ''; lb.hidden = false; document.body.style.overflow = 'hidden'; }
  function closeLb() { if (lb && !lb.hidden) { lb.hidden = true; document.body.style.overflow = ''; } }
  lb?.addEventListener('click', e => { if (e.target === lb || e.target.closest('.lb-close')) closeLb(); });
  $$('.gal-thumb').forEach(t => t.addEventListener('click', () => {
    $$('.gal-thumb').forEach(x => x.classList.remove('is-on')); t.classList.add('is-on');
    const main = $('.gal-img');
    if (main) { const img = t.querySelector('img'); if (img) { main.src = t.dataset.full || img.src; main.removeAttribute('srcset'); } }
  }));
  $('.gal-main')?.addEventListener('click', () => {
    const img = $('.gal-img'); if (img) openLb(img.currentSrc || img.src, lbCap?.dataset.cap || document.title);
  });
  // recently viewed
  const RVK = 'mora_recent_v1';
  const pvCode = document.body.dataset.page === '/products' && $('.pd [data-add-list]') ? $('.pd [data-add-list]').dataset.code : null;
  if (pvCode) {
    try {
      let rv = JSON.parse(localStorage.getItem(RVK) || '[]').filter(c => c !== pvCode);
      rv.unshift(pvCode); localStorage.setItem(RVK, JSON.stringify(rv.slice(0, 8)));
    } catch (e) { }
  }
  const recent = $('#recent-block');
  if (recent) (async () => {
    try {
      const rv = (JSON.parse(localStorage.getItem(RVK) || '[]')).filter(c => c !== pvCode).slice(0, 4);
      if (rv.length) {
        const r = await fetch('/api/public/products/by-codes?codes=' + encodeURIComponent(rv.join(',')));
        const j = await r.json();
        if ((j.products || []).length) { recent.hidden = false; $('#recent-grid').innerHTML = j.products.map(cardHtml).join(''); syncCmpChecks(); }
      }
    } catch (e) { }
  })();

  /* ---------- search shortcut ---------- */
  document.addEventListener('keydown', e => {
    if (e.key === '/' && !/input|textarea|select/i.test(document.activeElement.tagName)) { e.preventDefault(); ($('#navq') || $('.hero-search input') || $('#plist-search input'))?.focus(); }
  });

  updateBadges(); syncCmpChecks();
  track('page_view', { page: location.pathname });
})();
