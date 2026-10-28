/* MORA HOME — feature battery for the Oct-2026 five-feature batch:
     1. WhatsApp modal product auto-lookup
     2. Desktop fit (no hamburger/drawer ≥901px)
     3. Designed catalogue cover page + admin replace/remove
     4. Per-range catalogue downloads (?cat=slug) + all-categories
     5. Price box on cards, product page, spec sheets, catalogue & admin

   Usage: start the server on :3000, then `node scripts/feature-verify.js`.
   NOTE: run this BEFORE scripts/qa-verify.js — qa-verify deliberately
   exhausts the login rate limiter, which would block the admin checks here.
   The script restores everything it changes (prices, cover page). */
const { PDFDocument } = require('pdf-lib');

const BASE = process.env.BASE || 'http://localhost:3000';
let pass = 0; let fail = 0; const failures = [];
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✔ ' + name); }
  else { fail++; failures.push(name); console.log('  ✘ ' + name + (extra ? ' — ' + extra : '')); }
}
const get = async (path, opts) => fetch(BASE + path, Object.assign({ redirect: 'manual' }, opts || {}));
const text = async (path) => (await get(path)).text();
async function pdfInfo(buf) { const d = await PDFDocument.load(buf, { ignoreEncryption: true }); const p = d.getPage(0); return { pages: d.getPageCount(), w: Math.round(p.getWidth()), h: Math.round(p.getHeight()) }; }

