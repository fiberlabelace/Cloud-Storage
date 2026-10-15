const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const sharp = require('sharp');
const { readPsd, initializeCanvas } = require('ag-psd');

// Initialize ag-psd mock canvas without external node-canvas
initializeCanvas((w, h) => {
  const data = new Uint8ClampedArray(w * h * 4);
  return {
    width: w,
    height: h,
    data: data,
    getContext: () => ({
      createImageData: (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      getImageData: (sx, sy, sw, sh) => ({ width: sw, height: sh, data }),
      putImageData: (imgData) => { data.set(imgData.data); }
    })
  };
});

let STORAGE_DIR = path.resolve(__dirname, 'uploads');
let CACHE_BASE = path.join(STORAGE_DIR, '.preview_cache');

function setStorageDir(dir) {
  STORAGE_DIR = path.resolve(dir);
  CACHE_BASE = path.join(STORAGE_DIR, '.preview_cache');
  fs.mkdirSync(CACHE_BASE, { recursive: true });
}

function getCacheDir(fileName) {
  const hash = crypto.createHash('md5').update(fileName).digest('hex');
  const safeName = path.basename(fileName).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40);
  const dirName = `${hash}_${safeName}`;
  return path.join(CACHE_BASE, dirName);
}

function getFileType(fileName) {
  const lower = (fileName || '').toLowerCase();
  if (lower.endsWith('.psd')) return 'psd';
  if (lower.endsWith('.clip') || lower.endsWith('.csp')) return 'clip';
  if (/\.(jpe?g|png|webp|avif|gif|bmp)$/.test(lower)) return 'image';
  return 'other';
}

const BLEND_MAP = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'lighter',
  add: 'lighter',
  'pass through': 'source-over'
};

const CLIP_BLEND_MODES = {
  0: 'source-over', 1: 'darken', 2: 'multiply', 3: 'color-burn', 4: 'color-burn',
  5: 'difference', 6: 'darken', 7: 'lighten', 8: 'screen', 9: 'color-dodge',
  10: 'color-dodge', 11: 'lighter', 12: 'lighter', 13: 'lighten', 14: 'overlay',
  15: 'soft-light', 16: 'hard-light', 17: 'hard-light', 18: 'hard-light',
  19: 'hard-light', 20: 'hard-light', 21: 'difference', 22: 'exclusion',
  23: 'hue', 24: 'saturation', 25: 'color', 26: 'luminosity', 30: 'source-over'
};

/* =========================================================================
   PSD PROCESSING
========================================================================= */

async function processPsdFile(filePath, cacheDir) {
  const buf = await fs.promises.readFile(filePath);
  const psd = readPsd(buf, { skipCompositeImageData: false });
  const layersDir = path.join(cacheDir, 'layers');
  await fs.promises.mkdir(layersDir, { recursive: true });

  const width = psd.width;
  const height = psd.height;

  // 1. Composite preview & thumbnail
  let hasComposite = false;
  if (psd.canvas && psd.canvas.data) {
    const rawBuffer = Buffer.from(psd.canvas.data.buffer);
    const sharpInstance = sharp(rawBuffer, {
      raw: { width: psd.canvas.width, height: psd.canvas.height, channels: 4 }
    });

    await sharpInstance
      .clone()
      .webp({ quality: 85, effort: 4 })
      .toFile(path.join(cacheDir, 'preview.webp'));

    await sharpInstance
      .clone()
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 3 })
      .toFile(path.join(cacheDir, 'thumbnail.webp'));

    hasComposite = true;
  }

  // 2. Parse layer hierarchy and export cropped WebP for each content layer
  const nodes = [];
  const byId = {};
  let nextId = 0;

  async function processLayerList(list, parentId, depth) {
    const resultRoots = [];
    if (!list || !list.length) return resultRoots;

    for (const l of list) {
      const id = String(nextId++);
      const isGroup = Boolean(l.children && l.children.length > 0);
      const left = l.left ?? 0;
      const top = l.top ?? 0;
      const right = l.right ?? left;
      const bottom = l.bottom ?? top;
      const w = Math.max(0, right - left);
      const h = Math.max(0, bottom - top);
      const blendModeStr = (l.blendMode || 'normal').toLowerCase();
      const isPass = blendModeStr === 'pass through';
      const blend = BLEND_MAP[blendModeStr] || 'source-over';
      const opacity = typeof l.opacity === 'number' ? Math.max(0, Math.min(1, l.opacity)) : 1;
      const visible = !l.hidden;
      const clipping = Boolean(l.clipping);

      let hasImage = false;
      if (!isGroup && l.canvas && l.canvas.data && w > 0 && h > 0) {
        try {
          const layerBuf = Buffer.from(l.canvas.data.buffer);
          const layerWebpPath = path.join(layersDir, `${id}.webp`);
          await sharp(layerBuf, { raw: { width: w, height: h, channels: 4 } })
            .webp({ quality: 80, effort: 3 })
            .toFile(layerWebpPath);
          hasImage = true;
        } catch (err) {
          console.warn(`[preprocessor] Warning: failed to save WebP for layer ${id}:`, err.message);
        }
      }

      const node = {
        id,
        name: l.name || '(unnamed)',
        isGroup,
        visible,
        opacity,
        blend,
        pass: isPass,
        clipping,
        left,
        top,
        w,
        h,
        depth,
        parent: parentId,
        open: isGroup ? !(l.flags && (l.flags & 16)) : true,
        hasImage,
        children: []
      };

      if (isGroup) {
        node.children = await processLayerList(l.children, id, depth + 1);
      }

      nodes.push(node);
      byId[id] = node;
      resultRoots.push(node);
    }
    return resultRoots;
  }

  const roots = await processLayerList(psd.children || [], null, 0);

  const layersJson = {
    width,
    height,
    roots,
    nodes,
    byId,
    hasComposite
  };

  await fs.promises.writeFile(
    path.join(cacheDir, 'layers.json'),
    JSON.stringify(layersJson),
    'utf-8'
  );

  return layersJson;
}

