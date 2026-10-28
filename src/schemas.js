/**
 * MORA HOME — homepage section registry.
 * Each section has: key, name, icon, hint, fields[] (used by the Admin form generator)
 * and default content. Field types: text | textarea | image | select | repeater.
 * Repeater fields have their own sub-fields.
 */
const SECTIONS = [
  {
    key: 'hero', name: 'Hero Banner / Slider', icon: '🖼️',
    hint: 'The big banner at the top of the homepage. You can add up to 6 slides.',
    fields: [
      { key: 'slides', label: 'Slides (max 6)', type: 'repeater', max: 6, hint: 'Each slide = one banner. Drag the cards to reorder later versions.', fields: [
        { key: 'overline', label: 'Small overline text', type: 'text', hint: 'Example: MANUFACTURER & EXPORTER — MORADABAD' },
        { key: 'headline', label: 'Main headline', type: 'text', hint: 'Example: Handcrafted Metal & Wooden Homeware' },
        { key: 'subtitle', label: 'Subtitle', type: 'textarea', hint: 'One or two friendly sentences about your business.' },
        { key: 'cta1_text', label: 'Button 1 text', type: 'text', hint: 'Example: View Products' },
        { key: 'cta1_link', label: 'Button 1 link', type: 'text', hint: 'Example: /products' },
        { key: 'cta2_text', label: 'Button 2 text', type: 'text', hint: 'Example: WhatsApp Us' },
        { key: 'cta2_link', label: 'Button 2 link', type: 'text', hint: 'Example: /contact or a wa.me link' },
        { key: 'image', label: 'Slide image', type: 'image', hint: 'Leave empty to show the branded MORA HOME placeholder.' },
      ] },
    ],
    defaults: { slides: [
      { overline: 'MANUFACTURER & EXPORTER — MORADABAD', headline: 'Handcrafted Metal & Wooden Homeware, Direct from the Factory', subtitle: 'MORA HOME crafts brass, steel and wooden homeware for wholesalers, retailers and corporate gifting — wholesale pricing, custom branding and pan-India dispatch.', cta1_text: 'View Products', cta1_link: '/products', cta2_text: 'Get Wholesale Quote', cta2_link: '/contact', image: '' },
      { overline: 'FESTIVE & CORPORATE GIFTING', headline: 'Gift Sets That Carry Your Brand', subtitle: 'Brass diya hampers, dry-fruit trays and desk gift sets with branded sleeves and custom packaging — ready for Diwali, weddings and corporate events.', cta1_text: 'Explore Gifting', cta1_link: '/products?cat=corporate-gifting', cta2_text: 'Chat on WhatsApp', cta2_link: '/contact', image: '' },
    ] },
  },
  {
    key: 'audience', name: 'Who We Serve (B2B Audience)', icon: '🤝',
    hint: 'The grid of business types you supply.',
    fields: [
      { key: 'overline', label: 'Overline', type: 'text', hint: 'Small uppercase line above the heading.' },
      { key: 'heading', label: 'Main heading', type: 'text', hint: 'Example: Who We Serve' },
      { key: 'intro', label: 'Intro paragraph', type: 'textarea', hint: 'Explain that you sell B2B only.' },
      { key: 'cards', label: 'Audience cards', type: 'repeater', max: 12, fields: [
        { key: 'icon', label: 'Icon (emoji)', type: 'text', hint: 'Example: 🏬' },
        { key: 'title', label: 'Title', type: 'text', hint: 'Example: Wholesalers' },
        { key: 'desc', label: 'Short description', type: 'textarea', hint: 'One sentence.' },
      ] },
    ],
    defaults: {
      overline: 'B2B ONLY', heading: 'Who We Serve',
      intro: 'We supply businesses — not retail shoppers. Tell us your requirement and we’ll quote wholesale.',
      cards: [
        { icon: '🏬', title: 'Wholesalers', desc: 'Bulk factory pricing with consistent supply across seasons.' },
        { icon: '🛍️', title: 'Retailers & Stockists', desc: 'Curated ranges that move fast on retail shelves.' },
        { icon: '📦', title: 'Bulk Buyers', desc: 'Large-volume orders with clear lead times and QC.' },
        { icon: '🏢', title: 'Corporate Gifting', desc: 'Branded gift sets with sleeves, logos and packaging.' },
        { icon: '🎁', title: 'Return Gifting', desc: 'Elegant, budget-friendly return gifts for events & weddings.' },
        { icon: '🪔', title: 'Occasion & Festive Gifting', desc: 'Diwali, Eid, Christmas and wedding gifting catalogues.' },
      ],
    },
  },
  {
    key: 'categories', name: 'Our Product Range (Categories)', icon: '🗂️',
    hint: 'Category showcase grid. Categories themselves are managed in Admin → Categories.',
    fields: [
      { key: 'overline', label: 'Overline', type: 'text', hint: 'Example: HANDCRAFTED IN MORADABAD' },
      { key: 'heading', label: 'Main heading', type: 'text', hint: 'Example: Our Product Range' },
      { key: 'button_text', label: 'Card button text', type: 'text', hint: 'Example: View Products' },
    ],
    defaults: { overline: 'HANDCRAFTED IN MORADABAD', heading: 'Our Product Range', button_text: 'View Products' },
  },
  {
    key: 'featured', name: 'Featured Products', icon: '⭐',
    hint: 'Shows products marked as Featured in the Product Manager.',
    fields: [
      { key: 'overline', label: 'Overline', type: 'text', hint: 'Example: HANDPICKED' },
      { key: 'heading', label: 'Main heading', type: 'text', hint: 'Example: Featured Products' },
      { key: 'button_text', label: 'Bottom button text', type: 'text', hint: 'Example: View All Products →' },
      { key: 'button_link', label: 'Bottom button link', type: 'text', hint: 'Example: /products' },
    ],
    defaults: { overline: 'HANDPICKED', heading: 'Featured Products', button_text: 'View All Products →', button_link: '/products' },
  },
  {
    key: 'why', name: 'Why MORA HOME (Value Props)', icon: '💎',
    hint: 'The trust-building cards (manufacturer, handcrafted, bulk ready…).',
    fields: [
      { key: 'overline', label: 'Overline', type: 'text', hint: 'Example: THE MORA HOME DIFFERENCE' },
      { key: 'heading', label: 'Main heading', type: 'text', hint: 'Example: Why MORA HOME' },
      { key: 'cards', label: 'Value cards', type: 'repeater', max: 9, fields: [
        { key: 'icon', label: 'Icon key', type: 'select', options: ['factory', 'hand', 'gift', 'truck', 'tag', 'shield'], hint: 'A hand-drawn line icon shown at 36px.' },
        { key: 'title', label: 'Heading', type: 'text', hint: 'Example: Direct from the Manufacturer' },
        { key: 'desc', label: 'Description', type: 'textarea', hint: 'One or two sentences.' },
      ] },
    ],
    defaults: {
      overline: 'THE MORA HOME DIFFERENCE', heading: 'Why MORA HOME',
      cards: [
        { icon: 'factory', title: 'Direct from the Manufacturer', desc: 'No middlemen. Factory-gate wholesale pricing straight from our Moradabad workshop.' },
        { icon: 'hand', title: '100% Handcrafted Quality', desc: 'Every piece is hand-finished by skilled karigars and checked before packing.' },
        { icon: 'gift', title: 'Bulk & Gifting Ready', desc: 'Gift boxes, branded sleeves and custom packaging for corporate orders.' },
        { icon: 'truck', title: 'Pan-India Delivery', desc: 'Safe, insured dispatch to every state with trusted logistics partners.' },
        { icon: 'tag', title: 'Custom Branding & Private Label', desc: 'Your logo, your packaging — we manufacture under your brand too.' },
        { icon: 'shield', title: 'Trusted B2B Partner', desc: 'Clear quotations, honest lead times and responsive support on WhatsApp.' },
      ],
    },
  },
  {
    key: 'about', name: 'About & Craftsmanship Story', icon: '📖',
    hint: 'Your story, workshop photo and headline statistics.',
    fields: [
      { key: 'overline', label: 'Overline', type: 'text', hint: 'Example: OUR STORY' },
      { key: 'heading', label: 'Main heading', type: 'text', hint: 'Example: About MORA HOME' },
      { key: 'paragraphs', label: 'Story paragraphs', type: 'repeater', max: 5, fields: [
        { key: 'text', label: 'Paragraph', type: 'textarea', hint: 'One paragraph of your story.' },
      ] },
      { key: 'image', label: 'Workshop image', type: 'image', hint: 'Leave empty for the branded placeholder.' },
      { key: 'button_text', label: 'Button text', type: 'text', hint: 'Example: Learn More About Us' },
      { key: 'button_link', label: 'Button link', type: 'text', hint: 'Example: /about' },
      { key: 'stats', label: 'Statistics', type: 'repeater', max: 6, fields: [
        { key: 'value', label: 'Value', type: 'text', hint: 'Example: 25+' },
        { key: 'label', label: 'Label', type: 'text', hint: 'Example: Years of Legacy' },
      ] },
    ],
    defaults: {
      overline: 'OUR STORY', heading: 'About MORA HOME & Our Craftsmanship',
      paragraphs: [
        { text: 'MORA HOME is a manufacturer and exporter of handcrafted metal and wooden home products from Moradabad, Uttar Pradesh — India’s famous brass city. Our workshop blends generations-old karigari with modern quality control.' },
        { text: 'From kitchenware and serveware to pooja items and corporate gift sets, every product is shaped, polished and finished by hand, then packed to travel safely across India and overseas.' },
      ],
      image: '', button_text: 'Learn More About Us', button_link: '/about',
      stats: [
        { value: '25+', label: 'Years of Legacy' }, { value: '500+', label: 'Products' },
        { value: '120+', label: 'Cities Served' }, { value: '300+', label: 'B2B Clients' },
      ],
    },
  },
  {
    key: 'gifting', name: 'Corporate Gifting Banner (Red)', icon: '🎁',
    hint: 'The blood-red banner with the mandala watermark.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', hint: 'Example: Looking for Corporate or Festive Gifting Solutions?' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea', hint: 'One sentence about custom gift sets.' },
      { key: 'button_text', label: 'Button text', type: 'text', hint: 'Example: Get a Custom Quote' },
      { key: 'button_link', label: 'Button link', type: 'text', hint: 'Example: /contact' },
    ],
    defaults: {
      heading: 'Looking for Corporate or Festive Gifting Solutions?',
      subtitle: 'Custom gift sets in brass, steel and wood — branded sleeves, custom packaging and pan-India dispatch.',
      button_text: 'Get a Custom Quote', button_link: '/contact',
    },
  },
  {
    key: 'contact', name: 'Contact, Map & Quick Enquiry', icon: '📞',
    hint: 'Contact buttons, map and the inline enquiry form. Phone/email are edited in Admin → Contact & WhatsApp.',
    fields: [
      { key: 'heading', label: 'Heading', type: 'text', hint: 'Example: Talk to Us About Your Requirement' },
      { key: 'subtitle', label: 'Subtitle', type: 'textarea', hint: 'Example: Share your requirement — we reply within one working day.' },
    ],
    defaults: { heading: 'Talk to Us About Your Requirement', subtitle: 'Share your requirement — our team replies within one working day.' },
  },
];

const SECTION_MAP = Object.fromEntries(SECTIONS.map((s) => [s.key, s]));

function defaultsFor(key) {
  const s = SECTION_MAP[key];
  return s ? JSON.parse(JSON.stringify(s.defaults)) : {};
}

module.exports = { SECTIONS, SECTION_MAP, defaultsFor };
