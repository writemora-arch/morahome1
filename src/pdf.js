// Server-side A4 product spec-sheet PDF (pdfkit)
const path = require('path');
const fs = require('fs');
const { db, DATA_DIR, getSetting } = require('./db');
const { inr, fmtPhone } = require('./util');
const { ORIG_DIR } = require('./media');

async function buildSpecPdf(res, product) {
  const PDFDocument = require('pdfkit');
  const brand = getSetting('brand', {});
  const business = getSetting('business', {});
  const pdfCfg = getSetting('pdf', {});
  const walnut = '#3B2417', cream = '#FBF9F4';

  const doc = new PDFDocument({ size: 'A4', margin: 48 });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${product.code}-spec-sheet.pdf"`);
  doc.pipe(res);

  // logo
  if (brand.logoId) {
    try {
      const m = db.prepare('SELECT * FROM media_assets WHERE id=?').get(brand.logoId);
      if (m) {
        const p = path.join(ORIG_DIR, m.file);
        if (fs.existsSync(p)) doc.image(p, 48, 42, { height: 46 });
      }
    } catch { }
  }
  doc.fillColor(walnut).fontSize(10).text(business.name || 'MORA HOME', 200, 46, { align: 'right' });
  doc.fontSize(8).fillColor('#6B6B6B').text('Product Specification Sheet', { align: 'right' })
    .text(new Date().toLocaleDateString('en-IN'), { align: 'right' });
  doc.moveTo(48, 104).lineTo(547, 104).lineWidth(1).strokeColor('#D9CBBB').stroke();

  doc.moveDown(2);
  doc.fontSize(9).fillColor('#6B6B6B').text(product.code || '', 48, 116);
  doc.fontSize(22).fillColor(walnut).text(product.name || '', { width: 300 });

  // main image (re-encoded to png for embedding)
  const img = db.prepare('SELECT m.* FROM product_images pi JOIN media_assets m ON m.id=pi.media_id WHERE pi.product_id=? ORDER BY pi.sort LIMIT 1').get(product.id);
  if (img) {
    try {
      const { sharp } = require('./media');
      if (sharp) {
        const buf = await sharp(path.join(ORIG_DIR, img.file)).resize(360, 360, { fit: 'inside' }).png().toBuffer();
        doc.image(buf, 360, 116, { fit: [185, 185], align: 'center' });
      }
    } catch { }
  }
  const specs = [
    ['Category', product.category_name], ['Material', product.material], ['Grade', product.grade],
    ['Finish', product.finish], ['Thickness', product.thickness],
    ['Dimensions', product.dimensions], ['Weight', product.weight],
    ['Packaging', product.packaging], ['Ideal For', product.ideal_for],
    ['Gifting Suitability', product.gifting], ['Order Type', product.order_type],
    ['MOQ', product.moq ? product.moq + ' pcs' : ''], ['Lead Time', product.lead_time],
    ['GST', (product.gst || '') + (product.gst_included ? ' (included)' : ' (as applicable)')]
  ].filter(s => s[1]);
  let y = 220;
  doc.rect(48, y, 499, specs.length * 20 + 16).fill(cream);
  doc.fillColor(walnut);
  specs.forEach((s, i) => {
    const yy = y + 10 + i * 20;
    doc.fontSize(9).fillColor('#6B6B6B').text(s[0], 60, yy, { width: 140 });
    doc.fontSize(9).fillColor('#1A1A1A').text(s[1], 210, yy, { width: 320 });
  });
  y += specs.length * 20 + 28;

  if (pdfCfg.showPrice) {
    doc.fontSize(11).fillColor(walnut).text('Wholesale Pricing', 48, y);
    const tiers = db.prepare('SELECT qty, price FROM product_tiers WHERE product_id=? ORDER BY qty').all(product.id);
    if (product.price_mode === 'tiers' && tiers.length) tiers.forEach((t, i) => doc.fontSize(9).fillColor('#1A1A1A').text(`${t.qty}+ pcs — ${inr(t.price)} / pc`, 60, y + 16 + i * 14));
    else doc.fontSize(9).fillColor('#1A1A1A').text(inr(product.base_price) + ' / pc', 60, y + 16);
  } else {
    doc.fontSize(10).fillColor(walnut).text('Price on Request', 48, y);
  }

  const desc = (product.description || '').slice(0, 500);
  if (desc) { doc.fontSize(9).fillColor('#1A1A1A').text(desc, 48, Math.max(y + 40, doc.y + 10), { width: 499 }); }
  if (product.care) doc.fontSize(8).fillColor('#6B6B6B').text('Care: ' + product.care, { width: 499 });

  // footer
  const fy = 770;
  doc.moveTo(48, fy - 10).lineTo(547, fy - 10).lineWidth(0.5).strokeColor('#D9CBBB').stroke();
  const contact = pdfCfg.includeContact
    ? `${business.emailPrimary || ''}  ·  ${fmtPhone(business.phone)}  ·  morahome.in` : '';
  doc.fontSize(8).fillColor('#6B6B6B').text(pdfCfg.footer || '', 48, fy, { width: 499, align: 'center' });
  if (contact) doc.text(contact, { align: 'center' });
  doc.end();
}

module.exports = { buildSpecPdf };
