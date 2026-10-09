// Toàn bộ Paths SVG và dictionary màu/loại file trích xuất trực tiếp
export const P = {
  search: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z",
  add: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  folder: "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
  file: "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  image: "M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z",
  video: "M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z",
  dl: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  del: "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z",
  star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  starb: "M22 9.24l-7.19-.62L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21 12 17.27 18.18 21l-1.63-7.03L22 9.24zM12 15.4l-3.76 2.27 1-4.28-3.32-2.88 4.38-.38L12 6.1l1.71 4.04 4.38.38-3.32 2.88 1 4.28L12 15.4z",
  more: "M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z",
  x: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a.996.996 0 000-1.41l-2.34-2.34a.996.996 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  grid: "M3 3v8h8V3H3zm6 6H5V5h4v4zm-6 4v8h8v-8H3zm6 6H5v-4h4v4zm4-16v8h8V3h-8zm6 6h-4V5h4v4zm-6 4v8h8v-8h-8zm6 6h-4v-4h4v4z",
  drive: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 12H5V5h14v10zm-3 2h-2v2h2v-2zm-4 0H8v2h4v-2z",
  people: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  clock: "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
  up: "M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z",
  nf: "M20 6h-8l-2-2H4c-1.11 0-1.99.89-1.99 2L2 18c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-1 8h-3v3h-2v-3h-3v-2h3V9h2v3h3v2z",
  rest: "M13 3a9 9 0 00-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.954 8.954 0 0013 21a9 9 0 000-18z",
  copy: "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
  dd: "M7 10l5 5 5-5z",
  ok: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  menu: "M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z",
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  chev: "M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z",
  au: "M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z",
  eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  mv: "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6 12v-3h-4v-2h4V10l4 4-4 4z"
};

export const COL = {
  psd: '#31a8ff', clip: '#e91e63', folder: '#5f6368', image: '#d93025',
  video: '#d93025', audio: '#d93025', pdf: '#d93025', doc: '#4285f4',
  sheet: '#188038', zip: '#5f6368', text: '#5f6368', file: '#5f6368'
};

export const KL = {
  '': 'Any type', folder: 'Folders', image: 'Images', pdf: 'PDFs',
  doc: 'Documents', sheet: 'Spreadsheets', video: 'Videos', audio: 'Audio', zip: 'Archives'
};

export const NAV = [
  ['drive', 'My Drive', 'drive'],
  ['shared', 'Shared with me', 'people'],
  ['recent', 'Recent', 'clock'],
  ['starred', 'Starred', 'starb'],
  ['trash', 'Trash', 'del']
];

export const kind = (i) => {
  if (i.type === 'folder') return 'folder';
  const m = i.mime || '', n = (i.name || '').toLowerCase();
  if (/\.psd$/.test(n)) return 'psd';
  if (/\.(clip|csp)$/.test(n)) return 'clip';
  if (m.startsWith('image/') || /\.(avif|bmp|gif|jpe?g|png|svg|webp)$/.test(n)) return 'image';
  if (m.startsWith('video/') || /\.(avi|m4v|mkv|mov|mp4|mpeg|webm)$/.test(n)) return 'video';
  if (m.startsWith('audio/') || /\.(aac|flac|m4a|mp3|ogg|opus|wav)$/.test(n)) return 'audio';
  if (m === 'application/pdf' || /\.pdf$/.test(n)) return 'pdf';
  if (/\.(docx?|odt|pptx?)$/.test(n)) return 'doc';
  if (/\.(xlsx?|csv)$/.test(n)) return 'sheet';
  if (/\.(zip|rar|7z|tar|gz)$/.test(n)) return 'zip';
  if (m.startsWith('text/') || /\.(txt|md|json|js|css|html|xml|log)$/.test(n)) return 'text';
  return 'file';
};

export const icon = (k) => (k === 'psd' || k === 'clip' ? 'image' : (P[k] && k !== 'audio' && k !== 'pdf' ? k : 'file'));

export const sz = (b) => {
  if (b == null) return '—';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1073741824) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
};

export const dt = (t) => {
  const d = new Date(t), n = new Date();
  return d.toDateString() === n.toDateString()
    ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' });
};

// Thuật toán CRC32 và nén ZIP chuẩn nhị phân từ file gốc
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export const crc32 = (u) => {
  let c = ~0;
  for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 255] ^ (c >>> 8);
  return ~c >>> 0;
};

export async function zip(es) {
  const enc = new TextEncoder(), parts = [], cd = [];
  let off = 0;
  for (const e of es) {
    const d = new Uint8Array(await e.blob.arrayBuffer()), n = enc.encode(e.path), c = crc32(d), L = d.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x800, true);
    lh.setUint16(12, 0x21, true);
    lh.setUint32(14, c, true);
    lh.setUint32(18, L, true);
    lh.setUint32(22, L, true);
    lh.setUint16(26, n.length, true);
    parts.push(lh, n, d);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x800, true);
    ch.setUint16(14, 0x21, true);
    ch.setUint32(16, c, true);
    ch.setUint32(20, L, true);
    ch.setUint32(24, L, true);
    ch.setUint16(28, n.length, true);
    ch.setUint32(42, off, true);
    cd.push(ch, n);
    off += 30 + n.length + L;
  }
  const cs = cd.reduce((a, x) => a + (x.byteLength ?? x.length), 0);
  const ee = new DataView(new ArrayBuffer(22));
  ee.setUint32(0, 0x06054b50, true);
  ee.setUint16(8, es.length, true);
  ee.setUint16(10, es.length, true);
  ee.setUint32(12, cs, true);
  ee.setUint32(16, off, true);
  return new Blob([...parts, ...cd, ee], { type: 'application/zip' });
}

