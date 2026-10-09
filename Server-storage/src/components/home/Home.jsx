import { useState, useEffect, useRef } from 'react';
import './Home.scss';
import {
  P, COL, KL, NAV, kind, icon, sz, dt, zip,
  psd, clip
} from '../../utils/driveEngine';
import {
  copyServerFile, deleteServerFile, getRawFileUrl,
  listServerFiles, readServerFile, renameServerFile, restoreServerFile,
  trashServerFile, uploadServerFile
} from '../../utils/storageApi';

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
  const [serverItems, setServerItems] = useState([]);
  const [databaseReady, setDatabaseReady] = useState(false);
  const [objectUrls, setObjectUrls] = useState({});

  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const searchInputRef = useRef(null);
  const urlMap = useRef(new Map());
  const databaseRef = useRef(null);

  const allItems = [...items, ...serverItems];

  const getUrl = (i) => {
    if (i.remote) return getRawFileUrl(i.name);
    return objectUrls[i.id] || '';
  };

  const addObjectUrls = (storedItems) => storedItems.map((item) => {
    if (!item.remote && item.blob && !urlMap.current.has(item.id)) {
      urlMap.current.set(item.id, URL.createObjectURL(item.blob));
    }
    return urlMap.current.has(item.id) ? { ...item, url: urlMap.current.get(item.id) } : item;
  });

  const get = (id) => allItems.find((i) => i.id === id);
  const inTrash = (i) => {
    while (i) {
      if (i.trashed) return true;
      i = get(i.parent);
    }
    return false;
  };
  const descs = (id) => {
    let r = [];
    allItems.filter((i) => i.parent === id).forEach((c) => r.push(c.id, ...descs(c.id)));
    return r;
  };

  const showToast = (msg, undoCb) => {
    setToastMessage({ msg, undoCb });
    setTimeout(() => setToastMessage(null), 6000);
  };

  useEffect(() => {
    let cancelled = false;
    let db;
    let req;
    try {
      req = indexedDB.open('drive', 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains('s')) req.result.createObjectStore('s');
      };
      req.onerror = () => {
        console.error('IndexedDB open failed', req.error);
        setToastMessage({ msg: `Local storage unavailable: ${req.error?.message || 'database could not be opened'}`, undoCb: null });
      };
      req.onsuccess = () => {
        db = req.result;
        if (cancelled) {
          db.close();
          return;
        }
        databaseRef.current = db;
        const transaction = db.transaction('s');
        const getItems = transaction.objectStore('s').get('items');
        getItems.onerror = () => {
          console.error('IndexedDB read failed', getItems.error);
          setToastMessage({ msg: `Could not load local drive data: ${getItems.error?.message || 'database read failed'}`, undoCb: null });
        };
        getItems.onsuccess = () => {
          if (cancelled) return;
          const storedItems = getItems.result;
          if (storedItems?.length) {
            setItems(addObjectUrls(storedItems.filter((item) => !item.remote)));
            setServerItems(storedItems.filter((item) => item.remote));
          } else {
            const f1 = { id: uid(), name: 'Documents', type: 'folder', parent: 'root', mod: Date.now() };
            const f2 = { id: uid(), name: 'Photos', type: 'folder', parent: 'root', mod: Date.now() };
            setItems([f1, f2]);
          }
          setDatabaseReady(true);
        };
      };
    } catch (err) {
      console.error('IndexedDB initialization failed', err);
      queueMicrotask(() => setToastMessage({ msg: `Local storage unavailable: ${err.message}`, undoCb: null }));
    }
    return () => {
      cancelled = true;
      if (db) db.close();
    };
  }, []);

  useEffect(() => {
    if (!databaseReady || !databaseRef.current) return;
    try {
      const transaction = databaseRef.current.transaction('s', 'readwrite');
      const savedItems = [...items.filter((item) => !item.remote), ...serverItems].map((item) => {
        const storedItem = { ...item };
        delete storedItem.url;
        return storedItem;
      });
      transaction.objectStore('s').put(savedItems, 'items');
      transaction.onerror = () => {
        console.error('IndexedDB write failed', transaction.error);
        setToastMessage({ msg: `Could not save local drive data: ${transaction.error?.message || 'database write failed'}`, undoCb: null });
      };
    } catch (err) {
      console.error('IndexedDB write failed', err);
      queueMicrotask(() => setToastMessage({ msg: `Could not save local drive data: ${err.message}`, undoCb: null }));
    }
  }, [databaseReady, items, serverItems]);

  useEffect(() => {
    setObjectUrls(Object.fromEntries(urlMap.current));
    const liveIds = new Set(items.filter((item) => item.blob && !item.remote).map((item) => item.id));
    for (const [id, url] of urlMap.current) {
      if (!liveIds.has(id)) {
        URL.revokeObjectURL(url);
        urlMap.current.delete(id);
      }
    }
  }, [items]);

  useEffect(() => () => {
    for (const url of urlMap.current.values()) URL.revokeObjectURL(url);
    urlMap.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    listServerFiles(S.v === 'trash')
      .then((files) => {
        if (!cancelled) {
          setServerItems((previous) => files.map((file) => ({
            ...file,
            starred: previous.find((item) => item.id === file.id)?.starred || false
          })));
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('Could not load server files', err);
          setToastMessage({ msg: `Could not load server files: ${err.message}`, undoCb: null });
        }
      });
    return () => { cancelled = true; };
  }, [S.v]);

  // Bộ lọc hiển thị vis()
  const vis = () => {
    let a = allItems.filter((i) => {
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
  const selItems = allItems.filter((i) => S.sel.has(i.id));

  const folderPath = (folderId) => {
    const names = [];
    let folder = get(folderId);
    while (folder && folder.parent !== 'root') {
      names.unshift(folder.name);
      folder = get(folder.parent);
    }
    return names.join('/');
  };

  const refreshServerFiles = async (trash = false) => {
    const files = await listServerFiles(trash);
    setServerItems(files);
  };

  const uploadFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length) return;
    let targetParent = S.cwd;
    if (S.v !== 'drive' || S.q) {
      targetParent = 'root';
      setS((prev) => ({ ...prev, v: 'drive', q: '', cwd: 'root' }));
    }

    const prefix = folderPath(targetParent);
    const failures = [];
    setUploadBox({ files, done: false, progress: 0, currentName: files[0].name, failures: [] });
    for (const file of files) {
      const relativeName = file.webkitRelativePath || file.name;
      const fileName = [prefix, relativeName].filter(Boolean).join('/');
      setUploadBox((previous) => previous ? {
        ...previous,
        currentName: file.name,
        progress: 0
      } : previous);

      try {
        await uploadServerFile(file, fileName, (progress) => {
          setUploadBox((previous) => previous ? { ...previous, progress } : previous);
        });
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        failures.push(`${file.name}: ${err.message}`);
      }
    }

    try {
      await refreshServerFiles(false);
    } catch (err) {
      console.error('Could not refresh server files after upload', err);
      failures.push(`Could not refresh the file list: ${err.message}`);
    }
    const completedUpload = {
      files,
      done: true,
      progress: 100,
      currentName: files[files.length - 1].name,
      failures
    };
    setUploadBox(completedUpload);
    window.setTimeout(() => {
      setUploadBox((current) => current === completedUpload ? null : current);
    }, 6000);
    if (failures.length) {
      setToastMessage({
        msg: `${failures.length} upload operation(s) failed: ${failures[0]}`,
        undoCb: null
      });
    } else {
      showToast(`${files.length} upload${files.length === 1 ? '' : 's'} complete`);
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
    if (folderInputRef.current) folderInputRef.current.value = '';
  };

  // Download logic (Hỗ trợ nén zip trực tiếp)
  const downloadItems = async (list) => {
    const ents = [];
    const add = async (i, p) => {
      if (i.type === 'file') {
        ents.push({ path: p + i.name, blob: i.remote ? await readServerFile(i.name) : i.blob });
      } else {
        const children = allItems.filter((c) => c.parent === i.id && !c.trashed);
        for (const child of children) await add(child, p + i.name + '/');
      }
    };
    try {
      for (const item of list) await add(item, '');
      if (!ents.length) return showToast('Nothing to download');

      const one = list.length === 1 && list[0].type === 'file';
      let name = list[0].name, data;
      if (one) {
        data = ents[0].blob;
        name = list[0].name.split('/').pop();
      } else {
        name = (list.length === 1 ? list[0].name.split('/').pop() : 'Drive download') + '.zip';
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
        const blob = item.remote ? await readServerFile(item.name) : item.blob;
        const previewBlob = k === 'psd' ? await psd(blob, true) : await clip(blob);
        const previewUrl = URL.createObjectURL(previewBlob);
        setPreviewContent(<img src={previewUrl} alt="Preview" />);
      } catch {
        setPreviewContent(
          <div className="np">
            <SvgIcon name="file" color="#9aa0a6" className="bg" />
            <p>No preview available: no embedded preview image could be read</p>
            <button className="tb pr" onClick={() => downloadItems([item])}>Download</button>
          </div>
        );
      }
    } else if (k === 'text' && item.size < 2e6) {
      try {
        const blob = item.remote ? await readServerFile(item.name) : item.blob;
        setPreviewContent(<pre>{await blob.text()}</pre>);
      } catch (err) {
        setPreviewContent(<div className="np"><p>Could not load preview: {err.message}</p></div>);
      }
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
  const moveToTrash = async () => {
    const list = selItems;
    const remoteItems = list.filter((item) => item.remote);
    const localIds = new Set(list.filter((item) => !item.remote).map((item) => item.id));
    const failures = [];
    for (const item of remoteItems) {
      try {
        await trashServerFile(item.name);
      } catch (err) {
        failures.push(`${item.name}: ${err.message}`);
      }
    }
    setItems((prev) => prev.map((i) => (localIds.has(i.id) ? { ...i, trashed: true } : i)));
    setServerItems((prev) => prev.map((item) =>
      remoteItems.some((moved) => moved.id === item.id && !failures.some((failure) => failure.startsWith(`${moved.name}:`)))
        ? { ...item, trashed: true }
        : item
    ));
    setS((prev) => ({ ...prev, sel: new Set() }));
    showToast(failures.length ? `Could not move ${failures[0]} to trash` : `${list.length} ${list.length > 1 ? 'items' : 'item'} moved to trash`, async () => {
      for (const item of remoteItems) {
        if (failures.some((failure) => failure.startsWith(`${item.name}:`))) continue;
        try {
          await restoreServerFile(item.name);
        } catch (err) {
          console.error(`Could not restore ${item.name}:`, err);
          setToastMessage({ msg: `Could not restore ${item.name}: ${err.message}`, undoCb: null });
        }
      }
      setItems((prev) => prev.map((i) => (localIds.has(i.id) ? { ...i, trashed: false } : i)));
      setServerItems((prev) => prev.map((item) =>
        remoteItems.some((restored) => restored.id === item.id) ? { ...item, trashed: false } : item
      ));
      if (failures.length === 0) showToast('Items restored');
    });
  };

  const restoreItems = async (list) => {
    const remoteItems = list.filter((item) => item.remote);
    const localIds = new Set(list.filter((item) => !item.remote).map((item) => item.id));
    const failures = [];
    for (const item of remoteItems) {
      try {
        await restoreServerFile(item.name);
      } catch (err) {
        failures.push(`${item.name}: ${err.message}`);
      }
    }
    setItems((prev) => prev.map((item) => localIds.has(item.id) ? { ...item, trashed: false, parent: 'root' } : item));
    setServerItems((prev) => prev.map((item) =>
      remoteItems.some((restored) => restored.id === item.id && !failures.some((failure) => failure.startsWith(`${restored.name}:`)))
        ? { ...item, trashed: false }
        : item
    ));
    setS((prev) => ({ ...prev, sel: new Set() }));
    if (failures.length) showToast(`Could not restore ${failures[0]}`);
  };

  const deleteForever = async (list) => {
    const ids = new Set(list.flatMap((i) => [i.id, ...descs(i.id)]));
    const failures = [];
    for (const item of list.filter((entry) => entry.remote)) {
      try {
        await deleteServerFile(item.name, S.v === 'trash');
      } catch (err) {
        failures.push(`${item.name}: ${err.message}`);
      }
    }
    setItems((prev) => prev.filter((i) => !ids.has(i.id)));
    const removedIds = new Set(list.filter((item) => item.remote && !failures.some((failure) => failure.startsWith(`${item.name}:`))).map((item) => item.id));
    setServerItems((prev) => prev.filter((item) => !removedIds.has(item.id)));
    setS((prev) => ({ ...prev, sel: new Set() }));
    if (failures.length) showToast(`Could not delete ${failures[0]}`);
  };

  const renameItem = (i) => {
    const currentName = i.remote ? i.name.split('/').pop() : i.name;
    setDialogState({
      title: 'Rename',
      defaultValue: currentName,
      okText: 'OK',
      onOk: async (val) => {
        if (val.trim() && val.trim() !== currentName) {
          if (i.remote) {
            const pathParts = i.name.split('/');
            pathParts[pathParts.length - 1] = val.trim();
            try {
              await renameServerFile(i.name, pathParts.join('/'));
              await refreshServerFiles(S.v === 'trash');
            } catch (err) {
              showToast(`Could not rename file: ${err.message}`);
            }
            return;
          }
          setItems((prev) => prev.map((it) => (it.id === i.id ? { ...it, name: val.trim(), mod: Date.now() } : it)));
        }
      }
    });
  };

  const copyItems = async (list) => {
    const remoteFiles = list.filter((item) => item.remote && item.type === 'file');
    const localCopies = list.filter((item) => !item.remote && item.type === 'file').map((item) => ({
      ...item, id: uid(), name: 'Copy of ' + item.name, mod: Date.now()
    }));
    setItems((prev) => [...prev, ...localCopies]);
    const failures = [];
    for (const item of remoteFiles) {
      const basePath = item.name.split('/');
      basePath[basePath.length - 1] = `Copy of ${basePath[basePath.length - 1]}`;
      try {
        await copyServerFile(item.name, basePath.join('/'));
      } catch (err) {
        failures.push(`${item.name}: ${err.message}`);
      }
    }
    if (remoteFiles.length) {
      try {
        await refreshServerFiles(S.v === 'trash');
      } catch (err) {
        failures.push(`Could not refresh the file list: ${err.message}`);
      }
    }
    if (failures.length) showToast(`Could not copy ${failures[0]}`);
  };

  const toggleStarred = (list) => {
    const allStarred = list.every((item) => item.starred);
    const selectedIds = new Set(list.map((item) => item.id));
    setItems((prev) => prev.map((item) =>
      selectedIds.has(item.id) ? { ...item, starred: !allStarred } : item
    ));
    setServerItems((prev) => prev.map((item) =>
      selectedIds.has(item.id) ? { ...item, starred: !allStarred } : item
    ));
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
          ['rest', 'Restore', () => restoreItems(currentSel)],
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
          ['copy', 'Make a copy', () => copyItems(currentSel)],
          ['starb', currentSel.every((i) => i.starred) ? 'Remove from starred' : 'Add to starred', () => {
            toggleStarred(currentSel);
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
          ['up', 'File upload', () => {
            console.log('Upload clicked:', fileInputRef.current);
            fileInputRef.current?.click();
          }],
          ['folder', 'Folder upload', () => folderInputRef.current.click()]
        ]
      });
    }
  };

  const usedBytes = allItems.reduce((s, i) => s + (i.size || 0), 0);
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
              e.stopPropagation();
              const r = e.currentTarget.getBoundingClientRect();
              setMenuState({
                x: r.left,
                y: r.bottom + 4,
                list: [
                  ['nf', 'New folder', createFolder],
                  '-',
                  ['up', 'File upload', () => {
            console.log('Upload clicked:', fileInputRef.current);
            fileInputRef.current?.click();
          }],
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
                      restoreItems(selItems);
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
                      toggleStarred(selItems);
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
            <span>
              {uploadBox.done
                ? uploadBox.failures.length
                  ? `${uploadBox.failures.length} upload(s) failed`
                  : `${uploadBox.files.length} upload(s) complete`
                : `Uploading ${uploadBox.currentName} (${uploadBox.progress}%)`}
            </span>
            <button className="ib" onClick={() => setUploadBox(null)}><SvgIcon name="x" /></button>
          </div>
          {uploadBox.files.slice(0, 6).map((f, idx) => (
            <div className="ur" key={idx}>
              <SvgIcon name="file" color="#5f6368" />
              <span>{f.name}</span>
              {uploadBox.failures.some((failure) => failure.startsWith(`${f.name}:`))
                ? <span className="upload-failed">Failed</span>
                : uploadBox.done
                  ? <SvgIcon name="ok" color="#188038" />
                  : uploadBox.currentName === f.name
                    ? <span>{uploadBox.progress}%</span>
                    : <b className="sp"></b>}
            </div>
          ))}
          {uploadBox.files.length > 6 && <div className="ur">+{uploadBox.files.length - 6} more file(s)</div>}
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