// Pure JavaScript Clip Studio Paint (.clip / .csp) parser and preview extractor.
// Decodes SQLite container, canvas dimensions, layer hierarchy, blend modes,
// clipping flags, opacity, and decompresses 256x256 layer raster tiles.

const CLIP_BLEND_MODES = {
  0: 'source-over', // Normal
  1: 'darken',      // Darken
  2: 'multiply',    // Multiply
  3: 'color-burn',  // Color Burn
  4: 'color-burn',  // Linear Burn
  5: 'difference',  // Subtract
  6: 'darken',      // Darker Color
  7: 'lighten',     // Lighten
  8: 'screen',      // Screen
  9: 'color-dodge', // Color Dodge
  10: 'color-dodge',// Glow Dodge
  11: 'lighter',    // Add
  12: 'lighter',    // Add (Glow)
  13: 'lighten',    // Lighter Color
  14: 'overlay',    // Overlay
  15: 'soft-light', // Soft Light
  16: 'hard-light', // Hard Light
  17: 'hard-light', // Vivid Light
  18: 'hard-light', // Linear Light
  19: 'hard-light', // Pin Light
  20: 'hard-light', // Hard Mix
  21: 'difference', // Difference
  22: 'exclusion',  // Exclusion
  23: 'hue',        // Hue
  24: 'saturation', // Saturation
  25: 'color',      // Color
  26: 'luminosity', // Luminosity
  30: 'source-over',// Pass Through (group pass = true)
};

export const clipBlendOf = (composite) => CLIP_BLEND_MODES[composite] || 'source-over';

const decompress = async (bytes) => {
  try {
    return new Uint8Array(
      await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')),
      ).arrayBuffer(),
    );
  } catch {
    return new Uint8Array(
      await new Response(
        new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')),
      ).arrayBuffer(),
    );
  }
};

/* ---- SQLite 3 Pure JS Reader ---- */

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
  if (P <= maxLocal) {
    localSize = P;
  } else {
    const surplus = minLocal + ((P - minLocal) % (U - 4));
    localSize = surplus <= maxLocal ? surplus : minLocal;
  }

  if (localSize >= P) {
    return db.subarray(cellPayloadStart, cellPayloadStart + P);
  }

  const payload = new Uint8Array(P);
  payload.set(db.subarray(cellPayloadStart, cellPayloadStart + localSize), 0);
  let written = localSize;
  const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
  if (cellPayloadStart + localSize + 4 > db.length) return payload;
  let nextOvf = dv.getUint32(cellPayloadStart + localSize);

  while (nextOvf > 0 && written < P) {
    const ovfStart = (nextOvf - 1) * pageSize;
    if (ovfStart + 4 > db.length) break;
    const next = dv.getUint32(ovfStart);
    const chunkLen = Math.min(P - written, U - 4);
    payload.set(db.subarray(ovfStart + 4, ovfStart + 4 + chunkLen), written);
    written += chunkLen;
    nextOvf = next;
  }
  return payload;
}

