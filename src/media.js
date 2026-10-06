// Media library: upload → validate → strip EXIF → responsive WebP/AVIF variants → blur placeholder
// Storage adapter kept behind a single interface so S3/Cloudinary can replace local disk later.
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db, DATA_DIR, now, audit } = require('./db');

let sharp = null;
try { sharp = require('sharp'); } catch (e) { console.warn('[media] sharp unavailable — storing originals only'); }

const ORIG_DIR = path.join(DATA_DIR, 'uploads', 'originals');
const VAR_DIR = path.join(DATA_DIR, 'uploads', 'variants');
const WIDTHS = [400, 800, 1200, 1800, 2400];
const AVIF_WIDTHS = [400, 800, 1200];
const MAX_BYTES = (parseInt(process.env.MAX_UPLOAD_MB, 10) || 12) * 1024 * 1024;
const ALLOWED = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/avif': '.avif', 'image/gif': '.gif', 'image/svg+xml': '.svg' };

function variantUrl(mediaId, format, width) { return `/media/v/${mediaId}/${width}.${format}`; }
function originalUrl(m) { return `/media/o/${path.basename(m.file)}`; }

async function processImage(buffer, { name, alt = '', tags = '', user = null, mediaId = null }) {
  const baseName = (name || 'image').toString().slice(0, 80);
  const clean = baseName.replace(/[^a-z0-9._-]+/gi, '-').toLowerCase() || 'image';
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${clean}`;

  const info = sharp ? await sharp(buffer, { failOn: 'none' }).rotate().metadata() : { width: 0, height: 0, format: 'unknown' };
  fs.writeFileSync(path.join(ORIG_DIR, fileName), buffer);

  let media;
  if (mediaId) { // replace-in-place: keep ID so every usage updates automatically
    db.prepare('UPDATE media_assets SET original_name=?, file=?, mime=?, size=?, width=?, height=? WHERE id=?')
      .run(baseName, fileName, info.format || 'unknown', buffer.length, info.width || 0, info.height || 0, mediaId);
    db.prepare('DELETE FROM media_variants WHERE media_id=?').run(mediaId);
    media = db.prepare('SELECT * FROM media_assets WHERE id=?').get(mediaId);
  } else {
    const r = db.prepare('INSERT INTO media_assets(name,original_name,file,mime,size,width,height,alt,tags,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
      .run(baseName, baseName, fileName, info.format || 'unknown', buffer.length, info.width || 0, info.height || 0, alt, tags, now(), user?.name || 'admin');
    media = db.prepare('SELECT * FROM media_assets WHERE id=?').get(r.lastInsertRowid);
  }

  if (sharp) {
    try {
      const src = sharp(buffer).rotate(); // strip metadata by re-encode
      // blur placeholder (tiny webp → data URI)
      const tiny = await sharp(buffer).rotate().resize(24, 24, { fit: 'inside' }).webp({ quality: 20 }).toBuffer();
      db.prepare('UPDATE media_assets SET blur=? WHERE id=?').run('data:image/webp;base64,' + tiny.toString('base64'), media.id);
      const insV = db.prepare('INSERT INTO media_variants(media_id,format,width,file) VALUES(?,?,?,?)');
      const widths = WIDTHS.filter(w => w <= Math.max(info.width || 0, 400)).concat([]);
      const uniq = [...new Set(widths.length ? widths : [400])];
      for (const w of uniq) {
        const wf = `m${media.id}-${w}.webp`;
        await sharp(buffer).rotate().resize({ width: w, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(VAR_DIR, wf));
        insV.run(media.id, 'webp', w, wf);
      }
      for (const w of AVIF_WIDTHS.filter(w => w <= Math.max(info.width || 0, 400))) {
        try {
          const af = `m${media.id}-${w}.avif`;
          await src.clone().resize({ width: w, withoutEnlargement: true }).avif({ quality: 55 }).toFile(path.join(VAR_DIR, af));
          insV.run(media.id, 'avif', w, af);
        } catch { /* avif optional */ }
      }
    } catch (e) { console.warn('[media] variant generation failed:', e.message); }
  }
  media = db.prepare('SELECT * FROM media_assets WHERE id=?').get(media.id);
  audit(user, mediaId ? 'replace' : 'upload', 'media', `#${media.id} ${media.original_name}`, null, { size: media.size });
  return media;
}

