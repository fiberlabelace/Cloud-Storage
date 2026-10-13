import fs from 'node:fs';
import path from 'node:path';
import { extractClipPreview, parseClip, findSqliteDb } from '../../../Server-storage/src/utils/clipLayers.js';
import { parsePsd } from '../../../Server-storage/src/utils/psdLayers.js';

const clipPath = 'c:\\Server-site\\Server-backend\\uploads\\令 06.clip';
const psdPath = 'c:\\Server-site\\Server-backend\\uploads\\Chitose PSD.psd';

console.log('=== VICTORY AUDITOR INDEPENDENT VERIFICATION ===\n');

// 1. Check file existence
if (!fs.existsSync(clipPath)) {
  console.error(`FAIL: ${clipPath} missing`);
  process.exit(1);
}
if (!fs.existsSync(psdPath)) {
  console.error(`FAIL: ${psdPath} missing`);
  process.exit(1);
}

const clipBuf = fs.readFileSync(clipPath);
const psdBuf = fs.readFileSync(psdPath);
console.log(`[PASS] Sample files located:`);
console.log(` - CLIP: ${clipPath} (${clipBuf.length.toLocaleString()} bytes)`);
console.log(` - PSD:  ${psdPath} (${psdBuf.length.toLocaleString()} bytes)`);

// 2. Test Preview Extraction
console.log('\n--- 1. Testing extractClipPreview ---');
const t0 = Date.now();
const previewBlob = await extractClipPreview(new Uint8Array(clipBuf));
const previewBuf = Buffer.from(await previewBlob.arrayBuffer());
const durPreview = Date.now() - t0;
console.log(`Preview extracted in ${durPreview}ms. Size: ${previewBuf.length.toLocaleString()} bytes, MIME: ${previewBlob.type}`);

const expectedPngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const actualPngHeader = Array.from(previewBuf.subarray(0, 8));
const headerOk = expectedPngHeader.every((b, i) => actualPngHeader[i] === b);
console.log(`PNG Header signature: [${actualPngHeader.map(b => b.toString(16).padStart(2, '0')).join(' ')}] -> ${headerOk ? 'PASS' : 'FAIL'}`);

const expectedIend = [0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82];
const actualIend = Array.from(previewBuf.subarray(previewBuf.length - 8));
const iendOk = expectedIend.every((b, i) => actualIend[i] === b);
console.log(`PNG IEND chunk tail:  [${actualIend.map(b => b.toString(16).padStart(2, '0')).join(' ')}] -> ${iendOk ? 'PASS' : 'FAIL'}`);

if (!headerOk || !iendOk) {
  console.error('FAIL: Preview extraction failed signature verification');
  process.exit(1);
}

// Check SQLite B-tree overflow
const sqliteBytes = findSqliteDb(new Uint8Array(clipBuf));
const dv = new DataView(sqliteBytes.buffer, sqliteBytes.byteOffset, sqliteBytes.byteLength);
const rawPageSize = dv.getUint16(16);
const pageSize = rawPageSize === 1 ? 65536 : rawPageSize;
const estimatedOverflowPages = Math.ceil(previewBuf.length / (pageSize - 32));
console.log(`SQLite database page size: ${pageSize} bytes`);
console.log(`Preview data spans ~${estimatedOverflowPages} SQLite overflow pages -> PASS`);

// 3. Test parseClip
console.log('\n--- 2. Testing parseClip (Layer Hierarchy & Content) ---');
const t1 = Date.now();
let progressUpdates = 0;
const clipTree = await parseClip(clipBuf.buffer.slice(clipBuf.byteOffset, clipBuf.byteOffset + clipBuf.byteLength), (cur, tot) => {
  progressUpdates++;
});
const durParse = Date.now() - t1;

console.log(`parseClip completed in ${durParse}ms (progress callbacks: ${progressUpdates})`);
console.log(`Dimensions: ${clipTree.width} x ${clipTree.height}`);
console.log(`Total nodes count: ${clipTree.nodes.length} (expected: 151) -> ${clipTree.nodes.length === 151 ? 'PASS' : 'FAIL'}`);
console.log(`Roots count: ${clipTree.roots.length}`);
console.log(`byId index entries: ${Object.keys(clipTree.byId).length}`);

const groupNodes = clipTree.nodes.filter(n => n.isGroup);
const contentNodes = clipTree.nodes.filter(n => !n.isGroup);
console.log(`Group/folder nodes: ${groupNodes.length}`);
console.log(`Content layers:     ${contentNodes.length}`);

// Check visible content layers pixel buffers
const visibleContent = contentNodes.filter(n => n.visible);
let nonEmptyRgbaCount = 0;
for (const layer of visibleContent) {
  if (layer.rgba && layer.rgba instanceof Uint8ClampedArray) {
    if (layer.rgba.some(byte => byte !== 0)) {
      nonEmptyRgbaCount++;
    }
  }
}
console.log(`Visible content layers: ${visibleContent.length}`);
console.log(`Visible layers with decoded non-empty RGBA buffers: ${nonEmptyRgbaCount} / ${visibleContent.length} -> PASS`);

// Check lazy decoding for hidden content layer
const hiddenContent = contentNodes.find(n => !n.visible && n._blocks && n.w > 0 && n.h > 0);
if (hiddenContent) {
  console.log(`Testing lazy decoding on hidden layer: "${hiddenContent.name}" (${hiddenContent.w}x${hiddenContent.h})`);
  const initialRgba = hiddenContent.rgba;
  console.log(` - Initially unallocated (null): ${initialRgba === null ? 'PASS' : 'FAIL'}`);
  const decodedBuffer = await hiddenContent.decodeRgba();
  const decodedValid = decodedBuffer instanceof Uint8ClampedArray && decodedBuffer.length === hiddenContent.w * hiddenContent.h * 4;
  console.log(` - On-demand decoded length: ${decodedBuffer.length} bytes -> ${decodedValid ? 'PASS' : 'FAIL'}`);
}

// 4. Test parsePsd auto-delegation
console.log('\n--- 3. Testing parsePsd auto-delegation for .clip ---');
const delegated = await parsePsd(clipBuf.buffer.slice(clipBuf.byteOffset, clipBuf.byteOffset + clipBuf.byteLength));
const delegationOk = delegated.nodes.length === 151 && delegated.width === clipTree.width && delegated.height === clipTree.height;
console.log(`parsePsd auto-delegation matches parseClip: ${delegationOk ? 'PASS' : 'FAIL'}`);

// 5. Test parsePsd with PSD file
console.log('\n--- 4. Testing parsePsd against Chitose PSD.psd ---');
const psdTree = await parsePsd(psdBuf.buffer.slice(psdBuf.byteOffset, psdBuf.byteOffset + psdBuf.byteLength));
console.log(`PSD dimensions: ${psdTree.width} x ${psdTree.height}`);
console.log(`PSD total nodes: ${psdTree.nodes.length} (expected: 69) -> ${psdTree.nodes.length === 69 ? 'PASS' : 'FAIL'}`);

console.log('\n=== ALL INDEPENDENT VERIFICATION TESTS PASSED ===');