(async () => {
  console.log('MORA HOME — feature battery (5-feature batch)\n');

  /* ---------- 1. WhatsApp auto-lookup API ---------- */
  let r = await get('/api/product-lookup?code=MH-2017');
  let j = await r.json();
  ok('lookup: exact code 200', r.status === 200);
  ok('lookup: returns code+name', j.code === 'MH-2017' && /Diya/.test(j.name || ''), JSON.stringify(j).slice(0, 120));
  ok('lookup: returns description + price', typeof j.description === 'string' && j.description.length > 20 && j.price === '₹1,249 / set', j.price);
  ok('lookup: cacheable', /public/.test(r.headers.get('cache-control') || ''));
  r = await get('/api/product-lookup?code=' + encodeURIComponent('mh 2017'));
  j = await r.json();
  ok('lookup: normalises case/space/dash', r.status === 200 && j.code === 'MH-2017');
  r = await get('/api/product-lookup?code=2017');
  j = await r.json();
  ok('lookup: numeric suffix fallback', r.status === 200 && j.code === 'MH-2017');
  r = await get('/api/product-lookup?code=ZZZZ99');
  ok('lookup: unknown code 404', r.status === 404);
  r = await get('/api/product-lookup?code=x');
  ok('lookup: too-short query 404', r.status === 404);

  /* ---------- 1b. modal markup + client JS ---------- */
  const home = await text('/');
  ok('modal: product input present', home.includes('id="waProductInput"'));
  ok('modal: lookup chip present', home.includes('id="waLookupChip"'));
  const siteJs = await text('/js/site.js');
  ok('site.js: calls /api/product-lookup', siteJs.includes('/api/product-lookup'));
  ok('site.js: appends product details to message', siteJs.includes('Product details —'));

  /* ---------- 2. desktop fit ---------- */
  const css = await text('/css/site.css');
  const v82 = css.slice(css.indexOf('@media (min-width:901px)'));
  ok('css: v8.2 desktop block served', css.includes('@media (min-width:901px)'));
  ok('css: hamburger hidden on desktop', /\.nav-toggle\s*\{\s*display:none\s*!important/.test(v82.slice(0, 400)));
  ok('css: drawer + backdrop hidden on desktop', /\.site-drawer[^}]*display:none\s*!important/.test(v82.slice(0, 400)) && /drawer-backdrop/.test(v82.slice(0, 400)));

  /* ---------- 3+4. catalogue cover & per-range downloads ---------- */
  r = await get('/uploads/catalogue-cover/catalogue-cover.pdf');
  const coverBuf = Buffer.from(await r.arrayBuffer());
  ok('cover: default designed cover installed & served', r.status === 200 && coverBuf.slice(0, 4).toString() === '%PDF');
  const coverInfo = await pdfInfo(coverBuf);
  ok('cover: single A4 portrait page', coverInfo.pages === 1 && Math.abs(coverInfo.w - 595) < 5 && Math.abs(coverInfo.h - 842) < 5, JSON.stringify(coverInfo));

  const productsHtml = await text('/products');
  ok('products: download strip rendered', productsHtml.includes('head-cats-download') && productsHtml.includes('hcd-pill'));
  ok('products: All Categories pill', productsHtml.includes('>All Categories</a>'));
  const catSlugs = ['pooja-items', 'serveware-utensils', 'corporate-gifting', 'kitchenware', 'home-decor'];
  ok('products: pill for every demo range', catSlugs.every((s) => productsHtml.includes('/catalogue/latest?cat=' + s)), catSlugs.filter((s) => !productsHtml.includes('/catalogue/latest?cat=' + s)).join(','));

  r = await get('/catalogue/latest');
  const allBuf = Buffer.from(await r.arrayBuffer());
  ok('catalogue: full PDF served', r.status === 200 && (r.headers.get('content-type') || '').includes('application/pdf') && allBuf.slice(0, 4).toString() === '%PDF');
  ok('catalogue: inline disposition', /inline/.test(r.headers.get('content-disposition') || ''));
  const allInfo = await pdfInfo(allBuf);
  ok('catalogue: A4 pages', Math.abs(allInfo.w - 595) < 5 && Math.abs(allInfo.h - 842) < 5, JSON.stringify(allInfo));
  ok('catalogue: cover + multi-page body', allInfo.pages >= 4, 'pages=' + allInfo.pages);

  r = await get('/catalogue/latest?cat=corporate-gifting');
  const catBuf = Buffer.from(await r.arrayBuffer());
  ok('catalogue: range PDF served', r.status === 200 && catBuf.slice(0, 4).toString() === '%PDF');
  const catInfo = await pdfInfo(catBuf);
  ok('catalogue: range is shorter than full', catInfo.pages >= 2 && catInfo.pages < allInfo.pages, `range=${catInfo.pages} full=${allInfo.pages}`);
  r = await get('/catalogue/latest?cat=does-not-exist');
  ok('catalogue: unknown range 404', r.status === 404);
  r = await get('/catalogue/latest?dl=1&cat=corporate-gifting');
  ok('catalogue: range supports ?dl=1 attachment', r.status === 200 && /attachment/.test(r.headers.get('content-disposition') || ''));

  /* ---------- 5. price box everywhere (public) ---------- */
  ok('home: card price pill markup', home.includes('p-code-row') && home.includes('p-price'));
  ok('home: demo price visible', home.includes('₹1,249 / set'));
  const pdp = await text('/products/MH-2017');
  ok('pdp: price pill (large row)', pdp.includes('p-code-row large') && pdp.includes('₹1,249 / set'));
  ok('pdp: Wholesale Price spec row', pdp.includes('Wholesale Price'));
  const ldMatch = pdp.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
  let ldPriceOk = false;
  for (const s of ldMatch) {
    try {
      const ld = JSON.parse(s.replace(/<\/?script[^>]*>/g, ''));
      if (ld['@type'] === 'Product' && ld.offers && ld.offers.lowPrice === 1249 && ld.offers.highPrice === 1249 && ld.offers.priceCurrency === 'INR') ldPriceOk = true;
    } catch { /* next block */ }
  }
  ok('pdp: JSON-LD lowPrice/highPrice from price field', ldPriceOk);
  const pdp2 = await text('/products/MH-2021');
  ok('pdp: price range parsed (₹2,400–₹2,900 → 2400/2900)', pdp2.includes('"lowPrice":2400') && pdp2.includes('"highPrice":2900'));
  const specHtml = await text('/products/MH-2017/spec-sheet');
  ok('spec-sheet html: Wholesale Price row', specHtml.includes('Wholesale Price') && specHtml.includes('₹1,249 / set'));
  r = await get('/products/MH-2017/spec-sheet.pdf');
  const specBuf = Buffer.from(await r.arrayBuffer());
  ok('spec-sheet pdf served', r.status === 200 && specBuf.slice(0, 4).toString() === '%PDF');

  /* ---------- admin: login (one attempt) ---------- */
  r = await get('/admin/login');
  const loginHtml = await r.text();
  const csrf = (loginHtml.match(/name="_csrf" value="([a-f0-9]+)"/) || [])[1];
  ok('admin: csrf token issued', !!csrf);
  r = await fetch(BASE + '/admin/login', {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: `mora_csrf=${csrf}` },
    body: `user=admin&pass=mora123&_csrf=${csrf}`,
  });
  const cookies = r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie') || ''];
  const session = (cookies.find((c) => c.startsWith('mora_admin=')) || '').split(';')[0];
  ok('admin: login succeeded', (r.status === 302 || r.status === 303) && session.startsWith('mora_admin='), 'status=' + r.status);
  const authed = (path, opts) => fetch(BASE + path, Object.assign({ redirect: 'manual', headers: { Cookie: session } }, opts || {}));
  const apiJson = async (path, opts) => { const rr = await authed(path, opts); return { status: rr.status, body: await rr.json().catch(() => null) }; };

  /* ---------- admin: state, price edit, cover management ---------- */
  let st = (await apiJson('/api/admin/state')).body;
  ok('admin state: catalogue_cover setting exposed', st && st.settings && st.settings.catalogue_cover && st.settings.catalogue_cover.path === '/uploads/catalogue-cover/catalogue-cover.pdf', JSON.stringify(st && st.settings && st.settings.catalogue_cover));
  const prod = st.products.find((p) => p.code === 'MH-2017');
  ok('admin state: products carry price', prod && prod.price === '₹1,249 / set');
  ok('admin: catalogue-cover API auth-protected', (await get('/api/admin/state')).status >= 400);

  const putBody = (p, price) => JSON.stringify({
    code: p.code, name: p.name, badge: p.badge, category_slug: p.category_slug, material: p.material,
    size: p.size, moq: p.moq, description: p.description, specs: JSON.parse(p.specs_json || '[]'),
    price, price_on_request: !!p.price_on_request, featured: !!p.featured, status: p.status,
  });
  let res2 = await apiJson(`/api/admin/products/${prod.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: session }, body: putBody(prod, '₹999 / set') });
  ok('admin: price update accepted', res2.status === 200);
  ok('admin: updated price visible on homepage', (await text('/')).includes('₹999 / set'));
  await apiJson(`/api/admin/products/${prod.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: session }, body: putBody(prod, prod.price) });
  ok('admin: price restored', (await text('/')).includes('₹1,249 / set'));

  // create → remove → replace cover; page counts must track the cover file
  const twoPage = await PDFDocument.create();
  twoPage.addPage([595.28, 841.89]); twoPage.addPage([595.28, 841.89]);
  const twoPageBytes = Buffer.from(await twoPage.save());
  res2 = await apiJson('/api/admin/catalogue-cover', { method: 'DELETE' });
  ok('admin: cover DELETE accepted', res2.status === 200);
  st = (await apiJson('/api/admin/state')).body;
  ok('admin: cover cleared in state', st.settings.catalogue_cover.path === '');
  r = await get('/catalogue/latest');
  const noCoverInfo = await pdfInfo(Buffer.from(await r.arrayBuffer()));
  ok('catalogue: generated cover used after removal (same page count)', r.status === 200 && noCoverInfo.pages === allInfo.pages, `noCover=${noCoverInfo.pages} withCover=${allInfo.pages}`);
  const fd = new FormData();
  fd.append('file', new Blob([twoPageBytes], { type: 'application/pdf' }), 'two-page-cover.pdf');
  r = await authed('/api/admin/catalogue-cover', { method: 'POST', body: fd });
  j = await r.json();
  ok('admin: 2-page cover upload 201', r.status === 201 && /^\/uploads\/catalogue-cover\//.test(j.path || ''), JSON.stringify(j));
  r = await get('/catalogue/latest');
  const twoInfo = await pdfInfo(Buffer.from(await r.arrayBuffer()));
  ok('catalogue: uploaded cover prepended (body + 2)', twoInfo.pages === noCoverInfo.pages + 1, `pages=${twoInfo.pages} expected=${noCoverInfo.pages + 1}`);
  r = await get('/catalogue/latest?cat=corporate-gifting');
  const twoCatInfo = await pdfInfo(Buffer.from(await r.arrayBuffer()));
  ok('catalogue: range PDF gets the new cover too', twoCatInfo.pages === catInfo.pages + 1, `pages=${twoCatInfo.pages} expected=${catInfo.pages + 1}`);
  const fd2 = new FormData();
  fd2.append('file', new Blob([coverBuf], { type: 'application/pdf' }), 'catalogue-cover.pdf');
  r = await authed('/api/admin/catalogue-cover', { method: 'POST', body: fd2 });
  ok('admin: original designed cover restored', r.status === 201);
  r = await get('/catalogue/latest');
  const restoredInfo = await pdfInfo(Buffer.from(await r.arrayBuffer()));
  ok('catalogue: page count back to original', restoredInfo.pages === allInfo.pages, `pages=${restoredInfo.pages} expected=${allInfo.pages}`);

  /* ---------- admin SPA assets ---------- */
  const adminJs = await text('/js/admin.js');
  ok('admin.js: cover manager wired', adminJs.includes('/api/admin/catalogue-cover') && adminJs.includes('Catalogue Cover Page'));
  ok('admin.js: price field in product editor', adminJs.includes("input('price'") && adminJs.includes('Price Box'));
  ok('admin.js: price column in product table', adminJs.includes('<th>Price</th>'));
  ok('admin.js: live-preview card shows price pill', adminJs.includes('p-price'));
  ok('admin.js: per-range download links listed', adminJs.includes('/catalogue/latest?cat='));

  console.log(`\n${pass} passed, ${fail} failed` + (fail ? ' → ' + failures.join(' | ') : ''));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); process.exit(2); });