/* =========================================================================
   CLIP STUDIO PAINT (.clip / .csp) PROCESSING
========================================================================= */

function readVarint(u, offset) {
  if (offset >= u.length) return [0, 0];
  let res = 0n;
  let len = 0;
  for (let i = 0; i < 8; i++) {
    if (offset + i >= u.length) break;
    const b = u[offset + i];
    len++;
    res = (res << 7n) | BigInt(b & 0x7f);
    if ((b & 0x80) === 0) return [Number(res), len];
  }
  if (offset + 8 < u.length) {
    const b = u[offset + 8];
    len++;
    res = (res << 8n) | BigInt(b);
  }
  return [Number(res), len];
}

function assemblePayload(db, pageSize, usableSize, cellPayloadStart, payloadSize) {
  const P = payloadSize;
  const U = usableSize;
  const maxLocal = U - 35;
  const minLocal = Math.floor(((U - 12) * 32) / 255) - 23;

  let localSize;
  if (P <= maxLocal) localSize = P;
  else {
    const surplus = minLocal + ((P - minLocal) % (U - 4));
    localSize = surplus <= maxLocal ? surplus : minLocal;
  }

  if (localSize >= P) return db.subarray(cellPayloadStart, cellPayloadStart + P);

  const payload = new Uint8Array(P);
  payload.set(db.subarray(cellPayloadStart, cellPayloadStart + localSize), 0);
  let written = localSize;
  const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
  if (cellPayloadStart + localSize + 4 > db.length) return payload;
  let nextOvf = dv.getUint32(cellPayloadStart + localSize);

  while (nextOvf > 0 && written < P) {
    const ovfPageOffset = (nextOvf - 1) * pageSize;
    if (ovfPageOffset + 4 > db.length) break;
    nextOvf = dv.getUint32(ovfPageOffset);
    const chunkLen = Math.min(U - 4, P - written);
    if (ovfPageOffset + 4 + chunkLen > db.length) break;
    payload.set(db.subarray(ovfPageOffset + 4, ovfPageOffset + 4 + chunkLen), written);
    written += chunkLen;
  }
  return payload;
}

function parseRecord(payload) {
  if (!payload || payload.length === 0) return [];
  let [headerSize, hLen] = readVarint(payload, 0);
  let p = hLen;
  const serialTypes = [];
  while (p < headerSize && p < payload.length) {
    const [st, stLen] = readVarint(payload, p);
    serialTypes.push(st);
    p += stLen;
  }

  let bodyOffset = headerSize;
  const cols = [];
  const dv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  for (const st of serialTypes) {
    if (st === 0) cols.push(null);
    else if (st === 1) { cols.push(payload[bodyOffset]); bodyOffset += 1; }
    else if (st === 2) { cols.push(dv.getInt16(bodyOffset)); bodyOffset += 2; }
    else if (st === 3) { cols.push((dv.getUint8(bodyOffset) << 16) | dv.getUint16(bodyOffset + 1)); bodyOffset += 3; }
    else if (st === 4) { cols.push(dv.getInt32(bodyOffset)); bodyOffset += 4; }
    else if (st === 5) { cols.push(Number(dv.getBigInt64(bodyOffset))); bodyOffset += 8; }
    else if (st === 6) { cols.push(dv.getFloat64(bodyOffset)); bodyOffset += 8; }
    else if (st === 7) { cols.push(0); }
    else if (st === 8) { cols.push(0); }
    else if (st === 9) { cols.push(1); }
    else if (st >= 12 && st % 2 === 0) {
      const len = (st - 12) / 2;
      cols.push(payload.subarray(bodyOffset, bodyOffset + len));
      bodyOffset += len;
    } else if (st >= 13 && st % 2 === 1) {
      const len = (st - 13) / 2;
      cols.push(new TextDecoder('utf-8').decode(payload.subarray(bodyOffset, bodyOffset + len)));
      bodyOffset += len;
    } else {
      cols.push(null);
    }
  }
  return cols;
}

