/** MORA HOME — /products listing page (sticky search, tabs, filter drawer, responsive grid). */
const db = require('../db');
const { esc, icon, productCard, ornament } = require('../render');

/* ───────────────────────── EDIT YOUR TEXT HERE ───────────────────────── */
const HEAD_COPY = {
  overline: 'WHOLESALE CATALOGUE',
  title: 'Our Products',
  tagline: 'Just imagine it. We’ll bring it to life.',
  subline: 'Can’t find what you need? Tell us your idea, and we’ll make it for you.',
  makeTitle: 'We Make It Your Way',
  cards: [
    { tag: 'OEM', title: 'Your Design, Our Making',
      text: 'You have the design or sample. We make it for you in our factory, exactly as you want, and you sell it under your own brand name.' },
    { tag: 'ODM', title: 'Your Idea, Our Design',
      text: 'You only have an idea. Our team designs the product, makes samples, and produces it for you. You don’t need to do the designing.' },
  ],
  buttonText: 'Share Your Idea',
  buttonLink: '/contact',
  note: '', // optional small line at the bottom of the header (leave empty to hide)
};
/* ──────────────────────────────────────────────────────────────────── */

function productsBody(initialCat, ctx) {
  const cats = db.all('SELECT * FROM categories WHERE visible = 1 ORDER BY sort ASC');
  const prods = db.all("SELECT * FROM products WHERE status = 'published' ORDER BY created_at DESC");
  const imgs = prods.length ? db.all(`SELECT * FROM product_images WHERE product_id IN (${prods.map((p) => p.id).join(',')}) ORDER BY sort ASC`) : [];
  const byId = {};
  imgs.forEach((i) => { (byId[i.product_id] = byId[i.product_id] || []).push(i); });

  const payload = prods.map((p) => ({
    id: p.id, code: p.code, name: p.name, badge: p.badge, cat: p.category_slug,
    material: p.material, size: p.size, moq: p.moq, featured: p.featured, price: p.price || '',
    created: p.created_at, img: (byId[p.id] || [])[0] || null,
  }));

  const wm = ctx && ctx.theme && ctx.theme.watermarkOn && ctx.brand && ctx.brand.crestPath
    ? `<img class="head-watermark" src="${esc(ctx.brand.crestPath)}" alt="" aria-hidden="true">` : '';
  const H = HEAD_COPY;

  return `
  <section class="products-page">
    <div class="products-head">
      ${wm}
      <div class="container head-inner">
        <p class="overline">${esc(H.overline)}</p>
        <h1 class="page-title">${esc(H.title)}</h1>
        <p class="head-tagline">${esc(H.tagline)}</p>
        <p class="head-subline">${esc(H.subline)}</p>

        <div class="head-cats-download" aria-label="Download range catalogues">
          <span class="hcd-label">${icon('download', 15)} Download PDF catalogue:</span>
          <a class="hcd-pill hcd-pill-all" href="/catalogue/latest" download="MORA-HOME-Wholesale-Catalogue.pdf" data-catalogue-download aria-label="Download PDF catalogue — All Categories">${icon('download', 14)}<span>All Categories</span></a>
          ${cats.map((c) => `<a class="hcd-pill" href="/catalogue/latest?cat=${encodeURIComponent(c.slug)}" download="MORA-HOME-${esc(c.name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/gi, '-'))}-Range-Catalogue.pdf" data-catalogue-download aria-label="Download PDF catalogue — ${esc(c.name)}">${icon('download', 14)}<span>${esc(c.name)}</span></a>`).join('')}
        </div>

        <div class="head-make">
          <div class="head-make-top">
            <h2 class="head-make-title">${esc(H.makeTitle)}</h2>
            <a class="btn btn-light-pill head-btn" href="${esc(H.buttonLink)}">${esc(H.buttonText)}</a>
          </div>
          <div class="head-make-grid">
            ${H.cards.map((c) => `<article class="head-card">
              <span class="head-tag">${esc(c.tag)}</span>
              <div><h3>${esc(c.title)}</h3><p>${esc(c.text)}</p></div>
            </article>`).join('')}
          </div>
        </div>
        ${H.note ? `<p class="head-note">${esc(H.note)}</p>` : ''}
      </div>
    </div>

    <div class="products-sticky">
      <div class="container">
        <div class="search-row">
          <div class="search-bar">
            ${icon('search', 18)}
            <input id="prodSearch" type="search" placeholder="Search by code or name" aria-label="Search products by code or name">
          </div>
          <button class="btn-filter-sort" id="filterSortBtn" type="button" aria-haspopup="dialog" aria-expanded="false" aria-controls="filterDrawer">${icon('sliders', 16)}<span class="fs-label">Filter<span class="fs-more"> &amp; Sort</span></span><span class="fs-count" id="fsCount" hidden>0</span></button>
        </div>
        <div class="filter-row">
          <div class="cat-tabs" id="catTabs" role="tablist" aria-label="Product categories">
            <button class="cat-tab${!initialCat ? ' active' : ''}" data-cat="" role="tab">All</button>
            ${cats.map((c) => `<button class="cat-tab${initialCat === c.slug ? ' active' : ''}" data-cat="${esc(c.slug)}" role="tab">${esc(c.name)}</button>`).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- floating filter panel: opens on top of the page wherever you are scrolled (bottom sheet on phones, centred pop-up on desktop) -->
    <div class="filter-overlay" id="filterDrawer" hidden>
      <div class="filter-backdrop" id="filterBackdrop"></div>
      <div class="filter-sheet" role="dialog" aria-modal="true" aria-labelledby="fsTitle">
        <div class="filter-sheet-head">
          <h2 id="fsTitle">Filter &amp; Sort</h2>
          <button class="filter-close" id="filterClose" type="button" aria-label="Close filters">&times;</button>
        </div>
        <div class="filter-sheet-body">
          <div class="filter-group">
            <span class="filter-label">Sort by</span>
            <select id="sortSelect" aria-label="Sort products">
              <option value="new">Newest first</option>
              <option value="code">Product code (A→Z)</option>
              <option value="name">Name (A→Z)</option>
              <option value="moq">MOQ (low → high)</option>
            </select>
          </div>
          <div class="filter-group" id="materialGroup">
            <span class="filter-label">Material</span>
            <div class="pill-row" id="materialPills" role="group" aria-label="Filter by material"></div>
          </div>
          <div class="filter-group">
            <span class="filter-label">Badge</span>
            <select id="badgeSelect" aria-label="Filter by badge">
              <option value="">All badges</option>
            </select>
          </div>
          <div class="filter-group">
            <span class="filter-label">Max MOQ</span>
            <select id="moqSelect" aria-label="Filter by MOQ">
              <option value="">Any MOQ</option>
              <option value="50">≤ 50 pcs</option>
              <option value="100">≤ 100 pcs</option>
              <option value="200">≤ 200 pcs</option>
            </select>
          </div>
          <label class="switch-row" for="featuredToggle">
            <span><b>Top picks only</b><small>Show only our featured products</small></span>
            <input type="checkbox" id="featuredToggle" class="switch-input">
            <span class="switch-ui" aria-hidden="true"></span>
          </label>
        </div>
        <div class="filter-sheet-foot">
          <button class="btn btn-outline" id="clearFilters" type="button">Clear all</button>
          <button class="btn btn-crimson" id="filterApply" type="button">Show products</button>
        </div>
      </div>
    </div>

    <div class="container results-bar">
      <p id="resultsCounter" class="results-counter">Showing ${prods.length} of ${prods.length} products</p>
      <div id="filterChips" class="filter-chips"></div>
    </div>

    <div class="container">
      <div class="product-grid" id="productGrid">
        ${prods.map((p) => productCard(p, byId[p.id] || [])).join('')}
      </div>
      <div class="empty-state" id="emptyState" hidden>
        <p class="empty-title">No products matched your search.</p>
        <p>Try a different code (e.g. “MH-2017”) or clear the filters.</p>
        <button class="btn btn-outline" type="button" id="emptyClear">Clear search &amp; filters</button>
      </div>
    </div>
  </section>
  <script id="productsJson" type="application/json">${JSON.stringify(payload).replace(/</g, '\\u003c')}</script>`;
}

module.exports = { productsBody };
