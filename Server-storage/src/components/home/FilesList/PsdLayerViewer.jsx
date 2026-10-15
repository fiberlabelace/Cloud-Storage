import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePsd, nodeBounds } from '../../../utils/psdLayers';
import {
  fetchServerLayers,
  fetchServerPreview,
  getLayerImageUrlServer,
  getPreviewUrlServer
} from '../../../utils/storageApi';
import {
  getCachedLayers,
  setCachedLayers,
  getCachedPreview,
  setCachedPreview,
  getCachedLayerImage,
  setCachedLayerImage
} from '../../../utils/idbCache';
import './PsdLayerViewer.scss';

// Scratch canvas pool with guaranteed state reset to eliminate memory churn and context leak
const canvasPool = [];
function acquireCanvas(w, h) {
  let c = canvasPool.pop();
  if (!c) {
    c = document.createElement('canvas');
  }
  const targetW = Math.max(1, Math.round(w || 1));
  const targetH = Math.max(1, Math.round(h || 1));
  if (c.width !== targetW || c.height !== targetH) {
    c.width = targetW;
    c.height = targetH;
  }
  const tc = c.getContext('2d');
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = 'source-over';
  tc.clearRect(0, 0, targetW, targetH);
  return c;
}

function releaseCanvas(c) {
  if (!c) return;
  const tc = c.getContext('2d');
  tc.setTransform(1, 0, 0, 1, 0, 0);
  tc.globalAlpha = 1;
  tc.globalCompositeOperation = 'source-over';
  if (canvasPool.length < 10) {
    canvasPool.push(c);
  }
}

/* ---- High-performance compositing: list is bottom -> top; `vis` maps node id -> shown ---- */
function renderList(ctx, list, vis, W, H, getDrawable) {
  if (!list || !list.length) return;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.clipping || !vis[n.id]) continue;
    const clips = [];
    for (let j = i + 1; j < list.length && list[j].clipping; j++) {
      if (vis[list[j].id]) clips.push(list[j]);
    }
    drawNode(ctx, n, clips, vis, W, H, getDrawable);
  }
}

function drawNode(ctx, n, clips, vis, W, H, getDrawable) {
  // If this is a normal group with opacity 1 and no clips, pass-through directly to ctx.
  // This preserves child blend modes (multiply, screen, overlay) and avoids offscreen canvas clears.
  const isNormalGroup = n.isGroup && !clips.length && (n.pass || n.blend === 'source-over' || !n.blend) && n.opacity === 1;
  if (isNormalGroup) {
    return renderList(ctx, n.children, vis, W, H, getDrawable);
  }

  ctx.save();
  ctx.globalAlpha = typeof n.opacity === 'number' ? Math.max(0, Math.min(1, n.opacity)) : 1;
  ctx.globalCompositeOperation = n.pass ? 'source-over' : (n.blend || 'source-over');

  if (!n.isGroup) {
    const drawable = getDrawable(n);
    if (drawable && n.w > 0 && n.h > 0) {
      if (!clips.length) {
        ctx.drawImage(drawable, n.left, n.top, n.w, n.h);
      } else {
        // Content layer with clipping mask(s)
        // Memory-efficient: scratch canvas only sized to the base layer's bounding box!
        const t = acquireCanvas(n.w, n.h);
        const tc = t.getContext('2d');
        tc.drawImage(drawable, 0, 0, n.w, n.h);

        for (const cl of clips) {
          const cc = getDrawable(cl);
          if (!cc || cl.w <= 0 || cl.h <= 0) continue;
          tc.save();
          tc.globalCompositeOperation = 'source-atop';
          tc.globalAlpha = typeof cl.opacity === 'number' ? Math.max(0, Math.min(1, cl.opacity)) : 1;
          tc.drawImage(cc, cl.left - n.left, cl.top - n.top, cl.w, cl.h);
          tc.restore();
        }

        ctx.drawImage(t, n.left, n.top);
        releaseCanvas(t);
      }
    }
  } else {
    // Group with opacity < 1 or non-standard blend or clips
    const t = acquireCanvas(W, H);
    const tc = t.getContext('2d');
    renderList(tc, n.children, vis, W, H, getDrawable);

    for (const cl of clips) {
      const cc = getDrawable(cl);
      if (!cc || cl.w <= 0 || cl.h <= 0) continue;
      tc.save();
      tc.globalCompositeOperation = 'source-atop';
      tc.globalAlpha = typeof cl.opacity === 'number' ? Math.max(0, Math.min(1, cl.opacity)) : 1;
      tc.drawImage(cc, cl.left, cl.top, cl.w, cl.h);
      tc.restore();
    }

    ctx.drawImage(t, 0, 0);
    releaseCanvas(t);
  }

  ctx.restore();
  return undefined;
}