function getTableRecords(db, startPage, pageSize, usableSize) {
  const records = [];
  const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
  const visited = new Set();

  function traverse(currPage) {
    if (!currPage || visited.has(currPage)) return;
    visited.add(currPage);
    const pageStart = (currPage - 1) * pageSize;
    if (pageStart + 8 > db.length) return;
    const headerStart = currPage === 1 ? pageStart + 100 : pageStart;
    const pageType = db[headerStart];

    if (pageType === 0x05) {
      const cellCount = dv.getUint16(headerStart + 3);
      const rightChild = dv.getUint32(headerStart + 8);
      for (let i = 0; i < cellCount; i++) {
        const ptrOffset = headerStart + 12 + i * 2;
        if (ptrOffset + 2 > db.length) break;
        const cellPtr = dv.getUint16(ptrOffset);
        const cellOffset = pageStart + cellPtr;
        if (cellOffset + 4 > db.length) break;
        const leftChild = dv.getUint32(cellOffset);
        traverse(leftChild);
      }
      traverse(rightChild);
    } else if (pageType === 0x0d) {
      const cellCount = dv.getUint16(headerStart + 3);
      for (let i = 0; i < cellCount; i++) {
        const ptrOffset = headerStart + 8 + i * 2;
        if (ptrOffset + 2 > db.length) break;
        const cellPtr = dv.getUint16(ptrOffset);
        let ptr = pageStart + cellPtr;
        if (ptr >= db.length) continue;
        const [payloadSize, psLen] = readVarint(db, ptr);
        ptr += psLen;
        const [rowid, rowidLen] = readVarint(db, ptr);
        ptr += rowidLen;

        const payload = assemblePayload(db, pageSize, usableSize, ptr, payloadSize);
        const cols = parseRecord(payload);
        records.push({ rowid, cols });
      }
    }
  }

  traverse(startPage);
  return records;
}

function parseColNames(sql) {
  if (!sql) return [];
  const startIdx = sql.indexOf('(');
  const endIdx = sql.lastIndexOf(')');
  if (startIdx < 0 || endIdx <= startIdx) return [];
  const inner = sql.slice(startIdx + 1, endIdx);
  const tokens = [];
  let depth = 0;
  let curr = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (ch === ',' && depth === 0) {
      tokens.push(curr.trim());
      curr = '';
      continue;
    }
    curr += ch;
  }
  if (curr.trim()) tokens.push(curr.trim());

  const constraintKeywords = new Set(['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE', 'CHECK']);
  const colNames = [];
  for (const token of tokens) {
    const parts = token.trim().split(/\s+/);
    if (!parts.length || !parts[0]) continue;
    const firstWord = parts[0].replace(/["`[\]]/g, '');
    if (constraintKeywords.has(firstWord.toUpperCase())) continue;
    colNames.push(firstWord);
  }
  return colNames;
}

function findSqliteDb(u) {
  let off = 24;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  while (off + 16 <= u.length) {
    const sig = String.fromCharCode(...u.subarray(off, off + 4));
    if (sig !== 'CHNK') break;
    const type = String.fromCharCode(...u.subarray(off + 4, off + 8));
    const len = dv.getUint32(off + 12);
    if (type === 'SQLi') {
      const end = Math.min(u.length, off + 16 + len);
      return u.subarray(off + 16, end);
    }
    if (len <= 0 || off + 16 + len > u.length) break;
    off += 16 + len;
  }

  const magic = [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00];
  for (let i = 0; i <= u.length - 16; i++) {
    let match = true;
    for (let j = 0; j < 16; j++) {
      if (u[i + j] !== magic[j]) { match = false; break; }
    }
    if (match) return u.subarray(i);
  }
  return null;
}

function matchUtf16BE(u, offset, str) {
  if (offset + str.length * 2 > u.length) return false;
  for (let i = 0; i < str.length; i++) {
    if (u[offset + i * 2] !== 0 || u[offset + i * 2 + 1] !== str.charCodeAt(i)) return false;
  }
  return true;
}

function parseChunkBlocks(d) {
  let ii = 0;
  let blockCount = 0;
  const bitmapBlocks = [];
  const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
  if (d.length < 46) return null;

  while (ii < d.length) {
    if (ii + 34 <= d.length && d[ii] === 0 && d[ii + 1] === 0 && d[ii + 2] === 0 && d[ii + 3] === 11 && matchUtf16BE(d, ii + 4, 'BlockStatus')) {
      const statusCount = dv.getUint32(ii + 30);
      const blockSize = statusCount * 4 + 12 + 26;
      ii += blockSize;
    } else if (ii + 34 <= d.length && d[ii] === 0 && d[ii + 1] === 0 && d[ii + 2] === 0 && d[ii + 3] === 13 && matchUtf16BE(d, ii + 4, 'BlockCheckSum')) {
      const blockSize = 30 + 12 + blockCount * 4;
      ii += blockSize;
    } else if (ii + 8 + 38 <= d.length && matchUtf16BE(d, ii + 8, 'BlockDataBeginChunk')) {
      const blockSize = dv.getUint32(ii);
      if (blockSize <= 0 || ii + blockSize > d.length) break;
      const blockStart = ii + 8 + 38;
      const endMarkerLen = 4 + 34;
      const blockEnd = ii + blockSize - endMarkerLen;

      if (blockEnd > blockStart + 28) {
        const block = d.subarray(blockStart, blockEnd);
        const bdv = new DataView(block.buffer, block.byteOffset, block.byteLength);
        const hasData = bdv.getUint32(16);
        if (hasData === 1) {
          bitmapBlocks.push(block.subarray(28));
        } else {
          bitmapBlocks.push(null);
        }
      } else {
        bitmapBlocks.push(null);
      }
      blockCount++;
      ii += blockSize;
    } else {
      break;
    }
  }
  return bitmapBlocks.length > 0 ? bitmapBlocks : null;
}

function parseExtaChunks(u) {
  const chunks = new Map();
  let off = 24;
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);

  while (off + 16 <= u.length) {
    const sig = String.fromCharCode(...u.subarray(off, off + 4));
    if (sig !== 'CHNK') break;
    const chunkType = String.fromCharCode(...u.subarray(off + 4, off + 8));
    const chunkLen = dv.getUint32(off + 12);
    const payloadStart = off + 16;
    const payloadEnd = payloadStart + chunkLen;

    if (chunkType === 'Exta' && payloadEnd <= u.length && chunkLen >= 16) {
      const nameLen = Number(dv.getBigUint64(payloadStart));
      const idStart = payloadStart + 8;
      if (nameLen >= 0 && idStart + nameLen + 8 <= payloadEnd) {
        const rawChunkId = new TextDecoder('ascii').decode(u.subarray(idStart, idStart + nameLen));
        const chunkId = rawChunkId.replace(/\0+$/, '');
        const binaryDataStart = idStart + nameLen + 8;
        const binaryData = u.subarray(binaryDataStart, payloadEnd);

        const blocks = parseChunkBlocks(binaryData);
        if (blocks) {
          chunks.set(chunkId, blocks);
          chunks.set(rawChunkId, blocks);
        }
      }
    }
    off = payloadEnd;
  }
  return chunks;
}

