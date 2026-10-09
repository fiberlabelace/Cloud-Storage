import { useRef, useState } from 'react';
import './Side.scss';
import { uploadServerFile } from '../../../utils/storageApi';

const Side = ({ fetchFiles }) => {
  const fileInputRef = useRef(null);
  const [uploadProgress, setUploadProgress] = useState(null); // null or percentage (0 - 100)
  const [uploadingFileName, setUploadingFileName] = useState('');

  const handleFileChange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of files) {
      setUploadingFileName(file.name);
      setUploadProgress(0);

      try {
        await uploadServerFile(file, file.name, setUploadProgress);
      } catch (err) {
        console.error(`Upload error for ${file.name}:`, err);
        alert(`Failed to upload ${file.name}: ${err.message}`);
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