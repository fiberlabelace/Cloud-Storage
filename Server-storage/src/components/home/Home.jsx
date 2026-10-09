import React, { useState, useEffect, useRef } from 'react';
import './Home.scss';
import {
  P, COL, KL, NAV, kind, icon, sz, dt, zip,
  getThumbnailUrl, psd, clip
} from '../../utils/driveEngine';

// Render Icon SVG
export const SvgIcon = ({ name, color, className = '', style = {} }) => (
  <svg
    className={`i ${className}`}
    viewBox="0 0 24 24"
    style={{ ...(color ? { fill: color } : {}), ...style }}
  >
    <path d={P[name] || P.file} />
  </svg>
);

const uid = () => Math.random().toString(36).slice(2, 10);

const Home = () => {
  const [items, setItems] = useState([]);
  const [S, setS] = useState({
    v: 'drive',
    cwd: 'root',
    sel: new Set(),
    mode: 'list',
    k: 'name',
    d: 1,
    q: '',
    f: ''
  });
  const [menuState, setMenuState] = useState(null); // { x, y, list }
  const [dialogState, setDialogState] = useState(null); // { title, body, okText, onOk, type, defaultValue }
  const [previewItem, setPreviewItem] = useState(null);
  const [previewContent, setPreviewContent] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  const [uploadBox, setUploadBox] = useState(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [draggedItemId, setDraggedItemId] = useState(null);

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const urlMap = useRef(new Map());

  const getUrl = (i) => {
    if (!urlMap.current.has(i.id)) {
      urlMap.current.set(i.id, URL.createObjectURL(i.blob));
    }
    return urlMap.current.get(i.id);
  };

  const get = (id) => items.find((i) => i.id === id);
  const inTrash = (i) => {
    while (i) {
      if (i.trashed) return true;
      i = get(i.parent);
    }
    return false;
  };
  const descs = (id) => {
    let r = [];
    items.filter((i) => i.parent === id).forEach((c) => r.push(c.id, ...descs(c.id)));
    return r;
  };

  const showToast = (msg, undoCb) => {
    setToastMessage({ msg, undoCb });
    setTimeout(() => setToastMessage(null), 6000);
  };

  // Khởi tạo IndexedDB đúng theo code gốc
  useEffect(() => {
    const initDb = async () => {
      try {
        const req = indexedDB.open('drive', 1);
        req.onupgradeneeded = () => req.result.createObjectStore('s');
        req.onsuccess = () => {
          const db = req.result;
          const g = db.transaction('s').objectStore('s').get('items');
          g.onsuccess = () => {
            if (g.result && g.result.length > 0) {
              setItems(g.result);
            } else {
              const f1 = { id: uid(), name: 'Documents', type: 'folder', parent: 'root', mod: Date.now() };
              const f2 = { id: uid(), name: 'Photos', type: 'folder', parent: 'root', mod: Date.now() };
              setItems([f1, f2]);
            }
          };
        };
      } catch (e) {
        console.error('IndexedDB error', e);
      }
    };
    initDb();
  }, []);

  // Tự động lưu items vào IndexedDB mỗi khi thay đổi
  useEffect(() => {
    if (items.length === 0) return;
    try {
      const req = indexedDB.open('drive', 1);
      req.onsuccess = () => {
        req.result.transaction('s', 'readwrite').objectStore('s').put(items, 'items');
      };
    } catch (e) {}
  }, [items]);

  // Bộ lọc hiển thị vis()
  const vis = () => {
    let a = items.filter((i) => {
      if (S.v === 'trash') return i.trashed;
      if (inTrash(i)) return false;
      if (S.q) return (i.name || '').toLowerCase().includes(S.q.toLowerCase());
      if (S.v === 'starred') return i.starred;
      if (S.v === 'recent') return i.type === 'file';
      if (S.v === 'shared') return false;
      return i.parent === S.cwd;
    });
    if (S.f) a = a.filter((i) => kind(i) === S.f);
    const k = S.k, d = S.d;
    return a.sort((x, y) => {
      if (S.v === 'recent') return y.mod - x.mod;
      if (x.type !== y.type) return x.type === 'folder' ? -1 : 1;
      return d * (
        k === 'name' ? x.name.localeCompare(y.name, undefined, { numeric: true }) :
        k === 'mod' ? x.mod - y.mod : ((x.size || 0) - (y.size || 0))
      );
    });
  };

  const visibleItems = vis();
  const selItems = items.filter((i) => S.sel.has(i.id));

  // Tải lên files / folder
  const uploadFiles = (fileList) => {
    const fs = [...fileList];
    if (!fs.length) return;
    let targetParent = S.cwd;
    if (S.v !== 'drive' || S.q) {
      targetParent = 'root';
      setS((prev) => ({ ...prev, v: 'drive', q: '', cwd: 'root' }));
    }

    const newCreatedItems = [];
    fs.forEach((f) => {
      let p = targetParent;
      const relPath = (f.webkitRelativePath || '').split('/').slice(0, -1);
      relPath.forEach((n) => {
        let found = items.find((x) => x.type === 'folder' && x.parent === p && x.name === n && !x.trashed);
        if (!found) {
          found = { id: uid(), name: n, type: 'folder', parent: p, mod: Date.now() };
          newCreatedItems.push(found);
        }
        p = found.id;
      });
      newCreatedItems.push({
        id: uid(),
        name: f.name,
        type: 'file',
        parent: p,
        mime: f.type,
        size: f.size,
        blob: f,
        mod: Date.now()
      });
    });

    setItems((prev) => [...prev, ...newCreatedItems]);
    setUploadBox({ files: fs, done: false });
    setTimeout(() => {
      setUploadBox((prev) => (prev ? { ...prev, done: true } : null));
    }, 900);
  };

  // Download logic (Hỗ trợ nén zip trực tiếp)
  const downloadItems = async (list) => {
    const ents = [];
    const add = (i, p) => {
      if (i.type === 'file') ents.push({ path: p + i.name, blob: i.blob });
      else items.filter((c) => c.parent === i.id && !c.trashed).forEach((c) => add(c, p + i.name + '/'));
    };
    list.forEach((i) => add(i, ''));
    if (!ents.length) return showToast('Nothing to download');

    const one = list.length === 1 && list[0].type === 'file';
    let name = list[0].name, data;
    try {
      if (one) {
        data = list[0].blob;
      } else {
        name = (list.length === 1 ? list[0].name : 'Drive download') + '.zip';
        data = await zip(ents);
      }
      const a = document.createElement('a');
      a.href = URL.createObjectURL(data);
      a.download = name;
      document.body.append(a);
      a.click();
      a.remove();
    } catch (e) {
      showToast('Download failed: ' + (e.message || ''));
    }
  };

  // Xử lý Preview PSD, CSP, Images, Video, Audio, Docs
  const handleOpenItem = async (item) => {
    if (item.type === 'folder') {
      setS((prev) => ({ ...prev, v: 'drive', cwd: item.id, q: '', f: '', sel: new Set() }));
      return;
    }

    setPreviewItem(item);
    const k = kind(item);
    const u = getUrl(item);

    if (k === 'image') {
      setPreviewContent(<img src={u} alt={item.name} />);
    } else if (k === 'video') {
      setPreviewContent(<video src={u} controls autoPlay />);
    } else if (k === 'audio') {
      setPreviewContent(<audio src={u} controls autoPlay />);
    } else if (k === 'pdf') {
      setPreviewContent(<iframe src={u} title="Preview" />);
    } else if (k === 'psd' || k === 'clip') {
      setPreviewContent(
        <div className="np">
          <b className="sp" style={{ display: 'inline-block' }}></b>
          <p>Rendering preview…</p>
        </div>
      );
      try {
        const previewBlob = k === 'psd' ? await psd(item.blob, true) : await clip(item.blob);
        const previewUrl = URL.createObjectURL(previewBlob);
        setPreviewContent(<img src={previewUrl} alt="Preview" />);
      } catch (e) {
        setPreviewContent(
          <div className="np">
            <SvgIcon name="file" color="#9aa0a6" className="bg" />
            <p>No preview available: no embedded preview image could be read</p>
            <button className="tb pr" onClick={() => downloadItems([item])}>Download</button>
          </div>
        );
      }
    } else if (k === 'text' && item.size < 2e6) {
      const text = await item.blob.text();
      setPreviewContent(<pre>{text}</pre>);
    } else {
      setPreviewContent(
        <div className="np">
          <SvgIcon name="file" color="#9aa0a6" className="bg" />
          <p>No preview available</p>
          <button className="tb pr" onClick={() => downloadItems([item])}>Download</button>
        </div>
      );
    }
  };

  // Thao tác Xóa, Đổi tên, Di chuyển
  const moveToTrash = () => {
    const list = selItems;
    setItems((prev) => prev.map((i) => (S.sel.has(i.id) ? { ...i, trashed: true } : i)));
    setS((prev) => ({ ...prev, sel: new Set() }));
    showToast(`${list.length} ${list.length > 1 ? 'items' : 'item'} moved to trash`, () => {
      setItems((prev) => prev.map((i) => (list.some((x) => x.id === i.id) ? { ...i, trashed: false } : i)));
    });
  };

  const deleteForever = (list) => {
    const ids = new Set(list.flatMap((i) => [i.id, ...descs(i.id)]));
    setItems((prev) => prev.filter((i) => !ids.has(i.id)));
    setS((prev) => ({ ...prev, sel: new Set() }));
  };

  const renameItem = (i) => {
    setDialogState({
      title: 'Rename',
      defaultValue: i.name,
      okText: 'OK',
      onOk: (val) => {
        if (val.trim()) {
          setItems((prev) => prev.map((it) => (it.id === i.id ? { ...it, name: val.trim(), mod: Date.now() } : it)));
        }
      }
    });
  };

  const createFolder = () => {
    setDialogState({
      title: 'New folder',
      defaultValue: 'Untitled folder',
      okText: 'Create',
      onOk: (val) => {
        const f = { id: uid(), name: val.trim() || 'Untitled folder', type: 'folder', parent: S.cwd, mod: Date.now() };
        setItems((prev) => [...prev, f]);
      }
    });
  };

  // Context Menu
  const openContextMenu = (e, targetItem = null) => {
    e.preventDefault();
    const x = e.clientX, y = e.clientY;
    let currentSel = selItems;

    if (targetItem && !S.sel.has(targetItem.id)) {
      setS((prev) => ({ ...prev, sel: new Set([targetItem.id]) }));
      currentSel = [targetItem];
    }

    const one = currentSel.length === 1 ? currentSel[0] : null;

    if (S.v === 'trash') {
      setMenuState({
        x, y,
        list: [
          ['rest', 'Restore', () => {
            setItems((prev) => prev.map((i) => (S.sel.has(i.id) ? { ...i, trashed: false, parent: 'root' } : i)));
            setS((prev) => ({ ...prev, sel: new Set() }));
          }],
          ['del', 'Delete forever', () => deleteForever(currentSel)]
        ]
      });
      return;
    }

    if (currentSel.length > 0) {
      setMenuState({
        x, y,
        list: [
          ...(one ? [[one.type === 'folder' ? 'folder' : 'eye', one.type === 'folder' ? 'Open' : 'Preview', () => handleOpenItem(one)]] : []),
          ['dl', 'Download', () => downloadItems(currentSel)],
          '-',
          ...(one ? [['edit', 'Rename', () => renameItem(one)]] : []),
          ['copy', 'Make a copy', () => {
            const copies = currentSel.filter((i) => i.type === 'file').map((i) => ({
              ...i, id: uid(), name: 'Copy of ' + i.name, mod: Date.now()
            }));
            setItems((prev) => [...prev, ...copies]);
          }],
          ['starb', currentSel.every((i) => i.starred) ? 'Remove from starred' : 'Add to starred', () => {
            const allStarred = currentSel.every((i) => i.starred);
            setItems((prev) => prev.map((i) => (S.sel.has(i.id) ? { ...i, starred: !allStarred } : i)));
          }],
          '-',
          ['del', 'Move to trash', moveToTrash]
        ]
      });
    } else if (S.v === 'drive') {
      setMenuState({
        x, y,
        list: [
          ['nf', 'New folder', createFolder],
          '-',
          ['up', 'File upload', () => fileInputRef.current.click()],
          ['folder', 'Folder upload', () => folderInputRef.current.click()]
        ]
      });
    }
  };

  const usedBytes = items.reduce((s, i) => s + (i.size || 0), 0);
  const usedPercent = Math.max(1, Math.min(100, (usedBytes / 16106127360) * 100));

  return (
    <div
      className="gdrive-container"
      onClick={() => setMenuState(null)}
      onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true); }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
      }}
    >
      <input type="file" ref={fileInputRef} multiple hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />
      <input type="file" ref={folderInputRef} webkitdirectory="" hidden onChange={(e) => { uploadFiles(e.target.files); e.target.value = ''; }} />

      {/* Header */}
      <header>
        <button className="ib" title="Main menu"><SvgIcon name="menu" /></button>
        <div className="logo">
          <svg viewBox="0 0 87.3 78">
            <path fill="#0066da" d="m6.6 66.85 3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8h-27.5c0 1.55.4 3.1 1.2 4.5z"/>
            <path fill="#00ac47" d="m43.65 25-13.75-23.8c-1.35.8-2.5 1.9-3.3 3.3l-25.4 44a9.06 9.06 0 0 0-1.2 4.5h27.5z"/>
            <path fill="#ea4335" d="m73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5h-27.5l5.85 11.5z"/>
            <path fill="#00832d" d="m43.65 25 13.75-23.8c-1.35-.8-2.9-1.2-4.5-1.2h-18.5c-1.6 0-3.15.45-4.5 1.2z"/>
            <path fill="#2684fc" d="m59.8 53h-32.3l-13.75 23.8c1.35.8 2.9 1.2 4.5 1.2h50.8c1.6 0 3.15-.45 4.5-1.2z"/>
            <path fill="#ffba00" d="m73.4 26.5-12.7-22c-.8-1.4-1.95-2.5-3.3-3.3l-13.75 23.8 16.15 28h27.45c0-1.55-.4-3.1-1.2-4.5z"/>
          </svg>
          <span>Drive</span>
        </div>
        <div className="search">
          <button className="ib"><SvgIcon name="search" /></button>
          <input
            ref={searchInputRef}
            placeholder="Search in Drive"
            value={S.q}
            onChange={(e) => setS((prev) => ({ ...prev, q: e.target.value, sel: new Set() }))}
          />
          {S.q && (
            <button className="ib" onClick={() => setS((prev) => ({ ...prev, q: '', sel: new Set() }))}>
              <SvgIcon name="x" />
            </button>
          )}
        </div>
        <div className="av">U</div>
      </header>

      {/* Body Wrap */}
      <div className="wrap">
        {/* Sidebar */}
        <aside id="sd">
          <button
            className="new"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenuState({
                x: r.left,
                y: r.bottom + 4,
                list: [
                  ['nf', 'New folder', createFolder],
                  '-',
                  ['up', 'File upload', () => fileInputRef.current.click()],
                  ['folder', 'Folder upload', () => folderInputRef.current.click()]
                ]
              });
            }}
          >
            <SvgIcon name="add" />
            <span>New</span>
          </button>

          {NAV.map(([k, t, icn]) => (
            <div
              key={k}
              className={`ni ${S.v === k && !S.q ? 'on' : ''}`}
              onClick={() => setS((prev) => ({ ...prev, v: k, q: '', cwd: 'root', sel: new Set(), f: '' }))}
            >
              <SvgIcon name={icn} />
              <span>{t}</span>
            </div>
          ))}

          <div className="st">
            <div className="bar"><i style={{ width: `${usedPercent}%` }}></i></div>
            {sz(usedBytes)} of 15 GB used<br /><br />
            <button className="tb">Get more storage</button>
          </div>
        </aside>

        {/* Main Workspace */}
        <main onContextMenu={(e) => openContextMenu(e)}>
          {/* Header Action Bar */}
          <div className="hd">
            {S.sel.size > 0 ? (
              <div className="selbar">
                <button className="ib" onClick={() => setS((prev) => ({ ...prev, sel: new Set() }))}>
                  <SvgIcon name="x" />
                </button>
                <b>{S.sel.size} selected</b>
                {S.v === 'trash' ? (
                  <>
                    <button className="ib" title="Restore" onClick={() => {
                      setItems((prev) => prev.map((i) => (S.sel.has(i.id) ? { ...i, trashed: false, parent: 'root' } : i)));
                      setS((prev) => ({ ...prev, sel: new Set() }));
                    }}><SvgIcon name="rest" /></button>
                    <button className="ib" title="Delete forever" onClick={() => deleteForever(selItems)}><SvgIcon name="del" /></button>
                  </>
                ) : (
                  <>
                    <button className="ib" title="Download" onClick={() => downloadItems(selItems)}><SvgIcon name="dl" /></button>
                    {S.sel.size === 1 && (
                      <button className="ib" title="Rename" onClick={() => renameItem(selItems[0])}><SvgIcon name="edit" /></button>
                    )}
                    <button className="ib" title="Add to starred" onClick={() => {
                      const allSt = selItems.every((i) => i.starred);
                      setItems((prev) => prev.map((i) => (S.sel.has(i.id) ? { ...i, starred: !allSt } : i)));
                    }}><SvgIcon name="starb" /></button>
                    <button className="ib" title="Move to trash" onClick={moveToTrash}><SvgIcon name="del" /></button>
                  </>
                )}
              </div>
            ) : (
              <div className="crumbs">
                <span className="cur">{S.q ? 'Search results' : { drive: 'My Drive', shared: 'Shared with me', recent: 'Recent', starred: 'Starred', trash: 'Trash' }[S.v]}</span>
              </div>
            )}

            <div className="vt">
              <button
                className={`ib ${S.mode === 'list' ? 'on' : ''}`}
                onClick={() => setS((prev) => ({ ...prev, mode: 'list' }))}
              ><SvgIcon name={S.mode === 'list' ? 'ok' : 'list'} /></button>
              <button
                className={`ib ${S.mode === 'grid' ? 'on' : ''}`}
                onClick={() => setS((prev) => ({ ...prev, mode: 'grid' }))}
              ><SvgIcon name={S.mode === 'grid' ? 'ok' : 'grid'} /></button>
            </div>
          </div>

          {/* Chips Type Filter */}
          {S.v !== 'trash' && (
            <div className="chips">
              <div
                className={`chip ${S.f ? 'on' : ''}`}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuState({
                    x: r.left,
                    y: r.bottom + 4,
                    list: Object.entries(KL).map(([k, label]) => [
                      k === S.f ? 'ok' : '',
                      label,
                      () => setS((prev) => ({ ...prev, f: k }))
                    ])
                  });
                }}
              >
                {KL[S.f] || 'Type'}
                <SvgIcon name="dd" className="sm" />
              </div>
            </div>
          )}

          {/* Item List / Grid */}
          <div className="sc">
            {visibleItems.length === 0 ? (
              <div className="em">
                <SvgIcon name="folder" color="#dadce0" className="bg" />
                <h3>No items found</h3>
                Drop files here to upload
              </div>
            ) : S.mode === 'list' ? (
              <>
                <div className="r h">
                  <div className="c" onClick={() => setS((prev) => ({ ...prev, k: 'name', d: prev.k === 'name' ? -prev.d : 1 }))}>Name</div>
                  <div className="c o">Owner</div>
                  <div className="c" onClick={() => setS((prev) => ({ ...prev, k: 'mod', d: prev.k === 'mod' ? -prev.d : 1 }))}>Last modified</div>
                  <div className="c z" onClick={() => setS((prev) => ({ ...prev, k: 'size', d: prev.k === 'size' ? -prev.d : 1 }))}>File size</div>
                  <div></div>
                </div>
                {visibleItems.map((i) => {
                  const k = kind(i);
                  return (
                    <div
                      key={i.id}
                      className={`r ${S.sel.has(i.id) ? 's' : ''}`}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          setS((prev) => {
                            const next = new Set(prev.sel);
                            next.has(i.id) ? next.delete(i.id) : next.add(i.id);
                            return { ...prev, sel: next };
                          });
                        } else {
                          setS((prev) => ({ ...prev, sel: new Set([i.id]) }));
                        }
                      }}
                      onDoubleClick={() => handleOpenItem(i)}
                      onContextMenu={(e) => { e.stopPropagation(); openContextMenu(e, i); }}
                    >
                      <div className="nm">
                        <SvgIcon name={icon(k)} color={COL[k]} />
                        <span className="tx">{i.name}</span>
                        {i.starred && <SvgIcon name="star" color="#5f6368" className="sm" />}
                      </div>
                      <div className="c o">me</div>
                      <div className="c">{dt(i.mod)}</div>
                      <div className="c z">{sz(i.size)}</div>
                      <div className="act">
                        {i.type === 'file' && (
                          <button className="ib" onClick={(e) => { e.stopPropagation(); downloadItems([i]); }}><SvgIcon name="dl" /></button>
                        )}
                        <button className="ib" onClick={(e) => { e.stopPropagation(); renameItem(i); }}><SvgIcon name="edit" /></button>
                        <button className="ib" onClick={(e) => { e.stopPropagation(); openContextMenu(e, i); }}><SvgIcon name="more" /></button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="g" style={{ marginTop: '12px' }}>
                {visibleItems.map((i) => {
                  const k = kind(i);
                  return (
                    <div
                      key={i.id}
                      className={`card ${S.sel.has(i.id) ? 's' : ''}`}
                      onClick={(e) => {
                        if (e.ctrlKey || e.metaKey) {
                          setS((prev) => {
                            const next = new Set(prev.sel);
                            next.has(i.id) ? next.delete(i.id) : next.add(i.id);
                            return { ...prev, sel: next };
                          });
                        } else {
                          setS((prev) => ({ ...prev, sel: new Set([i.id]) }));
                        }
                      }}
                      onDoubleClick={() => handleOpenItem(i)}
                      onContextMenu={(e) => { e.stopPropagation(); openContextMenu(e, i); }}
                    >
                      <div className="ch">
                        <SvgIcon name={icon(k)} color={COL[k]} />
                        <span className="tx">{i.name}</span>
                        <button className="ib" onClick={(e) => { e.stopPropagation(); openContextMenu(e, i); }}><SvgIcon name="more" /></button>
                      </div>
                      <div className="th">
                        {k === 'image' ? (
                          <img src={getUrl(i)} alt="" draggable="false" />
                        ) : (
                          <SvgIcon name={icon(k)} color={COL[k]} className="bg" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Drop Zone Box */}
      {isDraggingFile && <div id="dz">Drop files here to upload</div>}

      {/* Upload Status Card */}
      {uploadBox && (
        <div id="up">
          <div className="uh">
            <span>{uploadBox.done ? `${uploadBox.files.length} uploads complete` : `Uploading ${uploadBox.files.length} item(s)`}</span>
            <button className="ib" onClick={() => setUploadBox(null)}><SvgIcon name="x" /></button>
          </div>
          {uploadBox.files.slice(0, 6).map((f, idx) => (
            <div className="ur" key={idx}>
              <SvgIcon name="file" color="#5f6368" />
              <span>{f.name}</span>
              {uploadBox.done ? <SvgIcon name="ok" color="#188038" /> : <b className="sp"></b>}
            </div>
          ))}
        </div>
      )}

      {/* Context Menu Popup */}
      {menuState && (
        <div
          className="menu"
          style={{ left: `${menuState.x}px`, top: `${menuState.y}px` }}
          onClick={(e) => e.stopPropagation()}
        >
          {menuState.list.map((r, n) => (
            r === '-' ? <hr key={n} /> : (
              <div key={n} onClick={() => { setMenuState(null); r[2](); }}>
                {r[0] ? <SvgIcon name={r[0]} /> : <span className="i"></span>}
                {r[1]}
              </div>
            )
          ))}
        </div>
      )}

      {/* Dialog Modal */}
      {dialogState && (
        <div className="ov" onClick={() => setDialogState(null)}>
          <div className="dlg" onClick={(e) => e.stopPropagation()}>
            <h2>{dialogState.title}</h2>
            <input
              autoFocus
              defaultValue={dialogState.defaultValue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  dialogState.onOk(e.target.value);
                  setDialogState(null);
                } else if (e.key === 'Escape') {
                  setDialogState(null);
                }
              }}
              id="dlgInput"
            />
            <div className="df">
              <button className="tb nb" onClick={() => setDialogState(null)}>Cancel</button>
              <button
                className="tb pr"
                onClick={() => {
                  const input = document.getElementById('dlgInput');
                  dialogState.onOk(input.value);
                  setDialogState(null);
                }}
              >
                {dialogState.okText}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fullscreen Preview Overlay */}
      {previewItem && (
        <div className="pv">
          <div className="pt">
            <button className="ib" title="Close" onClick={() => setPreviewItem(null)}><SvgIcon name="back" /></button>
            <SvgIcon name={icon(kind(previewItem))} color="#f28b82" />
            <span>{previewItem.name}</span>
            <i></i>
            <button className="ib" title="Download" onClick={() => downloadItems([previewItem])}><SvgIcon name="dl" /></button>
            <button className="ib" title="Move to trash" onClick={() => { setPreviewItem(null); moveToTrash(); }}><SvgIcon name="del" /></button>
          </div>
          <div className="pb" onClick={(e) => { if (e.target.classList.contains('pb')) setPreviewItem(null); }}>
            {previewContent}
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="toast">
          <span>{toastMessage.msg}</span>
          {toastMessage.undoCb && (
            <b onClick={() => { toastMessage.undoCb(); setToastMessage(null); }}>Undo</b>
          )}
        </div>
      )}
    </div>
  );
};

export default Home;