/** MORA HOME — theme defaults + CSS variable builder (all values admin-editable). */
const DEFAULT_THEME = {
  bgPrimary: '#FFFDF8',
  bgSecondary: '#FBF9F4',
  bgSurface: '#FFFFFF',
  walnut: '#5C3D2E',
  walnutDark: '#3B2417',
  walnutLight: '#8A6A52',
  borderSubtle: '#E5DEC9',
  crimson: '#8B0000',
  crimsonHover: '#6E0000',
  textPrimary: '#1A1A1A',
  textMuted: '#66625B',
  waGreen: '#25D366',
  headingFont: 'Playfair Display',
  bodyFont: 'DM Sans',
  sizeScale: 100,          // 90 – 115
  cardRadius: 14,          // 0 – 24
  btnRadius: 8,            // 0 – 50
  spacing: 'normal',       // compact | normal | spacious
  mobileGridCols: 2,       // 1 | 2
  watermarkOn: true,
  watermarkOpacity: 8,     // 3 – 20 (%)
  logoMode: 'crest',       // crest | wordmark | both
  drawerBtn: 'walnut',     // 'walnut' | 'crimson' — sidebar/drawer button colour (2-colour option)
  redBorder: false,        // blood-red border master switch (OFF by default)
  borderTargets: ['buttons', 'cards', 'header'], // where to mark borders: buttons | cards | inputs | header | badges
};

const FONT_STACKS = {
  'Playfair Display': `"Playfair Display", Georgia, serif`,
  'Cormorant Garamond': `"Cormorant Garamond", Georgia, serif`,
  'DM Sans': `"DM Sans", "Segoe UI", Helvetica, sans-serif`,
  'Inter': `Inter, "Segoe UI", Helvetica, sans-serif`,
};

/** css2 specs per family — variable-weight ranges so real 600/700/800 weights load
    instead of the browser faking bold from a 400-only file (audit H4).
    Cormorant Garamond uses tuples because Google serves it as static weights. */
const FONT_SPECS = {
  'Playfair Display': 'Playfair+Display:ital,wght@0,400..900;1,400..900',
  'Cormorant Garamond': 'Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400;1,600',
  'DM Sans': 'DM+Sans:opsz,wght@9..40,300..800',
  'Inter': 'Inter:opsz,wght@14..32,300..800',
};

function fontLink(theme) {
  const fams = new Set();
  if (FONT_SPECS[theme.headingFont]) fams.add(theme.headingFont);
  if (FONT_SPECS[theme.bodyFont]) fams.add(theme.bodyFont);
  if (!fams.size) fams.add('Playfair Display');
  if (fams.size === 1 && ![...fams].includes('DM Sans') && ![...fams].includes('Inter')) fams.add('DM Sans');
  const q = [...fams].map((f) => FONT_SPECS[f]).join('&family=');
  return `https://fonts.googleapis.com/css2?family=${q}&display=swap`;
}

/** Contrast helper — returns ratio between two hex colours (for admin warnings). */
function luminance(hex) {
  const c = hex.replace('#', '');
  const v = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16) / 255)
    .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
}
function contrast(a, b) {
  const l1 = luminance(a), l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function cssVars(theme) {
  const spacingMap = { compact: '56px', normal: '84px', spacious: '112px' };
  const headStack = FONT_STACKS[theme.headingFont] || FONT_STACKS['Playfair Display'];
  const bodyStack = FONT_STACKS[theme.bodyFont] || FONT_STACKS['DM Sans'];
  return `
  --bg-primary:${theme.bgPrimary};
  --bg-secondary:${theme.bgSecondary};
  --bg-surface:${theme.bgSurface};
  --brand-walnut:${theme.walnut};
  --brand-walnut-dark:${theme.walnutDark};
  --brand-walnut-light:${theme.walnutLight};
  --border-subtle:${theme.borderSubtle};
  --accent-crimson:${theme.crimson};
  --accent-crimson-hover:${theme.crimsonHover};
  --text-primary:${theme.textPrimary};
  --text-muted:${theme.textMuted};
  --whatsapp-green:${theme.waGreen};
  --whatsapp-btn:#075E54;
  --whatsapp-btn-hover:#054a42;
  --font-serif:${headStack};
  --font-sans:${bodyStack};
  --size-scale:${(theme.sizeScale || 100) / 100};
  --card-radius:${theme.cardRadius}px;
  --btn-radius:${theme.btnRadius}px;
  --section-pad:${spacingMap[theme.spacing] || spacingMap.normal};
  --mobile-grid-cols:${theme.mobileGridCols === 1 ? 1 : 2};
  --watermark-opacity:${(theme.watermarkOn ? theme.watermarkOpacity : 0) / 100};
  --drawer-btn:${theme.drawerBtn === 'crimson' ? theme.crimson : theme.walnut};
  --drawer-btn-hover:${theme.drawerBtn === 'crimson' ? theme.crimsonHover : theme.walnutDark};
  --btn-border:${theme.redBorder ? '1.5px solid ' + theme.crimson : '1px solid transparent'};
  --btn-border-outline:${theme.redBorder ? '1.5px solid ' + theme.crimson : '1px solid ' + theme.walnut};
  `;
}

/** Merge a stored (possibly old) theme over the defaults so new keys always work. */
function withDefaults(t) { return Object.assign({}, DEFAULT_THEME, t || {}); }

module.exports = { DEFAULT_THEME, cssVars, fontLink, contrast, FONT_STACKS, withDefaults };
