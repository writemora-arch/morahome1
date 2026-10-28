/**
 * MORA HOME — automatic seed script.
 * Runs on first boot (empty DB) or manually: npm run seed  (--force wipes first).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const db = require('./db');
const { DEFAULT_THEME } = require('./theme');
const { SECTIONS } = require('./schemas');

const BRAND_SRC = path.join(__dirname, '..', 'assets', 'brand');

function hashPass(pass, salt) {
  return crypto.createHash('sha256').update(salt + ':' + pass).digest('hex');
}

const CATEGORIES = [
  { slug: 'kitchenware', name: 'Kitchenware', subtitle: 'Steel, aluminium & brass kitchen essentials', sort: 1 },
  { slug: 'home-decor', name: 'Home Décor', subtitle: 'Handfinished décor accents in metal & wood', sort: 2 },
  { slug: 'serveware-utensils', name: 'Serveware & Utensils', subtitle: 'Trays, bowls & serving sets for hosting', sort: 3 },
  { slug: 'pooja-items', name: 'Pooja Items', subtitle: 'Brass diyas, thalis & temple essentials', sort: 4 },
  { slug: 'corporate-gifting', name: 'Corporate Gifting', subtitle: 'Curated gift sets with custom branding', sort: 5 },
];

const PRODUCTS = [
  {
    code: 'MH-2017', name: 'Festive Diya & Tealight Hamper', badge: 'Diwali Gifting', category_slug: 'pooja-items',
    material: 'Brass', size: 'Box 30 × 22 × 10 cm', moq: '50 pcs', price: '₹1,249 / set', featured: 1,
    description: 'A festive hamper of hand-finished brass diyas and tealight holders, presented in a rigid gift box with sleeve. Ideal for Diwali corporate gifting and return gifting programmes.',
    specs: [
      { k: 'Grade', v: 'High-polish brass, lacquer protected' }, { k: 'Finish', v: 'Mirror polish with antique edges' },
      { k: 'Weight', v: '1.4 kg per set' }, { k: 'Care Instructions', v: 'Wipe with soft dry cloth; avoid abrasives' },
      { k: 'Packaging', v: 'Rigid box + branded sleeve (customisable)' }, { k: 'Lead Time', v: '12–15 days from order confirmation' },
      { k: 'GST', v: '18%' }, { k: 'Bulk Pricing Tiers', v: '50–99 pcs · 100–299 pcs · 300+ pcs (on request)' },
    ],
  },
  {
    code: 'MH-2020', name: 'Wooden Dry-Fruit Tray with Brass Bowls', badge: 'Best Seller', category_slug: 'serveware-utensils',
    material: 'Wood, Brass', size: 'Tray 28 × 28 × 6 cm', moq: '40 pcs', price: '₹1,850 / pc', featured: 1,
    description: 'A handcrafted mango-wood serving tray fitted with four removable brass bowls — a timeless centrepiece for festive hosting and premium gifting.',
    specs: [
      { k: 'Grade', v: 'Seasoned mango wood, food-safe lacquer' }, { k: 'Finish', v: 'Natural wood stain, polished brass' },
      { k: 'Weight', v: '1.1 kg' }, { k: 'Care Instructions', v: 'Hand wash bowls; wipe tray with damp cloth' },
      { k: 'Packaging', v: 'Bubble wrap + 5-ply export carton' }, { k: 'Lead Time', v: '10–12 days' },
      { k: 'GST', v: '18%' }, { k: 'Bulk Pricing Tiers', v: '40–99 pcs · 100+ pcs (on request)' },
    ],
  },
  {
    code: 'MH-2021', name: 'Brass & Steel Desk Gift Set', badge: 'Corporate Gifting', category_slug: 'corporate-gifting',
    material: 'Brass, Steel', size: 'Box 24 × 18 × 8 cm', moq: '100 pcs', price: '₹2,400–₹2,900', featured: 1,
    description: 'An executive desk set with brass pen stand, steel paper tray and card holder — delivered in a branded sleeve for corporate gifting calendars.',
    specs: [
      { k: 'Grade', v: 'Brass + food-grade stainless steel' }, { k: 'Finish', v: 'Brushed steel, gloss brass' },
      { k: 'Weight', v: '900 g' }, { k: 'Care Instructions', v: 'Dust with soft cloth' },
      { k: 'Packaging', v: 'Gift box + custom logo sleeve' }, { k: 'Lead Time', v: '15–18 days' },
      { k: 'GST', v: '18%' }, { k: 'Bulk Pricing Tiers', v: '100–249 pcs · 250+ pcs (on request)' },
    ],
  },
  {
    code: 'MH-2022', name: 'Mini Brass Diya Return Gift', badge: 'Occasion & Return Gifting', category_slug: 'pooja-items',
    material: 'Brass', size: 'Diya 6 × 6 × 3 cm', moq: '100 pcs', price: '₹149 / pc', featured: 1,
    description: 'A delicate mini brass diya packed in a organza pouch and keepsake box — the classic wedding and return-gifting favourite at bulk-friendly pricing.',
    specs: [
      { k: 'Grade', v: 'Solid brass, hand-spun' }, { k: 'Finish', v: 'Traditional polish' },
      { k: 'Weight', v: '85 g' }, { k: 'Care Instructions', v: 'Clean with lemon + salt occasionally' },
      { k: 'Packaging', v: 'Organza pouch + keepsake box' }, { k: 'Lead Time', v: '7–10 days' },
      { k: 'GST', v: '18%' }, { k: 'Bulk Pricing Tiers', v: '100–499 pcs · 500+ pcs (on request)' },
    ],
  },
  {
    code: 'MH-2023', name: 'Steel & Wood Serving Duo', badge: 'New Arrival', category_slug: 'kitchenware',
    material: 'Steel, Wood', size: 'Board 34 × 16 × 2 cm', moq: '60 pcs', price: '₹899–₹1,150', featured: 0,
    description: 'A stainless-steel serving board paired with a acacia-wood platter — designed for modern cafés, homeware retailers and gifting combos.',
    specs: [
      { k: 'Grade', v: 'SS-304 food grade + acacia wood' }, { k: 'Finish', v: 'Satin steel, oiled wood' },
      { k: 'Weight', v: '1.2 kg' }, { k: 'Care Instructions', v: 'Hand wash recommended' },
      { k: 'Packaging', v: 'Kraft box with insert' }, { k: 'Lead Time', v: '10 days' },
      { k: 'GST', v: '18%' }, { k: 'Bulk Pricing Tiers', v: '60–199 pcs · 200+ pcs (on request)' },
    ],
  },
  {
    code: 'MH-2024', name: 'Brass Keepsake Box', badge: 'Best Seller', category_slug: 'home-decor',
    material: 'Brass', size: 'Box 18 × 12 × 9 cm', moq: '50 pcs', price: '₹1,650 / pc', featured: 1,
    description: 'An heirloom-quality brass keepsake box with hand-etched lid motif — jewellery, pooja storage or a premium gift box for brands.',
    specs: [
      { k: 'Grade', v: 'Heavy-gauge brass sheet' }, { k: 'Finish', v: 'Hand-etched antique finish' },
      { k: 'Weight', v: '780 g' }, { k: 'Care Instructions', v: 'Keep dry; polish quarterly' },
      { k: 'Packaging', v: 'Velvet-lined box' }, { k: 'Lead Time', v: '12 days' },
      { k: 'GST', v: '18%' }, { k: 'Bulk Pricing Tiers', v: '50–149 pcs · 150+ pcs (on request)' },
    ],
  },
];

const FOOTER = {
  tagline: 'Crafted in Moradabad. Delivered Across India.',
  about_blurb: 'MORA HOME manufactures and exports handcrafted metal and wooden home products from Moradabad, India — serving wholesalers, retailers and corporate buyers with wholesale pricing and custom branding.',
  quick_links: [
    { label: 'Home', url: '/' }, { label: 'Products', url: '/products' }, { label: 'About Us', url: '/about' },
    { label: 'Contact', url: '/contact' }, { label: 'Wholesale Catalogue', url: '/catalogue/latest' },
  ],
  legal_links: [
    { label: 'Privacy Policy', url: '/privacy' }, { label: 'Terms & Conditions', url: '/terms' }, { label: 'Shipping Policy', url: '/shipping' },
  ],
  disclaimer: 'MORA HOME is a business-to-business (B2B) manufacturer. All enquiries are treated as wholesale trade enquiries; we do not sell single units to retail shoppers.',
  catalogue_heading: 'Request Our Wholesale Catalogue',
  catalogue_text: 'Get the latest wholesale price list and product catalogue as a PDF on WhatsApp or email.',
  catalogue_button: 'Request Now',
  /* audit M7/M8 — social profiles & registered-business line. Empty = hidden on the site.
     Owner fills these in Admin → Footer & Social Links. */
  socials: { instagram: '', facebook: '', linkedin: '', youtube: '', indiamart: '', whatsapp: '', google_business: '' },
  company_line: '',   // e.g. "MORA HOME (Prop. XYZ) · GSTIN: 09XXXXX1234X · Workshop: Street, Moradabad, UP 244001"
};