function parseOffscreenAttribute(attr) {
  if (!attr || attr.length < 54) return null;
  const dv = new DataView(attr.buffer, attr.byteOffset, attr.byteLength);
  let p = -1;
  for (let i = 0; i <= attr.length - 22; i++) {
    if (matchUtf16BE(attr, i, 'Parameter')) {
      p = i + 18;
      break;
    }
  }
  if (p < 0 || p + 16 > attr.length) p = 38;
  if (p + 16 > attr.length) return null;
  return {
    bitmapW: dv.getInt32(p),
    bitmapH: dv.getInt32(p + 4),
    gridW: dv.getInt32(p + 8),
    gridH: dv.getInt32(p + 12)
  };
}

function decompressTileSync(bytes) {
  try {
    return zlib.inflateSync(bytes);
  } catch {
    return zlib.inflateRawSync(bytes);
  }
}

function decodeClipLayerTilesSync(bitmapBlocks, gridW, gridH, bitmapW, bitmapH) {
  if (bitmapW <= 0 || bitmapH <= 0 || !bitmapBlocks || !bitmapBlocks.length) return null;
  const hasAnyBlock = bitmapBlocks.some((b) => b != null);
  if (!hasAnyBlock) return null;

  const rgba = Buffer.alloc(bitmapW * bitmapH * 4);

  for (let i = 0; i < gridH; i++) {
    for (let j = 0; j < gridW; j++) {
      const block = bitmapBlocks[i * gridW + j];
      if (!block) continue;
      let decompressed;
      try {
        decompressed = decompressTileSync(block);
      } catch {
        continue;
      }
      if (!decompressed || !decompressed.length) continue;
      const tw = Math.min(256, bitmapW - j * 256);
      const th = Math.min(256, bitmapH - i * 256);
      if (tw <= 0 || th <= 0) continue;

      if (decompressed.length >= 5 * 256 * 256) {
        for (let ty = 0; ty < th; ty++) {
          const dstY = i * 256 + ty;
          const dstRow = dstY * bitmapW;
          const srcRow = ty * 256;
          for (let tx = 0; tx < tw; tx++) {
            const p = srcRow + tx;
            const dstIdx = (dstRow + (j * 256 + tx)) * 4;
            rgba[dstIdx] = decompressed[65536 + p * 4 + 2];     // R
            rgba[dstIdx + 1] = decompressed[65536 + p * 4 + 1]; // G
            rgba[dstIdx + 2] = decompressed[65536 + p * 4];     // B
            rgba[dstIdx + 3] = decompressed[p];                 // A
          }
        }
      } else if (decompressed.length >= 4 * 256 * 256) {
        for (let ty = 0; ty < th; ty++) {
          const dstY = i * 256 + ty;
          const dstRow = dstY * bitmapW;
          const srcRow = ty * 256;
          for (let tx = 0; tx < tw; tx++) {
            const p = srcRow + tx;
            const dstIdx = (dstRow + (j * 256 + tx)) * 4;
            rgba[dstIdx] = decompressed[p * 4];
            rgba[dstIdx + 1] = decompressed[p * 4 + 1];
            rgba[dstIdx + 2] = decompressed[p * 4 + 2];
            rgba[dstIdx + 3] = decompressed[p * 4 + 3];
          }
        }
      } else if (decompressed.length >= 256 * 256) {
        for (let ty = 0; ty < th; ty++) {
          const dstY = i * 256 + ty;
          const dstRow = dstY * bitmapW;
          const srcRow = ty * 256;
          for (let tx = 0; tx < tw; tx++) {
            const p = srcRow + tx;
            const dstIdx = (dstRow + (j * 256 + tx)) * 4;
            const v = decompressed[p];
            rgba[dstIdx] = v;
            rgba[dstIdx + 1] = v;
            rgba[dstIdx + 2] = v;
            rgba[dstIdx + 3] = v;
          }
        }
      }
    }
  }

  return rgba;
}