function mediaUrls(m) {
  if (!m) return null;
  const variants = db.prepare('SELECT format,width,file FROM media_variants WHERE media_id=? ORDER BY width').all(m.id);
  const webp = variants.filter(v => v.format === 'webp');
  const avif = variants.filter(v => v.format === 'avif');
  return {
    id: m.id, name: m.name, alt: m.alt || '', focal: m.focal || '50% 50%',
    original: originalUrl(m), width: m.width, height: m.height, size: m.size, blur: m.blur || '',
    src: webp.length ? variantUrl(m.id, 'webp', webp[webp.length - 1].width) : originalUrl(m),
    srcsetWebp: webp.map(v => `${variantUrl(m.id, 'webp', v.width)} ${v.width}w`).join(', '),
    srcsetAvif: avif.map(v => `${variantUrl(m.id, 'avif', v.width)} ${v.width}w`).join(', ')
  };
}

// where is this media used? (delete protection)
function mediaUsage(mediaId) {
  const uses = [];
  for (const r of db.prepare(`SELECT p.id, p.name FROM product_images pi JOIN products p ON p.id=pi.product_id WHERE pi.media_id=? AND p.deleted_at IS NULL`).all(mediaId))
    uses.push(`Product: ${r.name} (#${r.id})`);
  for (const r of db.prepare('SELECT id,name FROM categories WHERE image_id=? AND deleted_at IS NULL').all(mediaId))
    uses.push(`Category: ${r.name}`);
  for (const r of db.prepare('SELECT id,name FROM testimonials WHERE photo_id=?').all(mediaId))
    uses.push(`Testimonial: ${r.name}`);
  for (const r of db.prepare('SELECT id,label FROM trust_items WHERE media_id=?').all(mediaId))
    uses.push(`Trust item: ${r.label || '#' + r.id}`);
  for (const key of ['brand', 'seo']) {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
    if (row && new RegExp(`"(?:logoId|logoDarkId|faviconId|ogImageId|appIconId|watermarkId)":\\s*${mediaId}([,}])`).test(row.value))
      uses.push(`Site setting (${key})`);
  }
  for (const r of db.prepare('SELECT id,name,config,draft FROM home_sections').all()) {
    if (new RegExp(`"imageId":\\s*${mediaId}([,}])`).test(r.config) || (r.draft && new RegExp(`"imageId":\\s*${mediaId}([,}])`).test(r.draft)))
      uses.push(`Homepage section: ${r.name}`);
    // hero slides
    if (new RegExp(`"(?:image_id|mobile_image_id)":\\s*${mediaId}([,}])`).test(r.config) || (r.draft && new RegExp(`"(?:image_id|mobile_image_id)":\\s*${mediaId}([,}])`).test(r.draft)))
      uses.push(`Hero slide (homepage section: ${r.name})`);
  }
  return uses;
}

function deleteMediaDirs(media) {
  try { fs.unlinkSync(path.join(ORIG_DIR, media.file)); } catch { }
  for (const v of db.prepare('SELECT file FROM media_variants WHERE media_id=?').all(media.id)) {
    try { fs.unlinkSync(path.join(VAR_DIR, v.file)); } catch { }
  }
  db.prepare('DELETE FROM media_variants WHERE media_id=?').run(media.id);
}

const storageUsageBytes = () => {
  let total = 0;
  for (const dir of [ORIG_DIR, VAR_DIR, path.join(DATA_DIR, 'documents')]) {
    for (const f of fs.readdirSync(dir)) { try { total += fs.statSync(path.join(dir, f)).size; } catch { } }
  }
  return total;
};

module.exports = { processImage, mediaUrls, mediaUsage, deleteMediaDirs, storageUsageBytes, MAX_BYTES, ALLOWED, ORIG_DIR, VAR_DIR, variantUrl, originalUrl, sharp };