// Thuật toán parse file PSD nhị phân trực tiếp trong browser
export async function psd(b, full) {
  const rd = async (o, l) => new DataView(await b.slice(o, o + l).arrayBuffer());
  const h = await rd(0, 26);
  if (h.getUint32(0) !== 0x38425053) throw new Error('Not a PSD');
  const ver = h.getUint16(4), ch = h.getUint16(12), H = h.getUint32(14), W = h.getUint32(18), dep = h.getUint16(22), mode = h.getUint16(24);
  let o = 26;
  o += 4 + (await rd(o, 4)).getUint32(0);
  const ir = (await rd(o, 4)).getUint32(0);
  o += 4;
  let th = null;
  const r = await rd(o, ir);
  for (let p = 0; p + 12 <= ir;) {
    const id = r.getUint16(p + 4), nl = 1 + r.getUint8(p + 6);
    let q = p + 6 + nl + (nl % 2);
    const s = r.getUint32(q);
    q += 4;
    if (id === 1036 && r.getUint32(q) === 1) {
      th = new Blob([new Uint8Array(r.buffer, q + 28, s - 28)], { type: 'image/jpeg' });
      break;
    }
    p = q + s + (s % 2);
  }
  if (th && !full) return th;
  try {
    if (ver !== 1 || b.size > 2e8 || W * H > 6e7) throw new Error('PSD too large');
    o += ir;
    o += 4 + (await rd(o, 4)).getUint32(0);
    const cp = (await rd(o, 2)).getUint16(0);
    o += 2;
    if (cp > 1 || (dep !== 8 && dep !== 16)) throw new Error('Unsupported PSD format');
    const u = new Uint8Array(await b.slice(o).arrayBuffer()), by = dep / 8, rw = W * by, pl = [];
    let q = 0;
    if (cp === 0) {
      for (let c = 0; c < ch; c++) {
        pl.push(u.subarray(q, q + rw * H));
        q += rw * H;
      }
    } else {
      const cn = new DataView(u.buffer, u.byteOffset);
      q = 2 * H * ch;
      for (let c = 0; c < ch; c++) {
        const pp = new Uint8Array(rw * H);
        let w = 0;
        for (let y = 0; y < H; y++) {
          const e = q + cn.getUint16((c * H + y) * 2), z = w + rw;
          while (q < e) {
            const t = u[q++];
            if (t < 128) {
              for (let k = 0; k <= t; k++) pp[w++] = u[q++];
            } else if (t > 128) {
              const v = u[q++];
              for (let k = 0; k < 257 - t; k++) pp[w++] = v;
            }
          }
          q = e;
          w = z;
        }
        pl.push(pp);
      }
    }
    const g = (c, i) => pl[c][i * by], im = new ImageData(W, H), d = im.data;
    for (let i = 0; i < W * H; i++) {
      let R, G, B, A = 255;
      if (mode === 3 && ch >= 3) {
        R = g(0, i); G = g(1, i); B = g(2, i);
        if (ch === 4) A = g(3, i);
      } else if (mode === 1) {
        R = G = B = g(0, i);
        if (ch === 2) A = g(1, i);
      } else if (mode === 4 && ch >= 4) {
        const k = g(3, i);
        R = (g(0, i) * k) / 255; G = (g(1, i) * k) / 255; B = (g(2, i) * k) / 255;
      } else throw new Error('Unsupported mode');
      d[i * 4] = R; d[i * 4 + 1] = G; d[i * 4 + 2] = B; d[i * 4 + 3] = A;
    }
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.getContext('2d').putImageData(im, 0, 0);
    return await new Promise((f) => cv.toBlob(f, 'image/png'));
  } catch (e) {
    if (th) return th;
    throw e;
  }
}

// Thuật toán parse file Clip Studio Paint (.clip / .csp) tìm PNG chunk thumbnail
export async function clip(b) {
  if (b.size > 3e8) throw new Error('File too large');
  const u = new Uint8Array(await b.arrayBuffer());
  let best = null;
  for (let i = 0; i < u.length - 8; i++) {
    if (
      u[i] === 0x89 && u[i + 1] === 0x50 && u[i + 2] === 0x4e && u[i + 3] === 0x4f &&
      u[i + 4] === 13 && u[i + 5] === 10 && u[i + 6] === 26 && u[i + 7] === 10
    ) {
      let p = i + 8, ok = false;
      while (p + 12 <= u.length) {
        const l = ((u[p] << 24) | (u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3]) >>> 0;
        const t = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
        if (l > u.length) break;
        p += 12 + l;
        if (t === 'IEND') {
          ok = true;
          break;
        }
      }
      if (ok) {
        if (!best || p - i > best[1] - best[0]) best = [i, p];
        i = p - 1;
      }
    }
  }
  if (!best) throw new Error('No embedded preview found');
  return new Blob([u.slice(best[0], best[1])], { type: 'image/png' });
}

// Bộ nhớ cache thumbnail trong phiên làm việc
const TH = new Map();
export function getThumbnailUrl(i, full = false) {
  const key = i.id + (full ? 'f' : '');
  if (!TH.has(key)) {
    TH.set(
      key,
      (async () => {
        const k = kind(i);
        const b = k === 'psd' ? await psd(i.blob, full) : await clip(i.blob);
        return URL.createObjectURL(b);
      })().catch(() => null)
    );
  }
  return TH.get(key);
}