const CONTACT = {
  phone: '+91 8171246275',
  whatsapp: '918171246275',
  email1: 'writemora@gmail.com',
  email2: 'asktomora@gmail.com',
  address: 'Moradabad, Uttar Pradesh, India',
  mapLink: 'https://maps.google.com/?q=Moradabad,Uttar+Pradesh,India',
  mapEmbed: 'https://www.google.com/maps?q=Moradabad,Uttar+Pradesh,India&output=embed',
};

const SEO = {
  home_title: 'MORA HOME — Handcrafted Metal & Wooden Homeware Manufacturer, Moradabad',
  home_desc: 'B2B manufacturer & exporter of brass, steel and wooden home products from Moradabad. Wholesale pricing, custom branding, pan-India delivery.',
  products_title: 'Wholesale Product Catalogue — MORA HOME',
  products_desc: 'Browse kitchenware, home décor, serveware, pooja items and corporate gift sets. Search by product code (e.g. MH-2017). MOQ and specs listed.',
  about_title: 'About MORA HOME — Craftsmanship from Moradabad',
  about_desc: 'The story of MORA HOME, a handcrafted metal & wooden homeware workshop in Moradabad, India.',
  contact_title: 'Contact MORA HOME — Wholesale Enquiries',
  contact_desc: 'Call, email or WhatsApp MORA HOME for wholesale quotes, corporate gifting and catalogue requests.',
};