function parseRecord(payload) {
  const [headerLen, hlVarintSize] = readVarint(payload, 0);
  const serialTypes = [];
  let off = hlVarintSize;
  while (off < headerLen && off < payload.length) {
    const [st, stLen] = readVarint(payload, off);
    if (stLen <= 0) break;
    serialTypes.push(st);
    off += stLen;
  }

  let dataOff = headerLen;
  const values = [];
  const pdv = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  for (const st of serialTypes) {
    if (st === 0) {
      values.push(null);
    } else if (st === 1) {
      values.push(dataOff < payload.length ? pdv.getInt8(dataOff) : null);
      dataOff += 1;
    } else if (st === 2) {
      values.push(dataOff + 2 <= payload.length ? pdv.getInt16(dataOff) : null);
      dataOff += 2;
    } else if (st === 3) {
      if (dataOff + 3 <= payload.length) {
        let v = (payload[dataOff] << 16) | (payload[dataOff + 1] << 8) | payload[dataOff + 2];
        if (v & 0x800000) v |= 0xff000000;
        values.push(v);
      } else {
        values.push(null);
      }
      dataOff += 3;
    } else if (st === 4) {
      values.push(dataOff + 4 <= payload.length ? pdv.getInt32(dataOff) : null);
      dataOff += 4;
    } else if (st === 5) {
      if (dataOff + 6 <= payload.length) {
        const hi = pdv.getInt16(dataOff);
        const lo = pdv.getUint32(dataOff + 2);
        values.push(hi * 4294967296 + lo);
      } else {
        values.push(null);
      }
      dataOff += 6;
    } else if (st === 6) {
      values.push(dataOff + 8 <= payload.length ? Number(pdv.getBigInt64(dataOff)) : null);
      dataOff += 8;
    } else if (st === 7) {
      values.push(dataOff + 8 <= payload.length ? pdv.getFloat64(dataOff) : null);
      dataOff += 8;
    } else if (st === 8) {
      values.push(0);
    } else if (st === 9) {
      values.push(1);
    } else if (st >= 12 && st % 2 === 0) {
      const len = (st - 12) / 2;
      values.push(payload.subarray(dataOff, dataOff + len));
      dataOff += len;
    } else if (st >= 13 && st % 2 === 1) {
      const len = (st - 13) / 2;
      const s = new TextDecoder('utf-8').decode(payload.subarray(dataOff, dataOff + len));
      values.push(s);
      dataOff += len;
    } else {
      values.push(null);
    }
  }
  return values;
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

function parseSchema(db, pageSize, usableSize) {
  const schemaRecords = getTableRecords(db, 1, pageSize, usableSize);
  const schemaMap = new Map();

  for (const rec of schemaRecords) {
    const type = rec.cols[0];
    const name = rec.cols[1];
    const rootPage = rec.cols[3];
    const sql = rec.cols[4];
    if (type === 'table' && name && rootPage) {
      const colNames = parseColNames(sql);
      schemaMap.set(name.toLowerCase(), { name, rootPage, colNames });
    }
  }
  return schemaMap;
}

function queryTable(db, schemaMap, tableName, pageSize, usableSize) {
  const info = schemaMap.get(tableName.toLowerCase());
  if (!info) return [];
  const records = getTableRecords(db, info.rootPage, pageSize, usableSize);
  return records.map((r) => {
    const obj = { _rowid: r.rowid };
    info.colNames.forEach((name, idx) => {
      obj[name] = r.cols[idx];
      obj[name.toLowerCase()] = r.cols[idx];
    });
    if (obj.MainId == null && obj.mainid == null && r.rowid != null) {
      obj.MainId = r.rowid;
      obj.mainid = r.rowid;
    }
    obj._cols = r.cols;
    return obj;
  });
}

export function findSqliteDb(u) {
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

  // Fallback: search for SQLite format 3\0 magic header
  const magic = [0x53, 0x51, 0x4C, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6F, 0x72, 0x6D, 0x61, 0x74, 0x20, 0x33, 0x00];
  for (let i = 0; i <= u.length - 16; i++) {
    let match = true;
    for (let j = 0; j < 16; j++) {
      if (u[i + j] !== magic[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      return u.subarray(i);
    }
  }
  return null;
}

/* ---- CLIP Exta Chunks Parser ---- */

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
          const subblockData = block.subarray(28);
          bitmapBlocks.push(subblockData);
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
  if (p < 0 || p + 16 > attr.length) {
    p = 38;
  }
  if (p + 16 > attr.length) return null;
  const bitmapW = dv.getInt32(p);
  const bitmapH = dv.getInt32(p + 4);
  const gridW = dv.getInt32(p + 8);
  const gridH = dv.getInt32(p + 12);
  return { bitmapW, bitmapH, gridW, gridH };
}

async function decodeLayerTiles(bitmapBlocks, gridW, gridH, bitmapW, bitmapH) {
  if (bitmapW <= 0 || bitmapH <= 0 || !bitmapBlocks || !bitmapBlocks.length) return null;
  const hasAnyBlock = bitmapBlocks.some((b) => b != null);
  if (!hasAnyBlock) return null;

  const rgba = new Uint8ClampedArray(bitmapW * bitmapH * 4);

  for (let i = 0; i < gridH; i++) {
    for (let j = 0; j < gridW; j++) {
      const block = bitmapBlocks[i * gridW + j];
      if (!block) continue;
      let decompressed;
      try {
        decompressed = await decompress(block);
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
      } else if (decompressed.length >= 8192) {
        for (let ty = 0; ty < th; ty++) {
          const dstY = i * 256 + ty;
          const dstRow = dstY * bitmapW;
          const srcRow = ty * 32;
          for (let tx = 0; tx < tw; tx++) {
            const byteVal = decompressed[srcRow + (tx >> 3)];
            const bit = (byteVal >> (7 - (tx & 7))) & 1;
            const v = bit ? 255 : 0;
            const dstIdx = (dstRow + (j * 256 + tx)) * 4;
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

/* ---- Public APIs ---- */

/**
 * Extracts embedded PNG thumbnail/preview blob from a Clip Studio Paint file.
 * Reliably handles preview images spanning multiple SQLite B-tree overflow pages.
 * @param {ArrayBuffer|Uint8Array|Blob} input
 * @returns {Promise<Blob>}
 */
export async function extractClipPreview(input) {
  let u;
  if (input instanceof Blob) {
    u = new Uint8Array(await input.arrayBuffer());
  } else if (input instanceof Uint8Array) {
    u = input;
  } else {
    u = new Uint8Array(input);
  }

  const findExactPng = (imgData) => {
    if (!imgData || imgData.length < 8) return null;
    let start = -1;
    for (let i = 0; i <= imgData.length - 8; i++) {
      if (
        imgData[i] === 0x89 && imgData[i + 1] === 0x50 && imgData[i + 2] === 0x4e && imgData[i + 3] === 0x47 &&
        imgData[i + 4] === 0x0d && imgData[i + 5] === 0x0a && imgData[i + 6] === 0x1a && imgData[i + 7] === 0x0a
      ) {
        start = i;
        break;
      }
    }
    if (start < 0) return null;
    let end = -1;
    for (let i = start; i <= imgData.length - 8; i++) {
      if (
        imgData[i] === 0x49 && imgData[i + 1] === 0x45 && imgData[i + 2] === 0x4e && imgData[i + 3] === 0x44 &&
        imgData[i + 4] === 0xae && imgData[i + 5] === 0x42 && imgData[i + 6] === 0x60 && imgData[i + 7] === 0x82
      ) {
        end = i + 8;
        break;
      }
    }
    if (end > start) {
      return imgData.subarray(start, end);
    }
    return null;
  };

  try {
    const db = findSqliteDb(u);
    if (db) {
      const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
      const rawPageSize = dv.getUint16(16);
      const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
      const usableSize = pageSize - db[20];

      const schemaMap = parseSchema(db, pageSize, usableSize);
      const previewRows = queryTable(db, schemaMap, 'CanvasPreview', pageSize, usableSize);

      for (const row of previewRows) {
        let imgData = row.ImageData || row.imagedata;
        if (!imgData && row._cols) {
          imgData = row._cols.find((c) => c instanceof Uint8Array && c.length > 8);
        }
        const exact = findExactPng(imgData);
        if (exact) {
          return new Blob([exact], { type: 'image/png' });
        }
      }
    }
  } catch {
    // Fall back to sequential binary scan
  }

  // Fallback: search whole input for PNG starting with magic and ending with IEND
  for (let i = 0; i <= u.length - 8; i++) {
    if (
      u[i] === 0x89 && u[i + 1] === 0x50 && u[i + 2] === 0x4e && u[i + 3] === 0x47 &&
      u[i + 4] === 0x0d && u[i + 5] === 0x0a && u[i + 6] === 0x1a && u[i + 7] === 0x0a
    ) {
      let p = i + 8;
      let ok = false;
      while (p + 12 <= u.length) {
        const l = ((u[p] << 24) | (u[p + 1] << 16) | (u[p + 2] << 8) | u[p + 3]) >>> 0;
        const t = String.fromCharCode(u[p + 4], u[p + 5], u[p + 6], u[p + 7]);
        if (p + 12 + l > u.length) break;
        p += 12 + l;
        if (t === 'IEND') {
          ok = true;
          break;
        }
      }
      if (ok) {
        return new Blob([u.subarray(i, p)], { type: 'image/png' });
      }
    }
  }

  throw new Error('No embedded preview found in CanvasPreview');
}

/**
 * Parses Clip Studio Paint (.clip / .csp) file into layered tree compatible with PsdLayerViewer.
 * Decodes all layers/folders in bottom-to-top draw order and decodes RGBA buffers for visible layers.
 * @param {ArrayBuffer} buf
 * @param {Function} onProgress
 * @returns {Promise<{width: number, height: number, roots: Array, nodes: Array, byId: Object}>}
 */
export async function parseClip(buf, onProgress = () => {}) {
  const u = new Uint8Array(buf);
  const db = findSqliteDb(u);
  if (!db) throw new Error('Not a valid Clip Studio Paint file');

  const dv = new DataView(db.buffer, db.byteOffset, db.byteLength);
  const rawPageSize = dv.getUint16(16);
  const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
  const usableSize = pageSize - db[20];

  const schemaMap = parseSchema(db, pageSize, usableSize);

  const canvasRows = queryTable(db, schemaMap, 'Canvas', pageSize, usableSize);
  if (!canvasRows.length) throw new Error('No Canvas table found in CLIP document');
  const canvasRow = canvasRows[0];
  const W = canvasRow.CanvasWidth || canvasRow.canvaswidth || canvasRow.Width || canvasRow.width || 0;
  const H = canvasRow.CanvasHeight || canvasRow.canvasheight || canvasRow.Height || canvasRow.height || 0;
  const rootFolderId = canvasRow.CanvasRootFolder ?? canvasRow.canvasrootfolder ?? canvasRow.RootFolder ?? 0;

  const layerRows = queryTable(db, schemaMap, 'Layer', pageSize, usableSize);
  const mipmapRows = queryTable(db, schemaMap, 'Mipmap', pageSize, usableSize);
  const mipmapInfoRows = queryTable(db, schemaMap, 'MipmapInfo', pageSize, usableSize);
  const offscreenRows = queryTable(db, schemaMap, 'Offscreen', pageSize, usableSize);

  const layersById = new Map();
  layerRows.forEach((l) => {
    const id = l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid);
    if (id != null) {
      layersById.set(id, l);
      layersById.set(String(id), l);
      layersById.set(Number(id), l);
    }
    if (l._rowid != null) {
      layersById.set(l._rowid, l);
      layersById.set(String(l._rowid), l);
      layersById.set(Number(l._rowid), l);
    }
  });

  const mipmapById = new Map();
  mipmapRows.forEach((m) => {
    const id = m.MainId != null ? m.MainId : (m.mainid != null ? m.mainid : m._rowid);
    if (id != null) {
      mipmapById.set(id, m);
      mipmapById.set(String(id), m);
      mipmapById.set(Number(id), m);
    }
  });

  const mipmapInfoById = new Map();
  mipmapInfoRows.forEach((mi) => {
    const id = mi.MainId != null ? mi.MainId : (mi.mainid != null ? mi.mainid : mi._rowid);
    if (id != null) {
      mipmapInfoById.set(id, mi);
      mipmapInfoById.set(String(id), mi);
      mipmapInfoById.set(Number(id), mi);
    }
  });

  const offscreenById = new Map();
  offscreenRows.forEach((o) => {
    const id = o.MainId != null ? o.MainId : (o.mainid != null ? o.mainid : o._rowid);
    if (id != null) {
      offscreenById.set(id, o);
      offscreenById.set(String(id), o);
      offscreenById.set(Number(id), o);
    }
  });

  const chunksMap = parseExtaChunks(u);

  function buildNode(l) {
    const folderVal = l.LayerFolder ?? l.layerfolder ?? 0;
    const firstChildVal = l.LayerFirstChildIndex ?? l.layerfirstchildindex ?? 0;
    const isGroup = folderVal !== 0 || firstChildVal > 0;
    const compositeVal = l.LayerComposite ?? l.layercomposite ?? 0;
    const blendKey = clipBlendOf(compositeVal);
    const pass = compositeVal === 30;
    const opacityRaw = l.LayerOpacity ?? l.layeropacity ?? 256;
    const opacity = Math.max(0, Math.min(1, opacityRaw / 256));
    const visible = Boolean((l.LayerVisibility ?? l.layervisibility ?? 1) & 1);
    const clipping = Boolean(l.LayerClip ?? l.layerclip);
    const offX = (l.LayerOffsetX ?? l.layeroffsetx ?? 0) + (l.LayerRenderOffscrOffsetX ?? l.layerrenderoffscroffsetx ?? 0);
    const offY = (l.LayerOffsetY ?? l.layeroffsety ?? 0) + (l.LayerRenderOffscrOffsetY ?? l.layerrenderoffscroffsety ?? 0);

    const node = {
      id: l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid),
      name: l.LayerName || l.layername || '(unnamed)',
      isGroup: Boolean(isGroup),
      visible: Boolean(visible),
      opacity: opacity,
      blend: pass ? 'source-over' : blendKey,
      pass: pass,
      clipping: clipping,
      left: offX,
      top: offY,
      w: 0,
      h: 0,
      rgba: null,
      children: [],
      open: isGroup ? !(folderVal & 16) : true,
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
      if (node.isGroup) {
        node.children = getChildren(node.id);
      }
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
      if (n.isGroup && n.children) {
        collectNodes(n.children);
      }
    }
  }
  collectNodes(roots);

  // If roots is empty, attempt to discover candidate roots from layer rows
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
    const id = l.MainId != null ? l.MainId : (l.mainid != null ? l.mainid : l._rowid);
    const layerType = l.LayerType ?? l.layertype;
    if (id !== effectiveRootFolderId && layerType !== 256 && !byId[id]) {
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

  // Decode visible content layers
  const contentLayers = nodes.filter((n) => !n.isGroup && n._blocks && n.w > 0 && n.h > 0);
  let processed = 0;
  for (const n of contentLayers) {
    n.decodeRgba = async () => {
      if (n._decoded) return n.rgba;
      if (!n.rgba && n._blocks && n._attr) {
        n.rgba = await decodeLayerTiles(n._blocks, n._attr.gridW, n._attr.gridH, n.w, n.h);
      }
      n._decoded = true;
      return n.rgba;
    };
    if (n.visible) {
      n.rgba = await n.decodeRgba();
    }
    processed++;
    onProgress(processed, Math.max(1, contentLayers.length));
  }

  let finalW = W;
  let finalH = H;
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

  return { width: finalW, height: finalH, roots, nodes, byId };
}
