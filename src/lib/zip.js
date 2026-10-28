/** MORA HOME — minimal ZIP reader/writer for 1-click backup & restore (stored + deflate). */
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function readUInt32LE(b, o) { return b.readUInt32LE(o); }
function readUInt16LE(b, o) { return b.readUInt16LE(o); }

function unzipBuffer(buf) {
  // find End Of Central Directory
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (readUInt32LE(buf, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd === -1) throw new Error('Not a valid .zip backup file.');
  const count = readUInt16LE(buf, eocd + 10);
  let ptr = readUInt32LE(buf, eocd + 16);
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (readUInt32LE(buf, ptr) !== 0x02014b50) break;
    const method = readUInt16LE(buf, ptr + 10);
    const compSize = readUInt32LE(buf, ptr + 20);
    const nameLen = readUInt16LE(buf, ptr + 28);
    const extraLen = readUInt16LE(buf, ptr + 30);
    const commentLen = readUInt16LE(buf, ptr + 32);
    const localOff = readUInt32LE(buf, ptr + 42);
    const name = buf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');
    // local header
    const lNameLen = readUInt16LE(buf, localOff + 26);
    const lExtraLen = readUInt16LE(buf, localOff + 28);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.slice(dataStart, dataStart + compSize);
    let data = null;
    if (method === 0) data = raw;
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error('Unsupported zip compression method ' + method);
    if (!name.endsWith('/')) entries.push({ name, data });
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

module.exports = { unzipBuffer };

/* ---------- ZIP writer ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** entries: [{ name: 'path/in/zip', data: Buffer }] → zip Buffer (deflate). */
function createZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data);
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0, 6);           // flags
    local.writeUInt16LE(8, 8);           // method: deflate
    local.writeUInt16LE(0, 10);          // time
    local.writeUInt16LE(0x5481, 12);     // date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    chunks.push(local, nameBuf, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0x5481, 14);
    cen.writeUInt32LE(crc, 16);
    cen.writeUInt32LE(comp.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameBuf.length, 28);
    cen.writeUInt32LE(0, 30);            // extra len + comment len + disk
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);            // ext attrs
    cen.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cen, nameBuf]));
    offset += local.length + nameBuf.length + comp.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...chunks, centralBuf, eocd]);
}

/** Recursively collect a directory as zip entries under `prefix`. */
function zipDir(dir, prefix, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) zipDir(abs, name, out);
    else out.push({ name, data: fs.readFileSync(abs) });
  }
  return out;
}

module.exports = { unzipBuffer, createZip, zipDir };
