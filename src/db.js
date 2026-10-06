// MORA HOME — database layer (SQLite for local dev; all access centralised here for a future Postgres swap)
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
for (const d of ['uploads/originals', 'uploads/variants', 'documents', 'backups']) {
  fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });
}

const db = new Database(path.join(DATA_DIR, 'mora.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  pass_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager',      -- owner | manager | editor | sales
  locked_until INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  totp_secret TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  csrf TEXT NOT NULL,
  remember INTEGER DEFAULT 0,
  expires_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  ip TEXT, ua TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER, user_name TEXT,
  action TEXT NOT NULL, area TEXT NOT NULL, object TEXT,
  prev TEXT, next TEXT, ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  updated_by TEXT
);
CREATE TABLE IF NOT EXISTS content_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content_type TEXT NOT NULL,               -- 'settings' | 'section' | 'page'
  content_key TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_by TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS media_assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  original_name TEXT,
  file TEXT NOT NULL,                        -- path under data/uploads/originals
  mime TEXT, size INTEGER, width INTEGER, height INTEGER,
  alt TEXT DEFAULT '', tags TEXT DEFAULT '', focal TEXT DEFAULT '50% 50%',
  blur TEXT,
  created_at INTEGER NOT NULL, created_by TEXT,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS media_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  media_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  format TEXT NOT NULL, width INTEGER NOT NULL, file TEXT NOT NULL,
  UNIQUE(media_id, format, width)
);
CREATE TABLE IF NOT EXISTS pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'published',  -- draft | published
  blocks TEXT NOT NULL DEFAULT '[]',
  seo TEXT NOT NULL DEFAULT '{}',
  in_nav INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS home_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL,                         -- hero, categories, serve, ...
  name TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  config TEXT NOT NULL DEFAULT '{}',         -- published config
  draft TEXT,                                -- draft config (null = same as published)
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS nav_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL, url TEXT NOT NULL,
  sort INTEGER DEFAULT 0, visible INTEGER DEFAULT 1, new_tab INTEGER DEFAULT 0,
  area TEXT NOT NULL DEFAULT 'main'          -- main | quick
);
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  image_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  icon TEXT DEFAULT '',
  sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1,
  seo TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS attribute_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,                  -- material | ideal_for | order_type | finish | business_type
  name TEXT NOT NULL,
  sort INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS attribute_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id INTEGER NOT NULL REFERENCES attribute_lists(id) ON DELETE CASCADE,
  value TEXT NOT NULL, sort INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1,
  UNIQUE(list_id, value)
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,                 -- MH-1001
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  secondary_category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  tagline TEXT DEFAULT '', description TEXT DEFAULT '',
  material TEXT DEFAULT '', grade TEXT DEFAULT '', thickness TEXT DEFAULT '',
  finish TEXT DEFAULT '', material_notes TEXT DEFAULT '', care TEXT DEFAULT '', food_safe INTEGER DEFAULT 0,
  dimensions TEXT DEFAULT '', weight TEXT DEFAULT '', packaging TEXT DEFAULT '',
  ideal_for TEXT DEFAULT '', gifting TEXT DEFAULT '', order_type TEXT DEFAULT '',
  price_mode TEXT DEFAULT 'request',         -- fixed | tiers | request
  base_price INTEGER, moq INTEGER DEFAULT 1, lead_time TEXT DEFAULT '',
  gst TEXT DEFAULT '', gst_included INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',      -- draft | published | scheduled
  scheduled_at INTEGER, published_at INTEGER,
  featured INTEGER DEFAULT 0, is_new INTEGER DEFAULT 0, badge TEXT DEFAULT '',
  show_price INTEGER DEFAULT 0,
  demo INTEGER DEFAULT 0,
  seo TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  media_id INTEGER NOT NULL REFERENCES media_assets(id),
  sort INTEGER DEFAULT 0, alt TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS product_tiers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty INTEGER NOT NULL, price INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS faqs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL, answer TEXT NOT NULL,
  sort INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL, value TEXT NOT NULL, auto_products INTEGER DEFAULT 0,
  sort INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS testimonials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, business TEXT DEFAULT '', city TEXT DEFAULT '',
  quote TEXT NOT NULL, photo_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  sort INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1, demo INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trust_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'logo',          -- logo | badge | cert | doc
  label TEXT DEFAULT '', media_id INTEGER REFERENCES media_assets(id) ON DELETE SET NULL,
  sort INTEGER DEFAULT 0, enabled INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'enquiry',      -- enquiry | contact | catalogue | whatsapp | sample | enquiry-list
  name TEXT DEFAULT '', phone TEXT DEFAULT '', email TEXT DEFAULT '',
  business TEXT DEFAULT '', city TEXT DEFAULT '',
  product_code TEXT DEFAULT '', product_name TEXT DEFAULT '',
  quantity INTEGER,
  message TEXT DEFAULT '',
  source_page TEXT DEFAULT '', utm TEXT DEFAULT '{}', device TEXT DEFAULT '',
  status TEXT DEFAULT 'New',
  assignee TEXT DEFAULT '', follow_up TEXT DEFAULT '',
  email_status TEXT DEFAULT 'queued',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS lead_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  product_code TEXT, product_name TEXT, quantity INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS lead_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  user_name TEXT, note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS email_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER, kind TEXT DEFAULT 'lead',
  to_addr TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
  attempts INTEGER DEFAULT 0, status TEXT DEFAULT 'pending', -- pending | sent | failed
  last_error TEXT DEFAULT '', next_run INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS whatsapp_clicks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER, name TEXT DEFAULT '', business TEXT DEFAULT '',
  product_code TEXT DEFAULT '', source_page TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS search_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  query TEXT NOT NULL, results INTEGER DEFAULT 0, ip TEXT,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS product_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER, slug TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS catalogue_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file TEXT NOT NULL, label TEXT NOT NULL, version TEXT DEFAULT '1.0',
  notes TEXT DEFAULT '', active INTEGER DEFAULT 0, downloads INTEGER DEFAULT 0,
  size INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS redirects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_path TEXT NOT NULL UNIQUE, to_path TEXT NOT NULL, code INTEGER DEFAULT 301,
  enabled INTEGER DEFAULT 1, sort INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status, deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_cat ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_search ON search_log(query);