async function processClipFile(filePath, cacheDir) {
  const buf = await fs.promises.readFile(filePath);
  const u = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
  const db = findSqliteDb(u);
  if (!db) throw new Error('Not a valid Clip Studio Paint SQLite container');

  const layersDir = path.join(cacheDir, 'layers');
  await fs.promises.mkdir(layersDir, { recursive: true });

  const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
  const rawPageSize = dv.getUint16(16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const usableSize = pageSize - db[20];

  const schemaRecords = getTableRecords(db, 1, pageSize, usableSize);
  const schemaMap = new Map();
  for (const rec of schemaRecords) {
    const type = rec.cols[0];
    const name = rec.cols[1];
    const rootPage = rec.cols[3];
    const sql = rec.cols[4];
    if (type === 'table' && name && rootPage) {
      schemaMap.set(name.toLowerCase(), { name, rootPage, colNames: parseColNames(sql) });
    }
  }

  function query(tbl) {
    const info = schemaMap.get(tbl.toLowerCase());
    if (!info) return [];
    return getTableRecords(db, info.rootPage, pageSize, usableSize).map((r) => {
      const obj = { _rowid: r.rowid };
      info.colNames.forEach((n, idx) => {
        obj[n] = r.cols[idx];
        obj[n.toLowerCase()] = r.cols[idx];
      });
      if (obj.MainId == null && obj.mainid == null) {
        obj.MainId = r.rowid;
        obj.mainid = r.rowid;
      }
      obj._cols = r.cols;
      return obj;
    });
  }

  // 1. CanvasPreview -> preview.webp & thumbnail.webp
  const previewRows = query('CanvasPreview');
  let hasComposite = false;
  for (const row of previewRows) {
    let imgData = row.ImageData || row.imagedata;
    if (!imgData && row._cols) {
      imgData = row._cols.find((c) => c instanceof Uint8Array && c.length > 8);
    }
    if (imgData && imgData.length > 8) {
      try {
        const sharpInstance = sharp(Buffer.from(imgData.buffer, imgData.byteOffset, imgData.byteLength));
        await sharpInstance
          .clone()
          .webp({ quality: 85, effort: 4 })
          .toFile(path.join(cacheDir, 'preview.webp'));

        await sharpInstance
          .clone()
          .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 80, effort: 3 })
          .toFile(path.join(cacheDir, 'thumbnail.webp'));

        hasComposite = true;
        break;
      } catch (err) {
        console.warn('[preprocessor] CanvasPreview convert warning:', err.message);
      }
    }
  }

  // 2. Query canvas and layers
  const canvasRows = query('Canvas');
  const canvasRow = canvasRows[0] || {};
  const width = canvasRow.CanvasWidth || canvasRow.canvaswidth || canvasRow.Width || canvasRow.width || 0;
  const height = canvasRow.CanvasHeight || canvasRow.canvasheight || canvasRow.Height || canvasRow.height || 0;
  const rootFolderId = canvasRow.CanvasRootFolder ?? canvasRow.canvasrootfolder ?? canvasRow.RootFolder ?? 0;

  const layerRows = query('Layer');
  const mipmapRows = query('Mipmap');
  const mipmapInfoRows = query('MipmapInfo');
  const offscreenRows = query('Offscreen');

  const layersById = new Map();
  layerRows.forEach((l) => {
    const id = l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid);
    if (id != null) { layersById.set(id, l); layersById.set(Number(id), l); }
  });

  const mipmapById = new Map();
  mipmapRows.forEach((m) => {
    const id = m.MainId != null ? m.MainId : (m.mainid != null ? m.mainid : m._rowid);
    if (id != null) { mipmapById.set(id, m); mipmapById.set(Number(id), m); }
  });

  const mipmapInfoById = new Map();
  mipmapInfoRows.forEach((mi) => {
    const id = mi.MainId != null ? mi.MainId : (mi.mainid != null ? mi.mainid : mi._rowid);
    if (id != null) { mipmapInfoById.set(id, mi); mipmapInfoById.set(Number(id), mi); }
  });

  const offscreenById = new Map();
  offscreenRows.forEach((o) => {
    const id = o.MainId != null ? o.MainId : (o.mainid != null ? o.mainid : o._rowid);
    if (id != null) { offscreenById.set(id, o); offscreenById.set(Number(id), o); }
  });

  const chunksMap = parseExtaChunks(u);

  function buildNode(l) {
    const folderVal = l.LayerFolder ?? l.layerfolder ?? 0;
    const firstChildVal = l.LayerFirstChildIndex ?? l.layerfirstchildindex ?? 0;
    const isGroup = folderVal !== 0 || firstChildVal > 0;
    const compositeVal = l.LayerComposite ?? l.layercomposite ?? 0;
    const blendKey = CLIP_BLEND_MODES[compositeVal] || 'source-over';
    const pass = compositeVal === 30;
    const opacityRaw = l.LayerOpacity ?? l.layeropacity ?? 256;
    const opacity = Math.max(0, Math.min(1, opacityRaw / 256));
    const visible = Boolean((l.LayerVisibility ?? l.layervisibility ?? 1) & 1);
    const clipping = Boolean(l.LayerClip ?? l.layerclip);
    const offX = (l.LayerOffsetX ?? l.layeroffsetx ?? 0) + (l.LayerRenderOffscrOffsetX ?? l.layerrenderoffscroffsetx ?? 0);
    const offY = (l.LayerOffsetY ?? l.layeroffsety ?? 0) + (l.LayerRenderOffscrOffsetY ?? l.layerrenderoffscroffsety ?? 0);

    const node = {
      id: String(l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid)),
      name: l.LayerName || l.layername || '(unnamed)',
      isGroup: Boolean(isGroup),
      visible,
      opacity,
      blend: pass ? 'source-over' : blendKey,
      pass,
      clipping,
      left: offX,
      top: offY,
      w: 0,
      h: 0,
      open: isGroup ? !(folderVal & 16) : true,
      hasImage: false,
      children: []
    };

    const renderMipmap = l.LayerRenderMipmap ?? l.layerrendermipmap;
    if (!isGroup && renderMipmap != null) {
      const m = mipmapById.get(renderMipmap) || mipmapById.get(Number(renderMipmap));
      const baseMipmapInfo = m ? (m.BaseMipmapInfo ?? m.basemipmapinfo) : null;
      const mi = baseMipmapInfo != null ? (mipmapInfoById.get(baseMipmapInfo) || mipmapInfoById.get(Number(baseMipmapInfo))) : null;
      const offscreenId = mi ? (mi.Offscreen ?? mi.offscreen) : null;
      const off = offscreenId != null ? (offscreenById.get(offscreenId) || offscreenById.get(Number(offscreenId))) : null;
      const attrData = off ? (off.Attribute || off.attribute) : null;
      const blockData = off ? (off.BlockData || off.blockdata) : null;
      if (attrData) {
        const attr = parseOffscreenAttribute(attrData);
        if (attr) {
          node.w = Math.max(0, attr.bitmapW);
          node.h = Math.max(0, attr.bitmapH);
          let blockKey = '';
          if (typeof blockData === 'string') {
            blockKey = blockData.replace(/\0+$/, '');
          } else if (blockData instanceof Uint8Array) {
            blockKey = new TextDecoder('ascii').decode(blockData).replace(/\0+$/, '');
          }
          node._blocks = chunksMap.get(blockKey) || chunksMap.get(blockData);
          node._attr = attr;
        }
      }
    }

    return node;
  }

  const visitedFolders = new Set();
  function getChildren(folderId) {
    if (folderId == null || visitedFolders.has(folderId)) return [];
    visitedFolders.add(folderId);
    const folder = layersById.get(folderId) || layersById.get(Number(folderId));
    if (!folder) return [];
    const children = [];
    let currId = folder.LayerFirstChildIndex ?? folder.layerfirstchildindex ?? 0;
    const seenSiblings = new Set();
    while (currId && (layersById.has(currId) || layersById.has(Number(currId))) && !seenSiblings.has(currId)) {
      seenSiblings.add(currId);
      const l = layersById.get(currId) || layersById.get(Number(currId));
      const node = buildNode(l);
      if (node.isGroup) node.children = getChildren(node.id);
      children.push(node);
      currId = l.LayerNextIndex ?? l.layernextindex ?? 0;
    }
    return children;
  }

  let effectiveRootFolderId = rootFolderId;
  if (!effectiveRootFolderId || (!layersById.has(effectiveRootFolderId) && !layersById.has(Number(effectiveRootFolderId)))) {
    const rootLayer = layerRows.find((l) => (l.LayerType ?? l.layertype) === 256);
    if (rootLayer) {
      effectiveRootFolderId = rootLayer.MainId ?? rootLayer.mainid ?? rootLayer._rowid;
    }
  }

  const roots = getChildren(effectiveRootFolderId);
  const nodes = [];
  const byId = {};

  function collectNodes(list) {
    for (const n of list) {
      if (!byId[n.id]) {
        byId[n.id] = n;
        nodes.push(n);
      }
      if (n.isGroup && n.children) collectNodes(n.children);
    }
  }
  collectNodes(roots);

  // Discovery fallback for candidate roots
  if (roots.length === 0 && layerRows.length > 0) {
    const childIds = new Set();
    layerRows.forEach((l) => {
      const next = l.LayerNextIndex ?? l.layernextindex;
      if (next) childIds.add(next);
      const first = l.LayerFirstChildIndex ?? l.layerfirstchildindex;
      if (first) childIds.add(first);
    });
    const rootCandidates = layerRows.filter((l) => {
      const id = l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid);
      return !childIds.has(id) && id !== effectiveRootFolderId && (l.LayerType ?? l.layertype) !== 256;
    });
    for (const l of rootCandidates) {
      const node = buildNode(l);
      if (node.isGroup) node.children = getChildren(node.id);
      roots.push(node);
    }
    collectNodes(roots);
  }

  // Include any layer not reached via root tree traversal
  for (const l of layerRows) {
    const id = String(l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid));
    const layerType = l.LayerType ?? l.layertype;
    if (id !== String(effectiveRootFolderId) && layerType !== 256 && !byId[id]) {
      const node = buildNode(l);
      if (node.isGroup) node.children = getChildren(id);
      roots.push(node);
      collectNodes([node]);
    }
  }

  const walk = (list, parent, depthN) =>
    list.forEach((n) => {
      n.parent = parent;
      n.depth = depthN;
      if (n.isGroup) walk(n.children, n.id, depthN + 1);
    });
  walk(roots, null, 0);

  // Export cropped WebP for content layers
  for (const n of nodes) {
    if (!n.isGroup && n._blocks && n._attr && n.w > 0 && n.h > 0) {
      try {
        const rawBuf = decodeClipLayerTilesSync(n._blocks, n._attr.gridW, n._attr.gridH, n.w, n.h);
        if (rawBuf) {
          const layerWebpPath = path.join(layersDir, `${n.id}.webp`);
          await sharp(rawBuf, { raw: { width: n.w, height: n.h, channels: 4 } })
            .webp({ quality: 80, effort: 3 })
            .toFile(layerWebpPath);
          n.hasImage = true;
        }
      } catch (err) {
        console.warn(`[preprocessor] Warning: failed to save WebP for CLIP layer ${n.id}:`, err.message);
      }
    }
    delete n._blocks;
    delete n._attr;
  }

  let finalW = width;
  let finalH = height;
  if (finalW <= 0 || finalH <= 0) {
    nodes.forEach((n) => {
      if (n.w && n.h) {
        finalW = Math.max(finalW, (n.left || 0) + n.w);
        finalH = Math.max(finalH, (n.top || 0) + n.h);
      }
    });
  }
  finalW = Math.max(1, finalW);
  finalH = Math.max(1, finalH);

  const layersJson = {
    width: finalW,
    height: finalH,
    roots,
    nodes,
    byId,
    hasComposite
  };

  await fs.promises.writeFile(
    path.join(cacheDir, 'layers.json'),
    JSON.stringify(layersJson),
    'utf-8'
  );

  return layersJson;
}

