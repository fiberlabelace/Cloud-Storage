# Original User Request

## 2026-10-13T06:40:35Z

This is a single self-contained fix; keep it small and focused. Add preview (flattened/thumbnail preview) and interactive layer viewing support for Clip Studio Paint (`.clip` and `.csp`) files to the existing web-based cloud drive application, matching the capabilities currently provided for `.psd` files.

Working directory: c:\Server-site
Integrity mode: development

## Verification Resources

- Sample Clip Studio Paint file: `c:\Server-site\Server-backend\uploads\令 06.clip`
- Sample Photoshop file: `c:\Server-site\Server-backend\uploads\Chitose PSD.psd`
- Frontend application: `c:\Server-site\Server-storage`

## Requirements

### R1. `.clip` Interactive Layer Viewing
Opening a `.clip` file in the drive UI must launch the interactive layer viewer (`PsdLayerViewer`), decoding and displaying the full layer hierarchy (folders/groups and layers), layer names, initial visibility, opacity, blend modes, and clipping masks so users can toggle visibility, solo layers, select layers, and zoom/fit the canvas. If layer decoding fails on a file, the viewer must gracefully fall back to the embedded flattened preview image.

### R2. `.clip` and `.psd` Embedded Preview & Grid Thumbnails
Extracting the embedded preview image from `.clip` (and `.csp`) files must work reliably even when the embedded PNG inside the `.clip` SQLite database (`CanvasPreview`) spans multiple SQLite B-tree overflow pages. In Grid view, `.psd` and `.clip`/`.csp` file cards must display their extracted thumbnail previews rather than only a generic icon.

### R3. Pure JS / Zero New External Dependencies
Implement `.clip` preview and layer decoding in pure JavaScript without adding new third-party npm packages, keeping memory usage bounded on large multi-layer canvases so browser tabs remain responsive.

## Acceptance Criteria

### Embedded Preview Extraction
- [ ] Running the preview extractor against `c:\Server-site\Server-backend\uploads\令 06.clip` returns a valid PNG `Blob` starting with the PNG signature (`89 50 4E 47 0D 0A 1A 0A`) and ending with a valid `IEND` chunk (`49 45 4E 44 AE 42 60 82`).
- [ ] Grid view cards in `Home.jsx` render image thumbnails for `.psd` and `.clip`/`.csp` files (both local and remote server files).

### Interactive Layer Decoding & Viewer Integration
- [ ] Running the layer parser against `c:\Server-site\Server-backend\uploads\令 06.clip` returns a `{ width, height, roots, nodes, byId }` structure compatible with `PsdLayerViewer`, containing all 151 layers/folders in bottom-to-top draw order and decoded non-empty RGBA pixel buffers for visible content layers.
- [ ] Opening a `.clip` file in `Home.jsx` (and `FilePreviewModal.jsx`) renders `PsdLayerViewer` with fallback to the flattened preview on error.
- [ ] `npm run build` and `npm run lint` in `c:\Server-site\Server-storage` succeed with zero errors.