`);

// ---------- helpers ----------
const now = () => Date.now();
function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (!row) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}
function setSetting(key, value, userName) {
  db.prepare(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
    .run(key, JSON.stringify(value ?? {}), now(), userName || null);
}
function audit(user, action, area, object, prev, next, ip) {
  db.prepare('INSERT INTO audit_log(user_id,user_name,action,area,object,prev,next,ip,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(user?.id || null, user?.name || 'system', action, area, object || null,
      prev ? JSON.stringify(prev).slice(0, 4000) : null,
      next ? JSON.stringify(next).slice(0, 4000) : null, ip || null, now());
}
function pushVersion(type, key, snapshot, userName) {
  db.prepare('INSERT INTO content_versions(content_type,content_key,snapshot,created_by,created_at) VALUES(?,?,?,?,?)')
    .run(type, key, JSON.stringify(snapshot), userName || null, now());
  db.prepare(`DELETE FROM content_versions WHERE content_type=? AND content_key=? AND id NOT IN
    (SELECT id FROM content_versions WHERE content_type=? AND content_key=? ORDER BY id DESC LIMIT 20)`)
    .run(type, key, type, key);
}

// ---------- seed (runs once) ----------
function seedIfEmpty() {
  const has = db.prepare('SELECT COUNT(*) c FROM settings').get().c;
  if (has) return;

  const brand = {
    logoId: 1, logoDarkId: null, faviconId: 1, ogImageId: 1, appIconId: null, watermarkId: null,
    colors: {
      cream: '#FFFDF8', creamSoft: '#FBF9F4', white: '#FFFFFF', walnut: '#5C3D2E',
      walnutDark: '#3B2417', walnutLight: '#8A6A52', border: '#D9CBBB', red: '#8B0000',
      charcoal: '#1A1A1A', grey: '#6B6B6B', success: '#3F6B4A'
    },
    radius: '10px', headingFont: 'Cormorant Garamond', bodyFont: 'DM Sans',
    buttonStyle: 'solid',
    watermark: { enabled: false, opacity: 0.05, size: 420, position: 'center' }
  };
  setSetting('brand', brand, 'seed');
  setSetting('business', {
    name: 'MORA HOME', tagline: 'Handcrafted in Moradabad, India',
    address: 'Moradabad, Uttar Pradesh, India',
    phone: '+918171246275', emailPrimary: 'writemora@gmail.com', emailSecondary: 'asktomora@gmail.com',
    whatsapp: '+918171246275', hours: 'Mon–Sat · 10:00–19:00 IST',
    gst: '', mapUrl: '',
    socials: { instagram: '', facebook: '', linkedin: '', pinterest: '', youtube: '' }
  }, 'seed');
  setSetting('whatsapp', {
    enabled: true, buttonText: 'WhatsApp', mobileDockText: 'WhatsApp', desktopText: 'WhatsApp',
    messageTemplate: 'Hello MORA HOME, my name is {name}{business}. I would like to know more about your products.',
    productMessageTemplate: 'Hello MORA HOME, my name is {name}{business}. I am interested in {product} (Code: {code}).'
  }, 'seed');
  setSetting('email', {
    smtpHost: '', smtpPort: 587, smtpUser: '', smtpPass: '',
    fromName: 'MORA HOME', fromEmail: '', replyTo: 'writemora@gmail.com', autoReply: true,
    routing: { enquiry: 'writemora@gmail.com', catalogue: 'writemora@gmail.com', ask: 'asktomora@gmail.com', whatsapp: 'writemora@gmail.com' }
  }, 'seed');
  setSetting('emailTemplates', {
    enquiry: { subject: 'New enquiry — {name}', body: 'New enquiry received.\n\nName: {name}\nPhone: {phone}\nEmail: {email}\nBusiness: {business}\nCity: {city}\nProduct: {product} ({code})\nQuantity: {quantity}\nMessage:\n{message}\n\nSource: {source}' },
    catalogue: { subject: 'Catalogue request — {name}', body: 'Catalogue request.\n\nName: {name}\nPhone: {phone}\nEmail: {email}\nBusiness: {business}\nRequest the latest catalogue from the admin Documents section.' },
    whatsapp: { subject: 'WhatsApp lead — {name}', body: 'A visitor started a WhatsApp chat.\n\nName: {name}\nBusiness: {business}\nProduct: {product} ({code})\nPage: {source}' },
    autoreply: { subject: 'Thank you for contacting MORA HOME', body: 'Dear {name},\n\nThank you for your enquiry. Our B2B team will respond within one business day.\n\nWarm regards,\nMORA HOME · Moradabad, India' }
  }, 'seed');
  setSetting('seo', {
    title: 'MORA HOME — Handcrafted Steel, Iron, Brass & Wood Homeware | Moradabad B2B',
    description: 'MORA HOME is a Moradabad-based B2B manufacturer of handcrafted homeware in steel, iron, brass, wood and aluminium. Wholesale, retail supply, corporate gifting and return gifting across India.',
    keywords: 'MORA HOME, Moradabad homeware, B2B homeware India, brass decor wholesale, steel serveware manufacturer, corporate gifting',
    ogImageId: 1, robotsIndex: true
  }, 'seed');
  setSetting('analytics', { ga4: '', metaPixel: '', searchConsole: '', headerScripts: '', footerScripts: '' }, 'seed');
  setSetting('site', {
    maintenance: false,
    announcement: { enabled: false, text: 'Wholesale & corporate gifting enquiries welcome — pan-India delivery.', linkLabel: 'Enquire', linkUrl: '/contact', bg: '#8B0000', color: '#FFFDF8' },
    dock: { mobileEnquiry: true, mobileWhatsApp: true, desktopWhatsApp: true, desktopList: true },
    cookieText: '', photoWatermark: false, recentlyViewed: true
  }, 'seed');
  setSetting('commerce', {
    currency: 'INR', defaultPriceVisibility: 'Hide (Price on Request)',
    gstDefault: '18%', moqMessage: 'Minimum order quantity applies on this product.',
    leadTimeDefault: '2–4 weeks', pricingLabel: 'Wholesale Pricing', samplePolicy: 'Paid samples, adjusted against bulk order.'
  }, 'seed');
  setSetting('navbar', { showSearch: true, ctaLabel: 'Send Enquiry', ctaUrl: '/contact', listLabel: 'Enquiry List' }, 'seed');
  setSetting('footer', {
    tagline: 'Handcrafted homeware from Moradabad — wholesale, retail supply, corporate & return gifting.',
    columns: [
      { title: 'Explore', links: [{ label: 'Home', url: '/' }, { label: 'Products', url: '/products' }, { label: 'About Us', url: '/about' }, { label: 'Contact', url: '/contact' }] },
      { title: 'For Business', links: [{ label: 'Catalogue', url: '/catalogue/latest' }, { label: 'Send Enquiry', url: '/contact' }, { label: 'Enquiry List', url: '/enquiry-list' }] }
    ],
    contactBlock: true, showCatalogue: true,
    copyright: '© {year} MORA HOME. All rights reserved.',
    disclaimer: 'Prices shared on request. MORA HOME serves registered businesses, resellers and bulk buyers.',
    bg: '#3B2417'
  }, 'seed');
  setSetting('forms', {
    enquiry: [
      { key: 'name', label: 'Your Name', type: 'text', required: true, visible: true, placeholder: 'Full name', help: '' },
      { key: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: true, visible: true, placeholder: '+91 …', help: 'We respond fastest on WhatsApp.' },
      { key: 'email', label: 'Email', type: 'email', required: false, visible: true, placeholder: 'you@company.com', help: '' },
      { key: 'business', label: 'Business Name', type: 'text', required: false, visible: true, placeholder: 'Company / store name', help: '' },
      { key: 'city', label: 'City', type: 'text', required: false, visible: true, placeholder: 'City', help: '' },
      { key: 'quantity', label: 'Estimated Quantity', type: 'number', required: false, visible: true, placeholder: 'e.g. 100', help: '' },
      { key: 'message', label: 'Message', type: 'textarea', required: false, visible: true, placeholder: 'Tell us about your requirement', help: '' }
    ],
    contact: [
      { key: 'name', label: 'Your Name', type: 'text', required: true, visible: true, placeholder: 'Full name', help: '' },
      { key: 'phone', label: 'Phone', type: 'tel', required: true, visible: true, placeholder: '+91 …', help: '' },
      { key: 'email', label: 'Email', type: 'email', required: false, visible: true, placeholder: 'you@company.com', help: '' },
      { key: 'message', label: 'How can we help?', type: 'textarea', required: true, visible: true, placeholder: 'Write your message', help: '' }
    ],
    catalogue: [
      { key: 'name', label: 'Your Name', type: 'text', required: true, visible: true, placeholder: 'Full name', help: '' },
      { key: 'phone', label: 'Phone / WhatsApp', type: 'tel', required: true, visible: true, placeholder: '+91 …', help: '' },
      { key: 'email', label: 'Email', type: 'email', required: true, visible: true, placeholder: 'you@company.com', help: 'The catalogue download link works immediately; we also note your interest.' }
    ],
    sample: [
      { key: 'name', label: 'Your Name', type: 'text', required: true, visible: true, placeholder: 'Full name', help: '' },
      { key: 'phone', label: 'Phone', type: 'tel', required: true, visible: true, placeholder: '+91 …', help: '' },
      { key: 'quantity', label: 'Sample Quantity', type: 'number', required: false, visible: true, placeholder: 'e.g. 2', help: '' },
      { key: 'message', label: 'Notes', type: 'textarea', required: false, visible: true, placeholder: 'Finish, branding, delivery city…', help: '' }
    ]
  }, 'seed');
  setSetting('leads', { statuses: ['New', 'Contacted', 'Quoted', 'Negotiation', 'Won', 'Lost', 'Closed'] }, 'seed');
  setSetting('pdf', { showPrice: false, footer: 'MORA HOME · Moradabad, India · Prices on request · GST as applicable', includeContact: true }, 'seed');
  setSetting('advanced', { customCss: '' }, 'seed');

  // nav
  const nav = [['Home', '/'], ['Products', '/products'], ['Categories', '/products#categories'], ['About Us', '/about'], ['Contact', '/contact']];
  const insNav = db.prepare('INSERT INTO nav_items(label,url,sort,visible) VALUES(?,?,?,1)');
  nav.forEach(([l, u], i) => insNav.run(l, u, i));

  // attribute lists
  const lists = { material: 'Materials', ideal_for: 'Ideal For', order_type: 'Order Type', finish: 'Finish', business_type: 'Business Type' };
  const insL = db.prepare('INSERT INTO attribute_lists(key,name,sort) VALUES(?,?,?)');
  const insV = db.prepare('INSERT INTO attribute_values(list_id,value,sort) VALUES(?,?,?)');
  Object.entries(lists).forEach(([k, n], i) => {
    const { lastInsertRowid } = insL.run(k, n, i);
    const seedVals = {
      material: ['Steel', 'Iron', 'Brass', 'Wood', 'Aluminium'],
      ideal_for: ['Home', 'Hospitality', 'Gifting', 'Decor', 'Kitchen'],
      order_type: ['Ready Stock', 'Make to Order'],
      finish: ['Polished', 'Matte', 'Antique', 'Powder Coated', 'Natural'],
      business_type: ['Wholesalers', 'Retailers & Stockists', 'Bulk Buyers', 'Corporate Gifting', 'Return Gifting', 'Occasion & Festive Gifting']
    }[k];
    seedVals.forEach((v, j) => insV.run(lastInsertRowid, v, j));
  });

  // categories
  const cats = [
    ['Serveware', 'serveware', 'Trays, bowls, platters and tabletop serveware handcrafted in metal and wood.'],
    ['Kitchenware', 'kitchenware', 'Everyday and premium kitchen essentials in steel, brass and wood.'],
    ['Home Décor', 'home-decor', 'Decorative accents — votives, planters, wall pieces and statement objects.'],
    ['Barware', 'barware', 'Bar tools and accessories in polished metal finishes.']
  ];
  const insC = db.prepare('INSERT INTO categories(name,slug,description,sort,active,created_at) VALUES(?,?,?,?,1,?)');
  cats.forEach((c, i) => insC.run(c[0], c[1], c[2], i, now()));

  // demo products (text-only, no photography, clearly removable from Admin)
  const insP = db.prepare(`INSERT INTO products(code,name,slug,category_id,tagline,description,material,finish,ideal_for,order_type,packaging,moq,lead_time,status,published_at,is_new,demo,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const demos = [
    ['MH-1001', 'Hammered Brass Serving Tray', 'hammered-brass-serving-tray', 1, 'Hand-hammered brass tray for premium hospitality and gifting.', 'A hand-hammered brass serving tray made by Moradabad artisans. Suitable for hotels, restaurants, return gifting and festive hampers. Custom sizes and branding available on bulk orders.', 'Brass', 'Antique', 'Hospitality, Gifting', 'Make to Order', 'Bubble wrap + export carton', 50, '3–4 weeks', 1],
    ['MH-1002', 'Stainless Steel Bowl Set (5 pc)', 'stainless-steel-bowl-set-5pc', 2, 'Food-safe steel bowl set for retail and wholesale.', 'Five-piece stainless steel serving bowl set in mirror polish. Stackable, dishwasher-safe, ideal for retail shelves and promotional gifting.', 'Steel', 'Polished', 'Kitchen, Home', 'Ready Stock', 'Individual box + master carton', 100, '2–3 weeks', 1],
    ['MH-1003', 'Mango Wood & Iron Votive Holder', 'mango-wood-iron-votive-holder', 3, 'Warm wood-and-iron accent for decor buyers.', 'Mango wood base with handcrafted iron framework. A quiet, premium accent for homes, cafés and festive displays.', 'Wood, Iron', 'Natural', 'Decor, Gifting', 'Make to Order', 'Kraft wrap + carton', 75, '3–4 weeks', 1]
  ];
  demos.forEach(d => insP.run(d[0], d[1], d[2], d[3], d[4], d[5], d[6], d[7], d[8], d[9], d[10], d[11], d[12], 'published', now(), d[13], 1, now(), now()));

  // content tables
  const insF = db.prepare('INSERT INTO faqs(question,answer,sort,enabled) VALUES(?,?,?,1)');
  [
    ['What is your minimum order quantity (MOQ)?', 'MOQs vary by product — most items start at 50–100 pieces. The MOQ is listed on every product page.'],
    ['Do you offer custom branding or private label?', 'Yes. We support laser engraving, stickers and custom packaging for bulk and corporate gifting orders.'],
    ['What are your shipping and delivery timelines?', 'Ready-stock items dispatch in 7–10 working days; made-to-order products in 2–4 weeks. We ship pan-India and support export consolidation.'],
    ['What are your payment terms?', 'Standard terms are advance-based proforma for new buyers; flexible terms for repeat partners. GST invoice provided.'],
    ['Can I order samples?', 'Yes — paid samples are available for most products and the cost is adjusted against your first bulk order.'],
    ['Do you ship across India?', 'Yes. We deliver pan-India via road and courier partners, with export packing available.'],
    ['Which materials do you work with?', 'We work primarily in steel, iron, brass, wood and aluminium, all handcrafted in Moradabad.']
  ].forEach((f, i) => insF.run(f[0], f[1], i));

  const insS = db.prepare('INSERT INTO stats(label,value,auto_products,sort,enabled) VALUES(?,?,?,?,1)');
  [['Years of Craft Heritage', '15+', 0, 0], ['Products', '0', 1, 1], ['Cities Served', '120+', 0, 2], ['B2B Clients', '250+', 0, 3]]
    .forEach(s => insS.run(s[0], s[1], s[2], s[3]));

  // homepage sections with published config
  const sec = [
    ['hero', 'Hero', 0, {
      variant: 'centered', height: 'large', align: 'center', overlay: 40, bg: '#FBF9F4',
      heading: 'Handcrafted Homeware, Made in Moradabad',
      subheading: 'Wholesale, retail supply, corporate & return gifting in steel, iron, brass, wood and aluminium.',
      cta1Label: 'Browse Products', cta1Url: '/products', cta2Label: 'Send Enquiry', cta2Url: '/contact',
      showSearch: true, autoplay: true, interval: 5000, dots: true, pauseOnHover: true
    }],
    ['category-strip', 'Category Quick Links', 1, { heading: 'Browse by Category', variant: 'pills', width: 'wide', spacing: 'small', bg: 'cream' }],
    ['serve', 'Who We Serve', 2, {
      heading: 'Who We Serve', subheading: 'Built for buyers who order with intent.',
      variant: 'cards-3', width: 'wide', spacing: 'large', bg: 'white', align: 'center',
      items: [
        { icon: 'boxes', title: 'Wholesalers', text: 'Deep stock, honest pricing and reliable repeat runs.' },
        { icon: 'store', title: 'Retailers & Stockists', text: 'Shelf-ready packaging and fast replenishment.' },
        { icon: 'cart', title: 'Bulk Buyers', text: 'Made-to-order manufacturing at factory-direct rates.' },
        { icon: 'gift', title: 'Corporate Gifting', text: 'Branded hampers and keepsakes, delivered on schedule.' },
        { icon: 'return', title: 'Return Gifting', text: 'Elegant pieces for weddings and family occasions.' },
        { icon: 'festival', title: 'Occasion & Festive Gifting', text: 'Festive-ready designs in brass, wood and steel.' }
      ]
    }],
    ['range', 'Product Range', 3, { heading: 'Our Product Range', subheading: 'Categories handcrafted in our Moradabad workshops.', variant: 'grid', width: 'wide', spacing: 'large', bg: 'soft', align: 'left' }],
    ['featured', 'Featured Products', 4, { heading: 'Featured Products', subheading: 'Hand-picked for this season’s buyers.', width: 'wide', spacing: 'large', bg: 'white', max: 8 }],
    ['new', 'New Arrivals', 5, { heading: 'New Arrivals', subheading: 'Fresh from the workshop.', width: 'wide', spacing: 'large', bg: 'soft', max: 8, enabled: 1 }],
    ['why', 'Why MORA HOME', 6, {
      heading: 'Why MORA HOME', subheading: 'A manufacturing partner, not just a supplier.', variant: 'cards-3', width: 'wide', spacing: 'large', bg: 'white', align: 'center',
      items: [
        { icon: 'factory', title: 'Direct from the Manufacturer', text: 'No middle layers — you deal with the people who make it.' },
        { icon: 'hand', title: '100% Handcrafted Quality', text: 'Every piece passes artisan hands and a finishing bench.' },
        { icon: 'gift', title: 'Bulk & Gifting Ready', text: 'Custom branding, private label and hamper assembly.' },
        { icon: 'truck', title: 'Pan-India Delivery', text: 'Export-grade packing and dependable dispatch timelines.' },
        { icon: 'shield', title: 'Trusted B2B Partner', text: 'Transparent communication from sample to shipment.' },
        { icon: 'pencil', title: 'Custom Orders Welcome', text: 'Send a sketch or a reference — we will prototype it.' }
      ]
    }],
    ['steps', 'How to Order', 7, {
      heading: 'How to Order', subheading: 'A simple, human process.', variant: 'steps', width: 'medium', spacing: 'large', bg: 'soft',
      items: [
        { title: 'Browse & note product codes', text: 'Every piece carries an MH code — shortlist what you like.' },
        { title: 'Send enquiry / WhatsApp', text: 'Share codes, quantities and your city.' },
        { title: 'Receive quote & samples', text: 'We respond within one business day with pricing and sample options.' },
        { title: 'Production, packing & dispatch', text: 'Track your order from bench to box with a single point of contact.' }
      ]
    }],
    ['numbers', 'By the Numbers', 8, { heading: 'MORA HOME, by the Numbers', variant: 'counters', width: 'wide', spacing: 'medium', bg: 'walnut', align: 'center' }],
    ['about', 'About Us', 9, {
      heading: 'From the workshops of Moradabad', subheading: 'About MORA HOME', layout: 'text-left', width: 'wide', spacing: 'large', bg: 'white', imageId: null, align: 'left',
      text: 'MORA HOME brings together Moradabad’s metalworking heritage and a modern, quality-first production floor. We manufacture in steel, iron, brass, wood and aluminium for buyers who care about finish, consistency and honest timelines.\n\nEvery order — a 50-piece gifting run or a container of serveware — is handled by a named team member, photographed before dispatch and packed for Indian roads and international freight alike.',
      ctaLabel: 'More About Us', ctaUrl: '/about'
    }],
    ['gifting', 'Gifting Solutions', 10, {
      heading: 'Corporate & Return Gifting, Done Beautifully', subheading: 'Branded keepsakes, curated hampers and occasion-ready pieces — made, packed and delivered by one team.',
      ctaLabel: 'Plan Your Gifting', ctaUrl: '/contact?type=gifting', width: 'wide', spacing: 'large', bg: 'red', align: 'center', imageId: null
    }],
    ['trust', 'Trust & Clients', 11, { heading: 'Trusted by Businesses Across India', variant: 'logos', width: 'wide', spacing: 'medium', bg: 'white', align: 'center' }],
    ['testimonials', 'Testimonials', 12, { heading: 'What Our Buyers Say', variant: 'cards', width: 'wide', spacing: 'large', bg: 'soft', align: 'center' }],
    ['faq', 'FAQ', 13, { heading: 'Frequently Asked Questions', variant: 'accordion', width: 'medium', spacing: 'large', bg: 'white', align: 'left' }],
    ['contact', 'Contact', 14, { heading: 'Let’s Talk Business', subheading: 'Tell us what you are sourcing — we will respond within one business day.', variant: 'split', width: 'wide', spacing: 'large', bg: 'soft', align: 'left' }]
  ];
  const insH = db.prepare('INSERT INTO home_sections(key,name,sort,enabled,config,updated_at) VALUES(?,?,?,?,?,?)');
  sec.forEach(s => insH.run(s[0], s[1], s[2], s[3].enabled === 0 ? 0 : 1, JSON.stringify(s[3]), now()));

  // pages
  const insPg = db.prepare('INSERT INTO pages(title,slug,status,blocks,seo,created_at,updated_at) VALUES(?,?,?,?,?,?,?)');
  insPg.run('About Us', 'about', 'published', JSON.stringify([
    { type: 'heading', text: 'About MORA HOME', spacing: 'medium' },
    { type: 'paragraph', text: 'MORA HOME is a B2B homeware manufacturer from Moradabad, Uttar Pradesh — a city that has shaped metal for over a century. We craft serveware, kitchenware, décor and barware in steel, iron, brass, wood and aluminium for wholesalers, retailers, stockists, gifting companies and bulk buyers across India.' },
    { type: 'paragraph', text: 'We keep the relationship simple: honest MOQs, photographed quality checks, export-grade packing and one accountable contact for every order.' },
    { type: 'cta', heading: 'Work with a manufacturer who answers the phone', text: 'Share a product code, a reference photo or a rough idea — we will take it from there.', ctaLabel: 'Contact Us', ctaUrl: '/contact' }
  ]), JSON.stringify({ title: 'About MORA HOME — Moradabad B2B Homeware Manufacturer', description: 'Learn about MORA HOME, a handcrafted homeware manufacturer in Moradabad serving wholesale, retail and gifting buyers across India.' }), now(), now());
  insPg.run('Privacy Policy', 'privacy', 'published', JSON.stringify([
    { type: 'heading', text: 'Privacy Policy', spacing: 'medium' },
    { type: 'paragraph', text: 'MORA HOME (“we”, “us”) respects your privacy. We collect only the information needed to respond to business enquiries: your name, contact details, business name, city and message.' },
    { type: 'heading', text: 'How we use your information', spacing: 'small' },
    { type: 'paragraph', text: 'We use submitted details solely to respond to enquiries, share quotations and catalogues, and manage wholesale relationships. We do not sell or rent personal data. Enquiry records are stored securely and access is limited to our sales team.' },
    { type: 'heading', text: 'Your choices', spacing: 'small' },
    { type: 'paragraph', text: 'You may request correction or deletion of your data at any time by writing to writemora@gmail.com. This policy may be updated; the latest version will always be available on this page.' }
  ]), JSON.stringify({ title: 'Privacy Policy — MORA HOME', description: 'How MORA HOME collects and uses information from B2B enquiries.' }), now(), now());
  insPg.run('Terms of Use', 'terms', 'published', JSON.stringify([
    { type: 'heading', text: 'Terms of Use', spacing: 'medium' },
    { type: 'paragraph', text: 'This website is operated by MORA HOME, Moradabad, India, for business-to-business buyers. Product images, designs and content are the property of MORA HOME and may not be reused without written permission.' },
    { type: 'heading', text: 'Quotations & orders', spacing: 'small' },
    { type: 'paragraph', text: 'Prices are shared on request and confirmed by proforma invoice. Minimum order quantities, lead times and payment terms are confirmed per order. GST applies as per Indian law and is shown on invoices.' },
    { type: 'heading', text: 'Liability', spacing: 'small' },
    { type: 'paragraph', text: 'Handcrafted products may show minor, natural variations in finish and dimension — this is characteristic of the craft and not a defect. Claims for transit damage must be raised within 48 hours of delivery with photographs.' }
  ]), JSON.stringify({ title: 'Terms of Use — MORA HOME', description: 'Terms governing use of the MORA HOME B2B website and orders.' }), now(), now());

  audit(null, 'seed', 'system', 'initial seed');
}

module.exports = { db, DATA_DIR, now, getSetting, setSetting, audit, pushVersion, seedIfEmpty };