/* =========================================================================
   GENERIC IMAGE THUMBNAIL
========================================================================= */

async function processGenericImage(filePath, cacheDir) {
  await fs.promises.mkdir(cacheDir, { recursive: true });
  const thumbPath = path.join(cacheDir, 'thumbnail.webp');
  try {
    await sharp(filePath)
      .resize(256, 256, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 80, effort: 3 })
      .toFile(thumbPath);
    return thumbPath;
  } catch (err) {
    console.warn('[preprocessor] Failed to make generic image thumbnail:', err.message);
    return null;
  }
}

/* =========================================================================
   PUBLIC HIGH-LEVEL API & QUEUE
========================================================================= */

const processingQueue = [];
let isQueueRunning = false;
const activeJobs = new Map(); // fileName -> Promise

async function runQueue() {
  if (isQueueRunning) return;
  isQueueRunning = true;

  while (processingQueue.length > 0) {
    const job = processingQueue.shift();
    try {
      await job();
    } catch (err) {
      console.error('[preprocessor] Queue task failed:', err);
    }
  }

  isQueueRunning = false;
}

async function isCacheValid(filePath, targetFile) {
  try {
    const [statSrc, statTarget] = await Promise.all([
      fs.promises.stat(filePath),
      fs.promises.stat(targetFile)
    ]);
    return statTarget.size > 0 && statTarget.mtimeMs >= statSrc.mtimeMs;
  } catch {
    return false;
  }
}

