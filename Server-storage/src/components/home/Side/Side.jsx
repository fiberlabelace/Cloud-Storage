import React, { useRef, useState } from 'react';
import './Side.scss';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2 MB per chunk
const API_BASE = 'https://fiber-label.tailfc4e35.ts.net/api';

const Side = ({ fetchFiles }) => {
  const fileInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null); // null or percentage (0 - 100)
  const [uploadingFileName, setUploadingFileName] = useState('');

  const uploadFileInChunks = async (file) => {
    // 1. Initialize upload session
    const initRes = await fetch(`${API_BASE}/upload/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        totalSize: file.size,
        mimeType: file.type || 'application/octet-stream',
      }),
    });

    if (!initRes.ok) throw new Error('Failed to initialize upload session');
    const { uploadId } = await initRes.json();

    let startByte = 0;

    // 2. Loop through slices
    while (startByte < file.size) {
      const endByte = Math.min(startByte + CHUNK_SIZE, file.size);
      const chunk = file.slice(startByte, endByte);

      let success = false;
      let retries = 0;

      while (!success && retries < 5) {
        try {
          const chunkRes = await fetch(`${API_BASE}/upload/chunk?uploadId=${uploadId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk,
          });

          if (!chunkRes.ok) throw new Error('Chunk upload failed');

          const data = await chunkRes.json();
          startByte = endByte;
          setUploadProgress(data.progress);
          success = true;
        } catch (err) {
          retries += 1;
          console.warn(`Chunk retry ${retries}/5:`, err);
          await new Promise((resolve) => setTimeout(resolve, 1500));

          // Inquire where server stopped to resume smoothly
          try {
            const statusRes = await fetch(`${API_BASE}/upload/status?uploadId=${uploadId}`);
            if (statusRes.ok) {
              const statusData = await statusRes.json();
              startByte = statusData.receivedBytes;
            }
          } catch (statusErr) {
            console.error('Failed to get status check:', statusErr);
          }
        }
      }

      if (!success) {
        throw new Error('Upload aborted after multiple network retry failures');
      }
    }

    // 3. Finalize upload
    const completeRes = await fetch(`${API_BASE}/upload/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uploadId }),
    });

    if (!completeRes.ok) throw new Error('Failed to finalize file upload');
    return await completeRes.json();
  };

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      setUploadingFileName(file.name);
      setUploadProgress(0);

      try {
        await uploadFileInChunks(file);
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        alert(`Failed to upload ${file.name}`);
      }
    }

    // Reset UI state and reload drive list
    setUploadProgress(null);
    setUploadingFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    fetchFiles();
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
        className="btn btn-white shadow-sm rounded-pill py-2 px-4 d-flex align-items-center gap-2 fw-semibold border mb-2 gdrive-new-btn"
        onClick={() => fileInputRef.current && fileInputRef.current.click()}
        disabled={uploadProgress !== null}
      >
        <span className="fs-5 text-primary">+</span>
        <span>{uploadProgress !== null ? 'Uploading...' : 'New Upload'}</span>
      </button>

      {/* Progress Bar Display */}
      {uploadProgress !== null && (
        <div className="mb-3 px-1">
          <div className="d-flex justify-content-between small text-muted mb-1 text-truncate">
            <span className="text-truncate" style={{ maxWidth: '140px' }}>{uploadingFileName}</span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="progress" style={{ height: '6px' }}>
            <div
              className="progress-bar progress-bar-striped progress-bar-animated bg-primary"
              role="progressbar"
              style={{ width: `${uploadProgress}%` }}
              aria-valuenow={uploadProgress}
              aria-valuemin="0"
              aria-valuemax="100"
            />
          </div>
        </div>
      )}

      <div className="nav flex-column nav-pills gap-1">
        <button className="nav-link active text-start rounded-pill px-3">
          My Drive
        </button>
        <button className="nav-link text-dark text-start rounded-pill px-3">
          Computers
        </button>
        <button className="nav-link text-dark text-start rounded-pill px-3">
          Starred
        </button>
        <button className="nav-link text-dark text-start rounded-pill px-3">
           Trash
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