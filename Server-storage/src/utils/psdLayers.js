import { parseClip, findSqliteDb } from './clipLayers.js';
export { parseClip, findSqliteDb };

// groups, opacity, blend modes, clipping flag, layer masks. No canvas needed here.
const BLEND = {
  norm: 'source-over',
  mul: 'multiply',
  scrn: 'screen',
  over: 'overlay',
  dark: 'darken',
  lite: 'lighten',
  div: 'color-dodge',
  idiv: 'color-burn',
  hLit: 'hard-light',
  sLit: 'soft-light',
  diff: 'difference',
  smud: 'exclusion',
  hue: 'hue',
  sat: 'saturation',
  colr: 'color',
  lum: 'luminosity',
  lddg: 'lighter',
};
export const blendOf = (key) => BLEND[key] || 'source-over';

const inflate = async (bytes) =>
  new Uint8Array(
    await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')),
    ).arrayBuffer(),
  );

async function decodeChannel(u, start, len, w, h, depth) {
  const by = depth / 8,
    rw = w * by;
  const comp = (u[start] << 8) | u[start + 1];
  const p = start + 2;
  let out;
  if (comp === 0) out = u.subarray(p, p + rw * h);
  else if (comp === 1) {
    out = new Uint8Array(rw * h);
    const dv = new DataView(u.buffer, u.byteOffset);
    let q = p + h * 2;
    for (let y = 0; y < h; y++) {
      const e = q + dv.getUint16(p + y * 2);
      let wr = y * rw;
      while (q < e) {
        const t = u[q++];
        if (t < 128) {
          for (let k = 0; k <= t; k++) out[wr++] = u[q++];
        } else if (t > 128) {
          const v = u[q++];
          for (let k = 0; k < 257 - t; k++) out[wr++] = v;
        }
      }
      q = e;
    }
  } else if (comp === 2 || comp === 3) {
    out = await inflate(u.subarray(p, start + len));
    if (comp === 3) {
      if (by === 1) {
        for (let y = 0; y < h; y++) {
          const b = y * rw;
          for (let x = 1; x < w; x++) out[b + x] = (out[b + x] + out[b + x - 1]) & 255;
        }
      } else {
        const v = new DataView(out.buffer, out.byteOffset, out.byteLength);
        for (let y = 0; y < h; y++)
          for (let x = 1; x < w; x++) {
            const o = (y * w + x) * 2;
            v.setUint16(o, (v.getUint16(o) + v.getUint16(o - 2)) & 65535);
          }
      }
    }
  } else throw new Error(`Unsupported channel compression ${comp}`);
  if (by === 2) {
    const r = new Uint8Array(w * h);
    for (let i = 0; i < r.length; i++) r[i] = out[i * 2];
    return r;
  }
  return out;
}

export const nodeBounds = (n) => {
  if (!n) return null;
  if (!n.isGroup) return n.w > 0 && n.h > 0 ? [n.left, n.top, n.left + n.w, n.top + n.h] : null;
  let b = null;
  (n.children || []).forEach((c) => {
    const cb = nodeBounds(c);
    if (cb)
      b = b
        ? [
            Math.min(b[0], cb[0]),
            Math.min(b[1], cb[1]),
            Math.max(b[2], cb[2]),
            Math.max(b[3], cb[3]),
          ]
        : cb;
  });
  return b;
};

