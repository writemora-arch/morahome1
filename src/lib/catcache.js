/**
 * MORA HOME — in-memory catalogue PDF cache.
 * Generated catalogues are expensive (photos + pdfkit), so each variant is built
 * once and reused until its signature changes (products, cover file, or any
 * settings the PDF prints). Admin mutations call invalidate() so a price or
 * contact/watermark edit is guaranteed to appear in the NEXT downloaded PDF.
 */
const cache = new Map(); // key → { sig, buf, building }

function invalidate() { cache.clear(); }

module.exports = { cache, invalidate };
