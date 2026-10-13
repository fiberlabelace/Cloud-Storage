import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { parsePsd, nodeBounds } from '../../../utils/psdLayers';
import './PsdLayerViewer.scss';

const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w || 1); c.height = Math.max(1, h || 1); return c; };
const layerCanvas = (n) => {
  if (!n.canvas && n.rgba && n.w > 0 && n.h > 0) {
    n.canvas = makeCanvas(n.w, n.h);
    n.canvas.getContext('2d').putImageData(new ImageData(n.rgba, n.w, n.h), 0, 0);
  }
  return n.canvas;
};

/* ---- compositing: list is bottom -> top; `vis` maps node id -> shown ---- */
function renderList(ctx, list, vis, W, H) {
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.clipping || !vis[n.id]) continue;
    const clips = [];
    for (let j = i + 1; j < list.length && list[j].clipping; j++) if (vis[list[j].id]) clips.push(list[j]);
    drawNode(ctx, n, clips, vis, W, H);
  }
}
function drawNode(ctx, n, clips, vis, W, H) {
  if (n.isGroup && !clips.length && n.pass && n.opacity === 1) return renderList(ctx, n.children, vis, W, H);
  ctx.save();
  ctx.globalAlpha = n.opacity;
  ctx.globalCompositeOperation = n.pass ? 'source-over' : n.blend;
  if (!n.isGroup && !clips.length) {
    const c = layerCanvas(n);
    if (c) ctx.drawImage(c, n.left, n.top);
  } else {
    const t = makeCanvas(W, H), tc = t.getContext('2d');
    if (n.isGroup) renderList(tc, n.children, vis, W, H);
    else { const c = layerCanvas(n); if (c) tc.drawImage(c, n.left, n.top); }
    clips.forEach((cl) => {
      const cc = layerCanvas(cl);
      if (!cc) return;
      tc.globalCompositeOperation = 'source-atop';
      tc.globalAlpha = cl.opacity;
      tc.drawImage(cc, cl.left, cl.top);
    });
    ctx.drawImage(t, 0, 0);
  }
  ctx.restore();
  return undefined;
}

const Thumb = ({ n, renderVer }) => {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext('2d');
    x.clearRect(0, 0, 32, 32);
    const src = layerCanvas(n);
    if (!src || !n.w || !n.h) return;
    const s = Math.min(32 / n.w, 32 / n.h);
    x.drawImage(src, (32 - n.w * s) / 2, (32 - n.h * s) / 2, n.w * s, n.h * s);
  }, [n, renderVer]);
  return n.isGroup ? <span className="psdv-thumb" aria-label="Layer group">▣</span> : <canvas ref={ref} width="32" height="32" className="psdv-thumb" />;
};

const descendants = (n) => (n.isGroup ? n.children.flatMap((c) => [c.id, ...descendants(c)]) : []);

export default function PsdLayerViewer({ url, onFail }) {
  const [data, setData] = useState(null);
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
  const failRef = useRef(onFail);
  useEffect(() => { failRef.current = onFail; }, [onFail]);

  useEffect(() => {
    if (!url) return;
    let on = true;
    (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Could not load layered image (${response.status})`);
        const buf = await response.arrayBuffer();
        const d = await parsePsd(buf, (a, b) => on && setProg([a, b]));
        if (!on) return;
        const v = {}, cl = {};
        d.nodes.forEach((n) => { v[n.id] = n.visible; if (n.isGroup && !n.open) cl[n.id] = true; });
        original.current = v;
        setVis(v); setCollapsed(cl); setData(d);
      } catch (e) {
        console.warn('Layer view unavailable:', e);
        if (on) failRef.current(e.message);
      }
    })();
    return () => { on = false; };
  }, [url]);

  const fit = useCallback(() => {
    if (data && stage.current) {
      setZoom(Math.max(0.05, Math.min(1, (stage.current.clientWidth - 32) / Math.max(1, data.width), (stage.current.clientHeight - 32) / Math.max(1, data.height))));
    }
  }, [data]);
  useEffect(() => {
    fit();
  }, [fit]);

  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    const redraw = () => {
      const c = canvas.current;
      if (c) {
        c.width = data.width;
        c.height = data.height;
        renderList(c.getContext('2d'), data.roots, vis, data.width, data.height);
      }
    };

    const needed = data.nodes.filter(
      (n) => vis[n.id] && !n.rgba && !n._decoded && typeof n.decodeRgba === 'function'
    );

    if (needed.length > 0) {
      (async () => {
        const concurrency = 4;
        for (let i = 0; i < needed.length; i += concurrency) {
          if (cancelled) return;
          const chunk = needed.slice(i, i + concurrency);
          await Promise.all(
            chunk.map(async (n) => {
              try {
                await n.decodeRgba();
              } catch (e) {
                console.warn('Failed to decode layer tiles:', e);
              }
            })
          );
        }
        if (!cancelled) {
          redraw();
          setRenderVer((v) => v + 1);
        }
      })();
    }

    redraw();

    return () => {
      cancelled = true;
    };
  }, [data, vis]);

  useEffect(() => {
    if (!data) return;
    const c = overlay.current;
    c.width = data.width; c.height = data.height;
    const x = c.getContext('2d');
    x.lineWidth = Math.max(1, 2 / zoom);
    x.strokeStyle = '#1a73e8';
    x.setLineDash([6 / zoom, 4 / zoom]);
    sel.forEach((id) => { const b = nodeBounds(data.byId[id]); if (b) x.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]); });
  }, [data, sel, zoom]);

  const rows = useMemo(() => {
    if (!data) return [];
    const out = [];
    const walk = (list) => [...list].reverse().forEach((n) => { out.push(n); if (n.isGroup && !collapsed[n.id]) walk(n.children); });
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
      const a = rows.findIndex((r) => r.id === anchor.current), b = rows.findIndex((r) => r.id === n.id);
      if (a >= 0 && b >= 0) { setSel(new Set(rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.id))); return; }
    }
    anchor.current = n.id;
    if (e.ctrlKey || e.metaKey) setSel((p) => { const q = new Set(p); q.has(n.id) ? q.delete(n.id) : q.add(n.id); return q; });
    else setSel(new Set([n.id]));
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
    setVis((v) => { const q = { ...v }; targets.forEach((id) => { q[id] = next; }); return q; });
  };

  const setAll = (val) => setVis(Object.fromEntries(data.nodes.map((n) => [n.id, val])));
  const setSelected = (val) => setVis((v) => { const q = { ...v }; sel.forEach((id) => { q[id] = val; }); return q; });
  const hiddenByParent = (n) => { for (let p = data.byId[n.parent]; p; p = data.byId[p.parent]) if (!vis[p.id]) return true; return false; };
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
            <div key={n.id} className={`psdv-row${sel.has(n.id) ? ' sel' : ''}${!vis[n.id] || hiddenByParent(n) ? ' off' : ''}`} style={{ paddingLeft: 6 + n.depth * 16 }} onClick={(e) => pick(n, e)}>
              <button className="psdv-eye" title="Show / hide (Alt = solo)" onClick={(e) => eye(n, e)}>{vis[n.id] ? '◉' : ''}</button>
              {n.isGroup ? (
                <button className="psdv-chevron" onClick={(e) => { e.stopPropagation(); setCollapsed((c) => ({ ...c, [n.id]: !c[n.id] })); }}>
                  <span style={{ display: 'inline-flex', transform: collapsed[n.id] ? 'rotate(-90deg)' : 'none' }}>⌄</span>
                </button>
              ) : <span className="psdv-chevron" />}
              <Thumb n={n} renderVer={renderVer} />
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