/** @returns {{width,height,roots,nodes,byId}} roots/children are bottom -> top (draw order). */
export async function parsePsd(buf, onProgress = () => {}) {
  if (!buf || buf.byteLength < 4) throw new Error('File too short or empty');
  const dv = new DataView(buf),
    u = new Uint8Array(buf);
  const str = (o, n) => String.fromCharCode(...u.subarray(o, o + n));
  if (dv.getUint32(0) !== 0x38425053) {
    if ((u.length >= 8 && str(0, 8) === 'CSFCHUNK') || findSqliteDb(u)) {
      return parseClip(buf, onProgress);
    }
    throw new Error('Not a PSD or CLIP file');
  }

  if (dv.getUint16(4) !== 1) throw new Error('PSB (large document) is not supported');
  const H = dv.getUint32(14),
    W = dv.getUint32(18),
    depth = dv.getUint16(22),
    mode = dv.getUint16(24);
  if (mode !== 3 && mode !== 1) throw new Error('Only RGB / grayscale PSDs are supported');
  if (depth !== 8 && depth !== 16) throw new Error('Only 8 / 16 bit PSDs are supported');

  let o = 26;
  o += 4 + dv.getUint32(o);
  o += 4 + dv.getUint32(o);
  const lmLen = dv.getUint32(o);
  o += 4;
  if (!lmLen) throw new Error('This PSD has no layers');
  const liLen = dv.getUint32(o);
  o += 4;
  if (!liLen) throw new Error('This PSD has no layers');
  const count = Math.abs(dv.getInt16(o));
  o += 2;

  const recs = [];
  for (let i = 0; i < count; i++) {
    const r = {
      top: dv.getInt32(o),
      left: dv.getInt32(o + 4),
      bottom: dv.getInt32(o + 8),
      right: dv.getInt32(o + 12),
      channels: [],
    };
    o += 16;
    const nc = dv.getUint16(o);
    o += 2;
    for (let c = 0; c < nc; c++) {
      r.channels.push({ id: dv.getInt16(o), len: dv.getUint32(o + 2) });
      o += 6;
    }
    o += 4;
    r.blendKey = str(o, 4).trim();
    o += 4;
    r.opacity = u[o] / 255;
    r.clipping = u[o + 1];
    r.visible = !(u[o + 2] & 2);
    o += 4;
    const exEnd = o + 4 + dv.getUint32(o);
    o += 4;
    const mLen = dv.getUint32(o);
    o += 4;
    if (mLen >= 20)
      r.mask = {
        top: dv.getInt32(o),
        left: dv.getInt32(o + 4),
        bottom: dv.getInt32(o + 8),
        right: dv.getInt32(o + 12),
        def: u[o + 16],
        flags: u[o + 17],
      };
    o += mLen;
    o += 4 + dv.getUint32(o);
    const nl = u[o];
    r.name = str(o + 1, nl);
    o += 1 + nl;
    o += (4 - ((1 + nl) % 4)) % 4;
    while (o + 12 <= exEnd) {
      const sig = str(o, 4);
      if (sig !== '8BIM' && sig !== '8B64') {
        o++;
        continue;
      }
      const key = str(o + 4, 4),
        len = dv.getUint32(o + 8),
        d = o + 12;
      if (key === 'luni') {
        const n = dv.getUint32(d);
        let s = '';
        for (let k = 0; k < n; k++) s += String.fromCharCode(dv.getUint16(d + 4 + k * 2));
        r.name = s;
      } else if (key === 'lsct' || key === 'lsdk') r.section = dv.getUint32(d);
      o = d + len;
    }
    o = exEnd;
    recs.push(r);
  }

  // channel pixel data follows all records, in record order
  const nodes = [],
    byId = {};
  const stack = [{ children: [] }];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    const w = r.right - r.left,
      h = r.bottom - r.top;
    const node = {
      id: i,
      name: r.name,
      isGroup: false,
      visible: r.visible,
      opacity: r.opacity,
      blend: blendOf(r.blendKey),
      pass: r.blendKey === 'pass',
      clipping: !!r.clipping,
      left: r.left,
      top: r.top,
      w: Math.max(0, w),
      h: Math.max(0, h),
      rgba: null,
      children: [],
      open: true,
    };
    const planes = {};
    for (const ch of r.channels) {
      const isMask = ch.id === -2 || ch.id === -3;
      const cw = isMask ? (r.mask ? r.mask.right - r.mask.left : 0) : w;
      const chh = isMask ? (r.mask ? r.mask.bottom - r.mask.top : 0) : h;
      if (ch.id !== -3 && ch.len > 2 && cw > 0 && chh > 0 && !(r.section >= 1))
        planes[ch.id] = await decodeChannel(u, o, ch.len, cw, chh, depth);
      o += ch.len;
    }
    if (node.w > 0 && node.h > 0 && !(r.section >= 1) && (planes[0] || planes[1])) {
      const n = node.w * node.h,
        px = new Uint8ClampedArray(n * 4);
      const R = planes[0],
        G = mode === 1 ? planes[0] : planes[1],
        B = mode === 1 ? planes[0] : planes[2],
        A = planes[-1];
      for (let k = 0; k < n; k++) {
        px[k * 4] = R[k];
        px[k * 4 + 1] = G ? G[k] : R[k];
        px[k * 4 + 2] = B ? B[k] : R[k];
        px[k * 4 + 3] = A ? A[k] : 255;
      }
      if (planes[-2] && r.mask && !(r.mask.flags & 2)) {
        const m = r.mask,
          mw = m.right - m.left,
          mh = m.bottom - m.top;
        for (let y = 0; y < node.h; y++)
          for (let x = 0; x < node.w; x++) {
            const mx = x + node.left - m.left,
              my = y + node.top - m.top;
            const v = mx >= 0 && my >= 0 && mx < mw && my < mh ? planes[-2][my * mw + mx] : m.def;
            px[(y * node.w + x) * 4 + 3] = (px[(y * node.w + x) * 4 + 3] * v) / 255;
          }
      }
      node.rgba = px;
    }
    onProgress(i + 1, recs.length);

    // build the tree (records are listed bottom -> top)
    if (r.section === 3) {
      node.isGroup = true;
      stack.push(node);
      continue;
    }
    if (r.section === 1 || r.section === 2) {
      const g = stack.pop();
      Object.assign(g, {
        name: node.name,
        visible: node.visible,
        opacity: node.opacity,
        blend: node.blend,
        pass: node.pass,
        clipping: node.clipping,
        open: r.section === 1,
      });
      stack[stack.length - 1].children.push(g);
      nodes.push(g);
      byId[g.id] = g;
      continue;
    }
    stack[stack.length - 1].children.push(node);
    nodes.push(node);
    byId[node.id] = node;
  }

  const roots = stack[0].children;
  const walk = (list, parent, depthN) =>
    list.forEach((n) => {
      n.parent = parent;
      n.depth = depthN;
      if (n.isGroup) walk(n.children, n.id, depthN + 1);
    });
  walk(roots, null, 0);
  return { width: W, height: H, roots, nodes, byId };
}