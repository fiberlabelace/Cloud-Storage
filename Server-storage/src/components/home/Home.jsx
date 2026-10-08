import React, { useState, useEffect } from 'react';
import Header from './Header';
import Side from './Side/Side';
import FilesList from './FilesList/FilesList';
import FilePreviewModal from './FilesList/FilePreviewModal';
import './Home.scss';

const Home = () => {
  const [files, setFiles] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // 'grid' or 'list'
  const [previewFile, setPreviewFile] = useState(null);

  const fetchFiles = () => {
    fetch('https://fiber-label.tailfc4e35.ts.net/api/files')
      .then((res) => res.json())
      .then((data) => setFiles(data.files || []))
      .catch((err) => console.error(err));
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const filteredFiles = files.filter((f) =>
    f.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="gdrive-container">
      <Header searchQuery={searchQuery} setSearchQuery={setSearchQuery} />
      <div className="d-flex flex-grow-1 overflow-hidden">
        <Side fetchFiles={fetchFiles} />
        <main className="gdrive-main flex-grow-1 p-4 overflow-auto">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h5 className="mb-0 fw-bold text-secondary">My Drive</h5>
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'grid' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setViewMode('grid')}
              >
                Grid
              </button>
              <button
                type="button"
                className={`btn btn-sm ${viewMode === 'list' ? 'btn-primary' : 'btn-outline-secondary'}`}
                onClick={() => setViewMode('list')}
              >
                List
              </button>
            </div>
          </div>

          <FilesList
            files={filteredFiles}
            viewMode={viewMode}
            fetchFiles={fetchFiles}
            onPreview={(file) => setPreviewFile(file)}
          />
        </main>
      </div>

      {previewFile && (
        <FilePreviewModal
          file={previewFile}
          onClose={() => setPreviewFile(null)}
        />
      )}
    </div>
  );
};

export default Home;