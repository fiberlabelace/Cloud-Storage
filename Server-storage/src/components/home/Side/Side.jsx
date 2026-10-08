import React, { useRef } from 'react';
import './Side.scss';

const Side = ({ fetchFiles }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const formData = new FormData();
    for (const f of files) {
      formData.append('myFile', f);
    }

    // Change:
    fetch('https://fiber-label.tailfc4e35.ts.net/api/files', {
      method: 'POST',
      body: formData
    })
      .then((res) => res.json())
      .then(() => {
        fileInputRef.current.value = '';
        fetchFiles();
      })
      .catch((err) => console.error(err));
  };

  return (
    <aside className="gdrive-sidebar p-3 d-flex flex-column gap-2">
      <input
        type="file"
        ref={fileInputRef}
        multiple
        className="d-none"
        onChange={handleFileChange}
      />

      <button
        type="button"
        className="btn btn-white shadow-sm rounded-pill py-2 px-4 d-flex align-items-center gap-2 fw-semibold border mb-3 gdrive-new-btn"
        onClick={() => fileInputRef.current.click()}
      >
        <span className="fs-5 text-primary">+</span>
        <span>New Upload</span>
      </button>

      <div className="nav flex-column nav-pills gap-1">
        <button className="nav-link active text-start rounded-pill px-3">
          📁 My Drive
        </button>
        <button className="nav-link text-dark text-start rounded-pill px-3">
          💻 Computers
        </button>
        <button className="nav-link text-dark text-start rounded-pill px-3">
          ⭐ Starred
        </button>
        <button className="nav-link text-dark text-start rounded-pill px-3">
          🗑️ Trash
        </button>
      </div>

      <div className="mt-auto border-top pt-3">
        <button
          type="button"
          onClick={fetchFiles}
          className="btn btn-sm btn-outline-secondary w-100 rounded-pill"
        >
          🔄 Refresh Drive
        </button>
      </div>
    </aside>
  );
};

export default Side;