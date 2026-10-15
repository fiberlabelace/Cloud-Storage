// HTTP Range Request Readers for ultra-fast thumbnail and preview extraction
// Fetches only ~500KB to 4MB instead of downloading massive 100MB files.

import { extractClipPreview } from './clipLayers';

/**
 * Extracts Resource 1036 JPEG thumbnail from the first ~512KB of a PSD file.
 * Returns null if not found in the initial slice.
 */
export async function fetchPsdThumbnailRange(url, maxBytes = 524288) {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${maxBytes - 1}` }
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 30) return null;

    const dv = new DataView(buf);
    const u = new Uint8Array(buf);

    if (dv.getUint32(0) !== 0x38425053) return null; // '8BPS'

    let o = 26;
    if (o + 4 > buf.byteLength) return null;
    const colorModeLen = dv.getUint32(o);
    o += 4 + colorModeLen;

    if (o + 4 > buf.byteLength) return null;
    const imgResLen = dv.getUint32(o);
    o += 4;

    const availableRes = Math.min(imgResLen, buf.byteLength - o);
    const r = new DataView(buf, o, availableRes);

    for (let p = 0; p + 12 <= availableRes;) {
      const sig = String.fromCharCode(r.getUint8(p), r.getUint8(p + 1), r.getUint8(p + 2), r.getUint8(p + 3));
      if (sig !== '8BIM') {
        p++;
        continue;
      }
      const id = r.getUint16(p + 4);
      const nl = 1 + r.getUint8(p + 6);
      let q = p + 6 + nl + (nl % 2);
      if (q + 4 > availableRes) break;
      const s = r.getUint32(q);
      q += 4;

      if (id === 1036 && q + 28 <= availableRes) {
        const format = r.getUint32(q);
        if (format === 1 && q + s <= availableRes) {
          const jpegSlice = u.slice(o + q + 28, o + q + s);
          return new Blob([jpegSlice], { type: 'image/jpeg' });
        }
      }
      p = q + s + (s % 2);
    }
  } catch (err) {
    console.warn('[rangeReader] PSD range thumbnail extraction warning:', err.message);
  }
  return null;
}

/**
 * Extracts CanvasPreview PNG from the SQLite chunk of a CLIP file using Range requests (~3-4MB)
 */
export async function fetchClipThumbnailRange(url, maxBytes = 4194304) {
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${maxBytes - 1}` }
    });
    if (!res.ok && res.status !== 206) return null;
    const buf = await res.arrayBuffer();
    return await extractClipPreview(buf);
  } catch (err) {
    console.warn('[rangeReader] CLIP range thumbnail extraction warning:', err.message);
    return null;
  }
}