async function seed(force = false) {
  await db.open();
  const existing = db.get('SELECT COUNT(*) AS c FROM products');
  const hasSettings = db.get('SELECT COUNT(*) AS c FROM settings');
  if (!force && hasSettings && hasSettings.c > 0) { console.log('[seed] database already initialised — skipping.'); return; }
  if (force) {
    db.exec('DELETE FROM settings; DELETE FROM sections; DELETE FROM categories; DELETE FROM products; DELETE FROM product_images; DELETE FROM leads; DELETE FROM lead_notes;');
  }

  /* brand assets → live upload folder */
  for (const f of ['crest-transparent.png', 'crest-ivory.png', 'crest-512.png']) {
    const src = path.join(BRAND_SRC, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(db.paths.UPLOAD_DIR, 'brand', f));
  }
  /* designed catalogue cover page → live upload folder */
  const coverSrc = path.join(BRAND_SRC, 'catalogue-cover.pdf');
  if (fs.existsSync(coverSrc)) {
    const coverDir = path.join(db.paths.UPLOAD_DIR, 'catalogue-cover');
    fs.mkdirSync(coverDir, { recursive: true });
    fs.copyFileSync(coverSrc, path.join(coverDir, 'catalogue-cover.pdf'));
  }

  /* theme + settings */
  db.setSettingBoth('theme', DEFAULT_THEME);
  db.setSettingBoth('contact', CONTACT);
  db.setSettingBoth('seo', SEO);
  db.setSettingBoth('footer', FOOTER);
  db.setSettingBoth('whatsapp_template', 'Hello MORA HOME! I am {name} from {company}. I am interested in {product} (Code: {code}). Please share wholesale pricing and MOQ details.');
  db.setSettingBoth('brand', { crestPath: '/uploads/brand/crest-transparent.png', crestIvoryPath: '/uploads/brand/crest-ivory.png', wordmarkMode: 'text', siteName: 'MORA HOME', siteNameSub: 'HOME' });
  db.setSettingBoth('demo_mode', true);
  const salt = crypto.randomBytes(8).toString('hex');
  db.setSettingBoth('auth', { user: 'admin', salt, hash: hashPass('mora123', salt) });
  db.setSettingBoth('catalogue', { path: '', note: 'No catalogue uploaded yet — visitors will see a request form instead.' });
  db.setSettingBoth('catalogue_cover', fs.existsSync(path.join(BRAND_SRC, 'catalogue-cover.pdf'))
    ? { path: '/uploads/catalogue-cover/catalogue-cover.pdf', note: 'Designed cover page (Admin → Catalogue to replace or remove).' }
    : { path: '', note: '' });

  /* sections (draft + live identical at seed time) */
  SECTIONS.forEach((s, i) => {
    const j = JSON.stringify(s.defaults);
    db.run('INSERT INTO sections (key, name, draft_json, live_json, draft_visible, live_visible, draft_order, live_order) VALUES (?,?,?,?,1,1,?,?)',
      [s.key, s.name, j, j, i, i]);
  });

  /* categories */
  for (const c of CATEGORIES) db.run('INSERT INTO categories (slug, name, subtitle, sort, visible) VALUES (?,?,?,?,1)', [c.slug, c.name, c.subtitle, c.sort]);

  /* demo products */
  for (const p of PRODUCTS) {
    const r = db.run(`INSERT INTO products (code,name,badge,category_slug,material,size,moq,price,description,specs_json,price_on_request,featured,status,demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?,'published',1)`,
      [p.code, p.name, p.badge, p.category_slug, p.material, p.size, p.moq, p.price || '', p.description, JSON.stringify(p.specs), p.featured]);
    void r;
  }
  db.persist(true);
  console.log('[seed] ✔ MORA HOME database seeded with demo content.');
}

/** Re-add the sample demo products (used by Admin → Settings → Demo Data). */
function seedDemoProducts() {
  for (const c of CATEGORIES) {
    if (!db.get('SELECT id FROM categories WHERE slug = ?', [c.slug])) {
      db.run('INSERT INTO categories (slug, name, subtitle, sort, visible) VALUES (?,?,?,?,1)', [c.slug, c.name, c.subtitle, c.sort]);
    }
  }
  let added = 0;
  for (const p of PRODUCTS) {
    if (db.get('SELECT id FROM products WHERE code = ?', [p.code])) continue;
    db.run(`INSERT INTO products (code,name,badge,category_slug,material,size,moq,price,description,specs_json,price_on_request,featured,status,demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,?,'published',1)`,
      [p.code, p.name, p.badge, p.category_slug, p.material, p.size, p.moq, p.price || '', p.description, JSON.stringify(p.specs), p.featured]);
    added++;
  }
  db.setSettingBoth('demo_mode', true);
  db.persist(true);
  return added;
}

if (require.main === module) {
  seed(process.argv.includes('--force')).then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
}

module.exports = { seed, seedDemoProducts, hashPass };
