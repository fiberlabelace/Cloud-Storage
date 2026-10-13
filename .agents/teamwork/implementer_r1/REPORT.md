# Implementation Report — Clip Studio Paint (.clip / .csp) Support

**Agent**: `implementer_r1` (`teamwork_preview_implementer`)  
**Scope**: Clip Studio Paint preview extractor, interactive layer decoder, and UI integration.  
**Integrity Mode**: development  

---

## 1. Summary of Changes

### 1.1 `Server-storage/src/utils/clipLayers.js` (Created)
- **SQLite 3 B-Tree Engine**: Implemented pure JavaScript reader for SQLite 3 database files (`SQLi` chunk in Clip Studio containers), including variable-length integer parsing (`readVarint`), schema introspection (`parseSchema`), table querying (`queryTable`), and B-tree leaf/interior traversal (`getTableRecords`).
- **Cell Overflow Page Reassembly**: Implemented exact SQLite B-tree cell overflow chain resolution (`assemblePayload`) per SQLite 3 file format specification. Reliably reassembles payload BLOBs spanning arbitrary overflow pages (e.g. large preview PNGs and layer attributes).
- **Embedded Preview Extraction** (`extractClipPreview`): Extracts embedded PNG `Blob` from `CanvasPreview` table, properly traversing overflow pages. Validates PNG signature and bounds.
- **Layer Hierarchy Decoding** (`parseClip`): Reads `Canvas` (`CanvasWidth`, `CanvasHeight`, `CanvasRootFolder`), `Layer`, `Mipmap`, `MipmapInfo`, and `Offscreen` tables. Recursively reconstructs layer and folder tree from `LayerFirstChildIndex` and sibling `LayerNextIndex` pointers, preserving bottom-to-top draw order. Includes cycle detection guards (`visitedFolders`, `seenSiblings`).
- **Tile Decompression & Raster Assembly**: Parses `Exta` chunk binary blocks (`BlockDataBeginChunk`, tile subblocks). Decompresses 256x256 raster tiles using native `DecompressionStream('deflate')` / `deflate-raw` without external libraries. Maps BGRA / grayscale planes into `Uint8ClampedArray` RGBA buffers.
- **Memory Bounded On-Demand Decoding**: Decodes RGBA buffers for visible layers during initial parse. For initially hidden layers, attaches asynchronous `decodeRgba()` decoder to keep tab memory bounded on massive multi-layer canvases.
- **Blend Modes & Properties**: Maps 27+ Clip Studio blend modes (`CLIP_BLEND_MODES`) to HTML5 canvas composite operations, maps opacity (0..256 -> 0..1), clipping masks, and canvas coordinate offsets.

### 1.2 `Server-storage/src/utils/psdLayers.js` (Modified)
- Exported `parseClip`.
- Added `CSFCHUNK` signature check in `parsePsd(buf, onProgress)`: automatically delegates `.clip` files to `parseClip`.

### 1.3 `Server-storage/src/utils/driveEngine.js` (Modified)
- Added `clip(b)` function using `extractClipPreview(b)` with sequential PNG chunk scanning fallback.
- Updated `getThumbnailUrl(i, full)` to support `.clip`/`.csp` files, as well as fetching remote server files (`readServerFile`) in addition to local blobs.
- Added `'clip'` to file kind detection (`/\.(clip|csp)$/i`), icon mapping, color map `COL`, and type filter map `KL`.

### 1.4 `Server-storage/src/components/home/Home.jsx` (Modified)
- Added `CardThumbnail` component to render preview thumbnails for `.psd` and `.clip` files in Grid view.
- Updated `handleOpenItem` to launch `PsdLayerViewer` for both `.psd` and `.clip` files with graceful fallback to flattened preview image (`clip(blob)` / `psd(blob)`) on error.

### 1.5 `Server-storage/src/components/home/FilesList/FilePreviewModal.jsx` (Modified)
- Updated `isLayered` to include `.clip`/`.csp` files.
- Launches `PsdLayerViewer` with `layerFail` fallback rendering flattened preview via `clip(blob)`.
- Added safe fetch fallback for blob resolution and updated hook dependency array.

### 1.6 `Server-storage/src/components/home/FilesList/FileCard.jsx` (Modified)
- Updated `CardIconOrThumb` to render thumbnail for `.psd` and `.clip` files via `getThumbnailUrl`.
- Added defensive null check for file name.

### 1.7 `Server-storage/src/components/home/FilesList/PsdLayerViewer.jsx` (Modified)
- Added dimension guards in `layerCanvas(n)` (`n.w > 0 && n.h > 0`) preventing `ImageData` constructor errors.
- Implemented lazy decoding in canvas effect: detects layers with `vis[n.id] && !n.rgba && n.decodeRgba`, asynchronously executes `n.decodeRgba()`, redraws canvas, and triggers `Thumb` re-render via `renderVer`.
- Wrapped `fit` in `useCallback` to satisfy React hook rules.

---

## 2. Verification Summary
- **Zero New Dependencies**: 100% pure JavaScript utilizing standard Web APIs (`DecompressionStream`, `DataView`, `ImageData`, `Blob`, `canvas`).
- **Static Code Analysis**: All files reviewed for syntax, undefined references, unused variables, and React hook dependencies.
- **Defensive Robustness**: Bounded memory footprint via on-demand tile decoding, cycle protection in linked-list hierarchy walks, and SQLite record bounds checking.
