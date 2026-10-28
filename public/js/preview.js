/* MORA HOME — preview bridge (runs inside the Admin live-preview iframe). */
(function () {
  'use strict';
  if (!document.body.dataset.preview) return;

  const STACKS = {
    'Playfair Display': '"Playfair Display", Georgia, serif',
    'Cormorant Garamond': '"Cormorant Garamond", Georgia, serif',
    'DM Sans': '"DM Sans", "Segoe UI", Helvetica, sans-serif',
    'Inter': 'Inter, "Segoe UI", Helvetica, sans-serif',
  };
  const SPACING = { compact: '56px', normal: '84px', spacious: '112px' };

  function applyTheme(t) {
    if (!t) return;
    const r = document.documentElement.style;
    const set = (k, v) => r.setProperty(k, v);
    set('--bg-primary', t.bgPrimary); set('--bg-secondary', t.bgSecondary); set('--bg-surface', t.bgSurface);
    set('--brand-walnut', t.walnut); set('--brand-walnut-dark', t.walnutDark); set('--brand-walnut-light', t.walnutLight);
    set('--border-subtle', t.borderSubtle); set('--accent-crimson', t.crimson); set('--accent-crimson-hover', t.crimsonHover);
    set('--text-primary', t.textPrimary); set('--text-muted', t.textMuted); set('--whatsapp-green', t.waGreen);
    set('--font-serif', STACKS[t.headingFont] || STACKS['Playfair Display']);
    set('--font-sans', STACKS[t.bodyFont] || STACKS['DM Sans']);
    set('--size-scale', (t.sizeScale || 100) / 100);
    set('--card-radius', (t.cardRadius || 0) + 'px');
    set('--btn-radius', (t.btnRadius || 0) + 'px');
    set('--section-pad', SPACING[t.spacing] || SPACING.normal);
    set('--mobile-grid-cols', String(t.mobileGridCols === 1 ? 1 : 2));
    set('--watermark-opacity', ((t.watermarkOn ? t.watermarkOpacity : 0) || 0) / 100);
    set('--drawer-btn', t.drawerBtn === 'crimson' ? t.crimson : t.walnut);
    set('--drawer-btn-hover', t.drawerBtn === 'crimson' ? t.crimsonHover : t.walnutDark);
    set('--btn-border', t.redBorder ? '1.5px solid ' + t.crimson : '1px solid transparent');
    set('--btn-border-outline', t.redBorder ? '1.5px solid ' + t.crimson : '1px solid ' + t.walnut);
    if (t.redBorder) document.body.dataset.borders = (t.borderTargets || ['buttons']).join(' ');
    else delete document.body.dataset.borders;
    const wm = document.querySelector('.gifting-watermark');
    if (wm) wm.style.display = t.watermarkOn ? '' : 'none';
  }

  window.addEventListener('message', (e) => {
    const d = e.data || {};
    if (d.type === 'mora-theme') applyTheme(d.theme);
  });

  /* click-to-edit: report the clicked editable element to the parent editor */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-edit]');
    if (el) {
      e.preventDefault(); e.stopPropagation();
      const [section, field] = (el.getAttribute('data-edit') || '').split('|');
      document.querySelectorAll('.mora-highlight').forEach((x) => x.classList.remove('mora-highlight'));
      el.classList.add('mora-highlight');
      parent.postMessage({ type: 'mora-edit', section, field: field || '' }, '*');
      return false;
    }
    const sec = e.target.closest('[data-edit-section]');
    if (sec && !e.target.closest('a, button, input, textarea, select, form, iframe')) {
      e.preventDefault();
      parent.postMessage({ type: 'mora-edit', section: sec.getAttribute('data-edit-section'), field: '' }, '*');
    }
  }, true);

  /* disable real submissions/links inside preview */
  document.addEventListener('submit', (e) => e.preventDefault(), true);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a');
    if (a && !a.getAttribute('href').startsWith('#')) e.preventDefault();
  }, false);

  parent.postMessage({ type: 'mora-preview-ready' }, '*');
})();