const Thumb = ({ n, fileName, renderVer, imagesRef, data }) => {
  const ref = useRef(null);

  useEffect(() => {
    if (n.isGroup) return;
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 32, 32);

    const id = String(n.id);
    const src = imagesRef?.current?.get(id) || n.image || data?.byId?.[id]?.image || n.canvas;
    if (!src || !n.w || !n.h) return;
    const s = Math.min(32 / n.w, 32 / n.h);
    x.drawImage(src, (32 - n.w * s) / 2, (32 - n.h * s) / 2, n.w * s, n.h * s);
  }, [n, renderVer, imagesRef, data]);

  if (n.isGroup) {
    return <span className="psdv-thumb" aria-label="Layer group">▣</span>;
  }

  if (fileName && n.hasImage) {
    return (
      <img
        src={getLayerImageUrlServer(fileName, n.id)}
        alt=""
        className="psdv-thumb"
        loading="lazy"
        draggable="false"
      />
    );
  }

  return <canvas ref={ref} width="32" height="32" className="psdv-thumb" />;
};

const descendants = (n) => (n.isGroup ? n.children.flatMap((c) => [c.id, ...descendants(c)]) : []);

export default function PsdLayerViewer({ url, item, onFail }) {
  const [data, setData] = useState(null);
  const [compositeImg, setCompositeImg] = useState(null);
  const [prog, setProg] = useState([0, 1]);
  const [vis, setVis] = useState({});
  const [sel, setSel] = useState(new Set());
  const [collapsed, setCollapsed] = useState({});
  const [zoom, setZoom] = useState(1);
  const [renderVer, setRenderVer] = useState(0);

  const anchor = useRef(null);
  const original = useRef({});
  const stage = useRef(null);
  const canvas = useRef(null);
  const overlay = useRef(null);
  const rafId = useRef(null);
  const imagesRef = useRef(new Map());
  const failRef = useRef(onFail);
  useEffect(() => { failRef.current = onFail; }, [onFail]);

  const fileName = item?.name || (url ? decodeURIComponent(url.split('/raw/').pop()?.split('?')[0] || '') : '');

  // 1. Ultra-fast Data Loading (Server JSON + Preview WebP or IndexedDB)
  useEffect(() => {
    let on = true;
    imagesRef.current.clear();

    async function loadLayers() {
      // Step A: Check if we have server preprocessed layers
      if (fileName) {
        try {
          // Check IndexedDB cache first (<2ms)
          let cached = item ? await getCachedLayers(item) : null;
          if (!cached) {
            cached = await fetchServerLayers(fileName);
            if (cached && item) setCachedLayers(item, cached);
          }

          if (on && cached && cached.roots && cached.nodes) {
            // Re-bind references so roots, nodes, and byId share identical object instances
            const byId = {};
            cached.nodes.forEach((n) => {
              byId[String(n.id)] = n;
            });
            function rebind(list) {
              return list.map((nodeItem) => {
                const node = byId[String(nodeItem.id)] || nodeItem;
                if (nodeItem.children && nodeItem.children.length > 0) {
                  node.children = rebind(nodeItem.children);
                }
                return node;
              });
            }
            const roots = rebind(cached.roots);

            const v = {}, cl = {};
            cached.nodes.forEach((n) => {
              v[n.id] = n.visible;
              if (n.isGroup && !n.open) cl[n.id] = true;
            });
            original.current = { ...v };

            // Load composite preview image for instant background display
            (async () => {
              try {
                let pBlob = item ? await getCachedPreview(item) : null;
                if (!pBlob) {
                  pBlob = await fetchServerPreview(fileName);
                  if (pBlob && item) setCachedPreview(item, pBlob);
                }
                if (pBlob && on) {
                  const img = new Image();
                  img.src = URL.createObjectURL(pBlob);
                  img.onload = () => {
                    if (on) setCompositeImg(img);
                  };
                }
              } catch {
                // Fallback composite load
                const img = new Image();
                img.src = getPreviewUrlServer(fileName);
                img.onload = () => {
                  if (on) setCompositeImg(img);
                };
              }
            })();

            setVis(v);
            setCollapsed(cl);
            setData({ ...cached, roots, byId });
            return;
          }
        } catch (err) {
          console.warn('[PsdLayerViewer] Server layer JSON not ready, falling back to client parser:', err.message);
        }
      }

      // Step B: Fallback to reading file and parsing in browser
      if (!url) return;
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load layered image (${response.status})`);
        const buf = await response.arrayBuffer();
        const d = await parsePsd(buf, (a, b) => on && setProg([a, b]));
        if (!on) return;
        const v = {}, cl = {};
        d.nodes.forEach((n) => {
          v[n.id] = n.visible;
          if (n.isGroup && !n.open) cl[n.id] = true;
          if (n.rgba && n.w > 0 && n.h > 0) {
            const c = document.createElement('canvas');
            c.width = n.w;
            c.height = n.h;
            c.getContext('2d').putImageData(new ImageData(n.rgba, n.w, n.h), 0, 0);
            n.canvas = c;
            imagesRef.current.set(String(n.id), c);
          }
        });
        original.current = { ...v };
        setVis(v);
        setCollapsed(cl);
        setData(d);
      } catch (e) {
        console.warn('Layer view unavailable:', e);
        if (on) failRef.current(e.message);
      }
    }

    loadLayers();
    return () => { on = false; };
  }, [url, item, fileName]);

  const fit = useCallback(() => {
    if (data && stage.current) {
      setZoom(Math.max(0.05, Math.min(1, (stage.current.clientWidth - 32) / Math.max(1, data.width), (stage.current.clientHeight - 32) / Math.max(1, data.height))));
    }
  }, [data]);

  useEffect(() => {
    fit();
  }, [fit]);

  // 2. Continuous Background Preloader for Layer Images (Independent of vis changes)
  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    const needed = data.nodes.filter((n) => {
      if (n.isGroup) return false;
      const id = String(n.id);
      if (imagesRef.current.has(id)) return false;
      if (n.image || n.canvas || n.rgba) return false;
      return Boolean(n.hasImage || typeof n.decodeRgba === 'function');
    });

    if (needed.length === 0) return;

    (async () => {
      const concurrency = 8;
      for (let i = 0; i < needed.length; i += concurrency) {
        if (cancelled) return;
        const chunk = needed.slice(i, i + concurrency);
        await Promise.all(
          chunk.map(async (n) => {
            const id = String(n.id);
            try {
              if (fileName && n.hasImage) {
                let blob = item ? await getCachedLayerImage(item, id) : null;
                if (!blob) {
                  const res = await fetch(getLayerImageUrlServer(fileName, id));
                  if (res.ok) {
                    blob = await res.blob();
                    if (item) setCachedLayerImage(item, id, blob);
                  }
                }
                if (blob && !cancelled) {
                  let img;
                  if (typeof createImageBitmap === 'function') {
                    img = await createImageBitmap(blob);
                  } else {
                    img = new Image();
                    img.src = URL.createObjectURL(blob);
                    await new Promise((r) => { img.onload = r; img.onerror = r; });
                  }
                  imagesRef.current.set(id, img);
                  n.image = img;
                  if (data.byId?.[id]) data.byId[id].image = img;
                }
              } else if (typeof n.decodeRgba === 'function') {
                await n.decodeRgba();
                if (n.rgba && n.w > 0 && n.h > 0) {
                  const c = document.createElement('canvas');
                  c.width = n.w;
                  c.height = n.h;
                  c.getContext('2d').putImageData(new ImageData(n.rgba, n.w, n.h), 0, 0);
                  n.canvas = c;
                  imagesRef.current.set(id, c);
                }
              }
            } catch (e) {
              console.warn('Failed to load layer image:', id, e);
            }
          })
        );

        if (!cancelled) {
          setRenderVer((v) => v + 1);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data, fileName, item]);

  // 3. Hardware-Accelerated Redraw
  useEffect(() => {
    if (!data) return;

    const isCleanState = compositeImg &&
      Object.keys(original.current).length > 0 &&
      data.nodes.every((n) => vis[n.id] === original.current[n.id]);

    const getDrawable = (n) => {
      if (!n) return null;
      const id = String(n.id);
      const fromMap = imagesRef.current.get(id);
      if (fromMap) return fromMap;
      if (n.image) return n.image;
      if (data.byId?.[id]?.image) return data.byId[id].image;
      if (n.canvas) return n.canvas;
      if (n.rgba && n.w > 0 && n.h > 0) {
        const sc = document.createElement('canvas');
        sc.width = n.w;
        sc.height = n.h;
        sc.getContext('2d').putImageData(new ImageData(n.rgba, n.w, n.h), 0, 0);
        n.canvas = sc;
        imagesRef.current.set(id, sc);
        return sc;
      }
      return null;
    };

    const redraw = () => {
      const c = canvas.current;
      if (!c) return;
      if (c.width !== data.width) c.width = data.width;
      if (c.height !== data.height) c.height = data.height;

      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, data.width, data.height);

      if (isCleanState && compositeImg) {
        ctx.drawImage(compositeImg, 0, 0, data.width, data.height);
      } else {
        renderList(ctx, data.roots, vis, data.width, data.height, getDrawable);
      }
    };

    if (rafId.current) cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(redraw);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [data, vis, renderVer, compositeImg]);

  // 4. Selection outline
  useEffect(() => {
    if (!data) return;
    const c = overlay.current;
    if (!c) return;
    if (c.width !== data.width) c.width = data.width;
    if (c.height !== data.height) c.height = data.height;

    const x = c.getContext('2d');
    x.clearRect(0, 0, data.width, data.height);
    x.lineWidth = Math.max(1, 2 / zoom);
    x.strokeStyle = '#1a73e8';
    x.setLineDash([6 / zoom, 4 / zoom]);
    sel.forEach((id) => {
      const b = nodeBounds(data.byId[id]);
      if (b) x.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    });
  }, [data, sel, zoom]);

  const rows = useMemo(() => {
    if (!data) return [];
    const out = [];
    const walk = (list) => [...list].reverse().forEach((n) => {
      out.push(n);
      if (n.isGroup && !collapsed[n.id]) walk(n.children);
    });
    walk(data.roots);
    return out;
  }, [data, collapsed]);

  if (!data) {
    return (
      <div className="psdv-loading">
        <span className="psdv-spinner" />
        <p>Loading layers… {prog[0]} / {prog[1]}</p>
      </div>
    );
  }

  /* click = select, shift+click = range, ctrl/cmd+click = toggle */
  const pick = (n, e) => {
    if (e.shiftKey && anchor.current != null) {
      const a = rows.findIndex((r) => r.id === anchor.current);
      const b = rows.findIndex((r) => r.id === n.id);
      if (a >= 0 && b >= 0) {
        setSel(new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id)));
        return;
      }
    }
    anchor.current = n.id;
    if (e.ctrlKey || e.metaKey) {
      setSel((p) => {
        const q = new Set(p);
        q.has(n.id) ? q.delete(n.id) : q.add(n.id);
        return q;
      });
    } else {
      setSel(new Set([n.id]));
    }
  };

  /* eye: toggles the clicked layer, or every selected layer if it is part of a multi-selection; alt = solo */
  const eye = (n, e) => {
    e.stopPropagation();
    if (e.altKey) {
      const v = {};
      data.nodes.forEach((x) => { v[x.id] = false; });
      for (let p = n; p; p = data.byId[p.parent]) v[p.id] = true;
      descendants(n).forEach((id) => { v[id] = true; });
      setVis(v);
      return;
    }
    const targets = sel.has(n.id) && sel.size > 1 ? [...sel] : [n.id];
    const next = !vis[n.id];
    setVis((v) => {
      const q = { ...v };
      targets.forEach((id) => { q[id] = next; });
      return q;
    });
  };

  const setAll = (val) => setVis(Object.fromEntries(data.nodes.map((n) => [n.id, val])));
  const setSelected = (val) => setVis((v) => {
    const q = { ...v };
    sel.forEach((id) => { q[id] = val; });
    return q;
  });
  const hiddenByParent = (n) => {
    for (let p = data.byId[n.parent]; p; p = data.byId[p.parent]) {
      if (!vis[p.id]) return true;
    }
    return false;
  };
  const zoomBy = (f) => setZoom((z) => Math.min(8, Math.max(0.05, z * f)));

  return (
    <div className="psdv">
      <div className="psdv-stage" ref={stage}>
        <div className="psdv-checker" style={{ width: data.width * zoom, height: data.height * zoom }}>
          <canvas ref={canvas} />
          <canvas ref={overlay} className="psdv-outline" />
        </div>
      </div>
      <aside className="psdv-panel">
        <div className="psdv-head">
          <b>Layers</b>
          <span className="psdv-zoom">
            <button className="psdv-btn" onClick={() => zoomBy(1 / 1.25)}>−</button>
            <button className="psdv-btn" onClick={fit}>{Math.round(zoom * 100)}%</button>
            <button className="psdv-btn" onClick={() => zoomBy(1.25)}>+</button>
          </span>
        </div>
        <div className="psdv-tools">
          <button className="psdv-btn" onClick={() => setAll(true)}>Show all</button>
          <button className="psdv-btn" onClick={() => setAll(false)}>Hide all</button>
          <button className="psdv-btn" onClick={() => setVis({ ...original.current })}>Reset</button>
          {sel.size > 0 && <>
            <button className="psdv-btn" onClick={() => setSelected(true)}>Show {sel.size}</button>
            <button className="psdv-btn" onClick={() => setSelected(false)}>Hide {sel.size}</button>
          </>}
        </div>
        <div className="psdv-list" onClick={(e) => e.target === e.currentTarget && setSel(new Set())}>
          {rows.map((n) => (
            <div
              key={n.id}
              className={`psdv-row${sel.has(n.id) ? ' sel' : ''}${!vis[n.id] || hiddenByParent(n) ? ' off' : ''}`}
              style={{ paddingLeft: 6 + n.depth * 16 }}
              onClick={(e) => pick(n, e)}
            >
              <button className="psdv-eye" title="Show / hide (Alt = solo)" onClick={(e) => eye(n, e)}>
                {vis[n.id] ? '◉' : ''}
              </button>
              {n.isGroup ? (
                <button
                  className="psdv-chevron"
                  onClick={(e) => {
                    e.stopPropagation();
                    setCollapsed((c) => ({ ...c, [n.id]: !c[n.id] }));
                  }}
                >
                  <span style={{ display: 'inline-flex', transform: collapsed[n.id] ? 'rotate(-90deg)' : 'none' }}>⌄</span>
                </button>
              ) : <span className="psdv-chevron" />}
              <Thumb n={n} fileName={fileName} renderVer={renderVer} imagesRef={imagesRef} data={data} />
              <span className="psdv-name" title={n.name}>{n.name || '(unnamed)'}</span>
              <small>{Math.round(n.opacity * 100)}%{n.clipping ? ' ⮡' : ''}</small>
            </div>
          ))}
        </div>
        <div className="psdv-hint">Click: select · Shift+click: range · Ctrl/Cmd+click: add · Eye on a selected layer toggles all selected · Alt+eye: solo</div>
      </aside>
    </div>
  );
}