async function preprocessFile(filePath, fileName) {
  const cacheDir = getCacheDir(fileName);
  await fs.promises.mkdir(cacheDir, { recursive: true });

  const type = getFileType(fileName);
  if (type === 'psd') {
    return processPsdFile(filePath, cacheDir);
  }
  if (type === 'clip') {
    return processClipFile(filePath, cacheDir);
  }
  if (type === 'image') {
    return processGenericImage(filePath, cacheDir);
  }
  return null;
}

function enqueue(filePath, fileName) {
  const key = `${filePath}::${fileName}`;
  if (activeJobs.has(key)) return activeJobs.get(key);

  const promise = new Promise((resolve, reject) => {
    processingQueue.push(async () => {
      try {
        console.log(`[preprocessor] Preprocessing: ${fileName}...`);
        const start = Date.now();
        const result = await preprocessFile(filePath, fileName);
        console.log(`[preprocessor] Done: ${fileName} in ${Date.now() - start}ms`);
        resolve(result);
      } catch (err) {
        console.error(`[preprocessor] Error processing ${fileName}:`, err);
        reject(err);
      } finally {
        activeJobs.delete(key);
      }
    });
    runQueue();
  });

  activeJobs.set(key, promise);
  return promise;
}

async function getOrGeneratePreview(filePath, fileName) {
  const cacheDir = getCacheDir(fileName);
  const previewPath = path.join(cacheDir, 'preview.webp');
  if (await isCacheValid(filePath, previewPath)) {
    return previewPath;
  }
  await enqueue(filePath, fileName);
  if (await isCacheValid(filePath, previewPath)) {
    return previewPath;
  }
  return null;
}

