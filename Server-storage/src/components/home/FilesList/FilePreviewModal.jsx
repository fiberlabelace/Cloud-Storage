import { useEffect, useMemo, useState } from 'react';
import { SvgIcon } from '../Home';
import PsdLayerViewer from './PsdLayerViewer';
import { kind as getKind, icon as kindIcon, COL, psd, clip } from '../../../utils/driveEngine';
import { getRawFileUrl, readServerFile } from '../../../utils/storageApi';

export default function FilePreviewModal({ item, onClose, onDownload, onTrash }) {
  const k = getKind(item);

  const blobUrl = useMemo(() => {
    if (item.blob) return URL.createObjectURL(item.blob);
    return null;
  }, [item.blob]);

  useEffect(() => {
    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [blobUrl]);

  const url = item.remote ? getRawFileUrl(item.name) : (item.url || blobUrl || '');
  const isLayered = k === 'psd' || k === 'clip';
  const [state, setState] = useState({ loading: (!isLayered && k === 'text'), src: null, text: null });

  useEffect(() => {
    return () => {
      if (state.src) URL.revokeObjectURL(state.src);
    };
  }, [state.src]);

  const [layerFail, setLayerFail] = useState(false); // layered viewer unsupported -> flattened preview

  useEffect(() => {
    let on = true;
    if (isLayered && layerFail) {
      queueMicrotask(() => on && setState({ loading: true, src: null, text: null }));
      (async () => {
        try {
          const blob = item.remote ? await readServerFile(item.name) : (item.blob || (url ? await (await fetch(url)).blob() : null));
          if (!blob) throw new Error('No file data available');
          const previewBlob = k === 'psd' ? await psd(blob, true) : await clip(blob);
          const src = URL.createObjectURL(previewBlob);
          if (on) setState({ loading: false, src, text: null });
        } catch {
          if (on) setState({ loading: false, src: null, text: null });
        }
      })();
    } else if (k === 'text' && item.size < 2e6) {
      fetch(url).then((r) => r.text()).then((text) => on && setState({ loading: false, src: null, text })).catch(() => on && setState({ loading: false, src: null, text: null }));
    } else queueMicrotask(() => on && setState({ loading: false, src: null, text: null }));
    return () => { on = false; };
  }, [k, isLayered, url, item.size, item.name, item.remote, item.blob, layerFail]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kindColor = (kind) => COL[kind] || '#5f6368';

  const none = (msg) => (
    <div className="dv-np">
      <SvgIcon name="file" color="#9aa0a6" style={{ width: 72, height: 72 }} />
      <p>{msg}</p>
      <button className="dv-btn primary" onClick={onDownload}>Download</button>
    </div>
  );

  let body;
  if (isLayered && !layerFail) body = <PsdLayerViewer url={url} item={item} onFail={() => setLayerFail(true)} />;
  else if (state.loading) body = <div className="dv-np"><span className="dv-spin" /><p>Rendering preview…</p></div>;
  else if (k === 'image') body = <img src={url} alt={item.name} />;
  else if (k === 'video') body = <video src={url} controls autoPlay />;
  else if (k === 'audio') body = <audio src={url} controls autoPlay />;
  else if (k === 'pdf') body = <iframe src={url} title={item.name} />;
  else if (state.text !== null) body = <pre>{state.text}</pre>;
  else if (k === 'psd' || k === 'clip') body = state.src ? <img src={state.src} alt={item.name} /> : none('No preview available: no embedded preview image could be read');
  else body = none('No preview available');

  return (
    <div className="dv-preview">
      <div className="dv-pt">
        <button className="dv-ib" onClick={onClose} title="Close"><SvgIcon name="back" /></button>
        <SvgIcon name={kindIcon(k)} color={kindColor(k) === '#5f6368' ? '#f28b82' : kindColor(k)} />
        <span>{item.name}</span>
        <i />
        <button className="dv-ib" onClick={onDownload} title="Download"><SvgIcon name="dl" /></button>
        <button className="dv-ib" onClick={onTrash} title="Move to trash"><SvgIcon name="del" /></button>
      </div>
      <div className={`dv-pb${isLayered && !layerFail ? ' wide' : ''}`} onClick={(e) => e.target === e.currentTarget && onClose()}>{body}</div>
    </div>
  );

}
