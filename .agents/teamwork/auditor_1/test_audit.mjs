import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractClipPreview, parseClip, findSqliteDb } from '../../../../Server-storage/src/utils/clipLayers.js';
import { parsePsd } from '../../../../Server-storage/src/utils/psdLayers.js';

const clipPath = 'c:\\Server-site\\Server-backend\\uploads\\令 06.clip';
const psdPath = 'c:\\Server-site\\Server-backend\\uploads\\Chitose PSD.psd';

console.log('=== INDEPENDENT AUDIT EXECUTION ===\n');

// 1. Verify existence and size of sample files
if (!fs.existsSync(clipPath)) {
  console.error(`FAIL: ${clipPath} does not exist`);
  process.exit(1);
}
const clipBuf = fs.readFileSync(clipPath);
console.log(`CLIP sample file size: ${clipBuf.length} bytes`);

if (!fs.existsSync(psdPath)) {
  console.error(`FAIL: ${psdPath} does not exist`);
  process.exit(1);
}
const psdBuf = fs.readFileSync(psdPath);
console.log(`PSD sample file size: ${psdBuf.length} bytes\n`);

// 2. Test Preview Extraction
console.log('--- Test 1: extractClipPreview ---');
const previewBlob = await extractClipPreview(new Uint8Array(clipBuf));
const previewBuf = Buffer.from(await previewBlob.arrayBuffer());
console.log(`Extracted preview blob type: ${previewBlob.type}, size: ${previewBuf.length} bytes`);

const pngSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const hasPngSig = pngSig.every((b, i) => previewBuf[i] === b);
console.log(`PNG header signature check: ${hasPngSig ? 'PASS' : 'FAIL'} (${previewBuf.subarray(0, 8).toString('hex')})`);

const iendChunk = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const tail = previewBuf.subarray(previewBuf.length - 8);
const hasIend = iendChunk.every((b, i) => tail[i] === b);
console.log(`PNG IEND chunk check: ${hasIend ? 'PASS' : 'FAIL'} (${tail.toString('hex')})`);

if (!hasPngSig || !hasIend) {
  console.error('FAIL: Preview extraction did not return a valid PNG');
  process.exit(1);
}

// 3. Test SQLite Overflow Verification
console.log('\n--- Test 2: SQLite Page & Overflow Verification ---');
const dbBytes = findSqliteDb(new Uint8Array(clipBuf));
if (!dbBytes) {
  console.error('FAIL: SQLite database not found in CLIP file');
  process.exit(1);
}
const dv = new DataView(dbBytes.buffer, dbBytes.byteOffset, dbBytes.byteLength);
const rawPageSize = dv.getUint16(16);
const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
console.log(`SQLite database size: ${dbBytes.length} bytes, page size: ${pageSize}`);
console.log(`Preview size (${previewBuf.length}) > pageSize (${pageSize}): ${previewBuf.length > pageSize} (spans overflow pages: ${previewBuf.length > pageSize})`);

// 4. Test parseClip Layer Parser
console.log('\n--- Test 3: parseClip Layer Hierarchy & Content ---');
let progressReports = 0;
const clipResult = await parseClip(clipBuf.buffer.slice(clipBuf.byteOffset, clipBuf.byteOffset + clipBuf.byteLength), (cur, tot) => {
  progressReports++;
});

console.log(`Canvas dimensions: ${clipResult.width} x ${clipResult.height}`);
console.log(`Root nodes count: ${clipResult.roots.length}`);
console.log(`Total nodes count: ${clipResult.nodes.length}`);
console.log(`byId keys count: ${Object.keys(clipResult.byId).length}`);
console.log(`Progress callback triggered: ${progressReports} times`);

const expectedNodeCount = 151;
console.log(`Node count matches expected (151): ${clipResult.nodes.length === expectedNodeCount ? 'PASS' : 'FAIL'}`);

// Check groups vs layers
const groupCount = clipResult.nodes.filter(n => n.isGroup).length;
const layerCount = clipResult.nodes.filter(n => !n.isGroup).length;
console.log(`Groups: ${groupCount}, Layers: ${layerCount}, Total: ${groupCount + layerCount}`);

// Check visible layers and RGBA buffer decoding
const visibleLayers = clipResult.nodes.filter(n => !n.isGroup && n.visible);
console.log(`Visible layers count: ${visibleLayers.length}`);
let visibleWithRgba = 0;
let nonEmptyRgba = 0;
for (const l of visibleLayers) {
  if (l.rgba && l.rgba instanceof Uint8ClampedArray) {
    visibleWithRgba++;
    const hasNonZero = l.rgba.some(v => v !== 0);
    if (hasNonZero) nonEmptyRgba++;
  }
}
console.log(`Visible layers with RGBA buffers: ${visibleWithRgba} / ${visibleLayers.length}`);
console.log(`Visible layers with non-zero pixel data: ${nonEmptyRgba} / ${visibleLayers.length}`);

// Check on-demand decoding for hidden layers
const hiddenLayersWithBlocks = clipResult.nodes.filter(n => !n.visible && !n.isGroup && n._blocks && n.w > 0 && n.h > 0);
console.log(`Hidden content layers with blocks: ${hiddenLayersWithBlocks.length}`);
if (hiddenLayersWithBlocks.length > 0) {
  const sampleHidden = hiddenLayersWithBlocks[0];
  console.log(`Hidden layer '${sampleHidden.name}' initially decoded: ${sampleHidden.rgba !== null}`);
  const decoded = await sampleHidden.decodeRgba();
  console.log(`Hidden layer '${sampleHidden.name}' on-demand decoded length: ${decoded ? decoded.length : 0}`);
}

// 5. Test parsePsd auto-delegation
console.log('\n--- Test 4: parsePsd auto-delegation for .clip ---');
const delegatedResult = await parsePsd(clipBuf.buffer.slice(clipBuf.byteOffset, clipBuf.byteOffset + clipBuf.byteLength));
console.log(`Delegated parsePsd node count: ${delegatedResult.nodes.length} (matches parseClip: ${delegatedResult.nodes.length === clipResult.nodes.length})`);

// 6. Test parsePsd with actual PSD file
console.log('\n--- Test 5: parsePsd with PSD file (Chitose PSD.psd) ---');
const psdResult = await parsePsd(psdBuf.buffer.slice(psdBuf.byteOffset, psdBuf.byteOffset + psdBuf.byteLength));
console.log(`PSD Canvas dimensions: ${psdResult.width} x ${psdResult.height}`);
console.log(`PSD Total nodes count: ${psdResult.nodes.length}`);
console.log(`PSD byId keys count: ${Object.keys(psdResult.byId).length}`);

console.log('\n=== ALL AUDIT CHECKS FINISHED ===');