async function getOrGenerateThumbnail(filePath, fileName) {
  const cacheDir = getCacheDir(fileName);
  const thumbPath = path.join(cacheDir, 'thumbnail.webp');
  if (await isCacheValid(filePath, thumbPath)) {
    return thumbPath;
  }
  const type = getFileType(fileName);
  if (type === 'image') {
    return processGenericImage(filePath, cacheDir);
  }
  await enqueue(filePath, fileName);
  if (await isCacheValid(filePath, thumbPath)) {
    return thumbPath;
  }
  return null;
}

async function getOrGenerateLayers(filePath, fileName) {
  const cacheDir = getCacheDir(fileName);
  const jsonPath = path.join(cacheDir, 'layers.json');
  if (await isCacheValid(filePath, jsonPath)) {
    try {
      const data = await fs.promises.readFile(jsonPath, 'utf-8');
      return JSON.parse(data);
    } catch {}
  }
  await enqueue(filePath, fileName);
  if (await isCacheValid(filePath, jsonPath)) {
    const data = await fs.promises.readFile(jsonPath, 'utf-8');
    return JSON.parse(data);
  }
  return null;
}

async function getLayerImagePath(filePath, fileName, layerId) {
  const cacheDir = getCacheDir(fileName);
  const layerPath = path.join(cacheDir, 'layers', `${layerId}.webp`);
  if (await isCacheValid(filePath, layerPath)) {
    return layerPath;
  }
  await enqueue(filePath, fileName);
  if (await isCacheValid(filePath, layerPath)) {
    return layerPath;
  }
  return null;
}

async function cleanCache(fileName) {
  try {
    const cacheDir = getCacheDir(fileName);
    await fs.promises.rm(cacheDir, { recursive: true, force: true });
  } catch (err) {
    console.warn(`[preprocessor] Failed to clean cache for ${fileName}:`, err.message);
  }
}

async function renameCache(oldFileName, newFileName) {
  try {
    const oldDir = getCacheDir(oldFileName);
    const newDir = getCacheDir(newFileName);
    if (fs.existsSync(oldDir)) {
      await fs.promises.mkdir(path.dirname(newDir), { recursive: true });
      await fs.promises.rename(oldDir, newDir);
    }
  } catch (err) {
    console.warn(`[preprocessor] Failed to rename cache:`, err.message);
  }
}

module.exports = {
  setStorageDir,
  getCacheDir,
  getFileType,
  enqueue,
  preprocessFile,
  getOrGeneratePreview,
  getOrGenerateThumbnail,
  getOrGenerateLayers,
  getLayerImagePath,
  cleanCache,
  renameCache
};

