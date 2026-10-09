import FileCard from './FileCard';
import { deleteServerFile, getDownloadUrl } from '../../../utils/storageApi';

const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const FilesList = ({ files, viewMode, fetchFiles, onPreview }) => {
  const handleDelete = (filename) => {
    deleteServerFile(filename)
      .then(() => fetchFiles())
      .catch((err) => {
        console.error('Failed to delete file', err);
        alert(`Failed to delete ${filename}: ${err.message}`);
      });
  };

  const handleDownload = (filename) => {
    const link = document.createElement('a');
    link.href = getDownloadUrl(filename);
    link.target = '_blank';
    link.rel = 'noopener';
    link.click();
  };

  if (files.length === 0) {
    return (
      <div className="text-center py-5 text-muted">
        <div className="fs-1 mb-2">📁</div>
        <p>No files found in drive.</p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3">
        {files.map((file) => (
          <div className="col" key={file.name}>
            <FileCard
              file={file}
              onPreview={onPreview}
              onDownload={handleDownload}
              onDelete={handleDelete}
            />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="table-responsive">
      <table className="table table-hover align-middle">
        <thead className="table-light">
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Last Modified</th>
            <th className="text-end">Actions</th>
          </tr>
        </thead>
        <tbody>
          {files.map((file) => (
            <tr
              key={file.name}
              style={{ cursor: 'pointer' }}
              onClick={() => onPreview(file)}
            >
              <td className="fw-semibold text-truncate" style={{ maxWidth: '250px' }}>
                {file.name}
              </td>
              <td>{formatBytes(file.size)}</td>
              <td>{new Date(file.modifiedAt).toLocaleString()}</td>
              <td className="text-end" onClick={(e) => e.stopPropagation()}>
                <button
                  className="btn btn-sm btn-outline-primary me-2"
                  onClick={() => handleDownload(file.name)}
                >
                  Download
                </button>
                <button
                  className="btn btn-sm btn-outline-danger"
                  onClick={() => handleDelete(file.name)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default FilesList;