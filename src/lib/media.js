/** MORA HOME — media handling: square/focal crops + WebP optimisation via sharp (graceful fallback). */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { UPLOAD_DIR } = require('../db').paths;

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

async function saveImage(buffer, mimetype, subdir, focal = { x: 0.5, y: 0.5 }) {
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const name = crypto.randomBytes(8).toString('hex');
  let outPath, relPath;
  let converted = false;
  if (sharp) try {
    let pipeline = sharp(buffer).rotate();
    const meta = await pipeline.metadata();
    const w = meta.width, h = meta.height;
    if (w && h && w !== h) {
      // square crop around focal point
      const side = Math.min(w, h);
      const left = Math.max(0, Math.min(w - side, Math.round(focal.x * w - side / 2)));
      const top = Math.max(0, Math.min(h - side, Math.round(focal.y * h - side / 2)));
      pipeline = pipeline.extract({ left, top, width: side, height: side });
    }
    pipeline = pipeline.resize({ width: 1200, height: 1200, fit: 'cover' });
    outPath = path.join(dir, name + '.webp');
    await pipeline.webp({ quality: 82 }).toFile(outPath);
    relPath = `/uploads/${subdir}/${name}.webp`;
    converted = true;
  } catch (e) { console.error('[media] sharp failed, saving original:', e.message); }
  if (!converted) {
    const ext = (mimetype.split('/')[1] || 'jpg').replace(/[^a-z0-9]/gi, '').replace(/^jpeg$/, 'jpg') || 'jpg';
    outPath = path.join(dir, `${name}.${ext}`);
    fs.writeFileSync(outPath, buffer);
    relPath = `/uploads/${subdir}/${name}.${ext}`;
  }
  return relPath;
}

async function saveFile(buffer, subdir, filename) {
  const dir = path.join(UPLOAD_DIR, subdir);
  fs.mkdirSync(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const final = `${Date.now()}-${safe}`;
  fs.writeFileSync(path.join(dir, final), buffer);
  return `/uploads/${subdir}/${final}`;
}

function absFromRel(rel) { return path.join(UPLOAD_DIR, rel.replace(/^\/uploads\//, '')); }
function removeRel(rel) {
  if (!rel || !rel.startsWith('/uploads/')) return;
  try { fs.unlinkSync(absFromRel(rel)); } catch { /* already gone */ }
}

module.exports = { saveImage, saveFile, absFromRel, removeRel, hasSharp: !!sharp };
