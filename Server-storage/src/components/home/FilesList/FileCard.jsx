const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
};

const getFileIcon = (filename) => {
  const ext = filename.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return '🖼️';
  if (['mp4', 'mkv', 'webm'].includes(ext)) return '🎬';
  if (['mp3', 'wav', 'ogg'].includes(ext)) return '🎵';
  if (['pdf'].includes(ext)) return '📕';
  if (['zip', 'rar', 'tar', 'gz'].includes(ext)) return '📦';
  if (['js', 'jsx', 'ts', 'tsx', 'html', 'css', 'json', 'py', 'cpp'].includes(ext)) return '💻';
  return '📄';
};

const FileCard = ({ file, onPreview, onDownload, onDelete }) => {
  return (
    <div className="card h-100 border rounded-3 shadow-none hover-shadow transition p-2">
      <div
        className="card-body d-flex flex-column justify-content-between p-2"
        style={{ cursor: 'pointer' }}
        onClick={() => onPreview(file)}
      >
        <div className="d-flex align-items-center gap-2 mb-2">
          <span className="fs-4">{getFileIcon(file.name)}</span>
          <span className="fw-semibold text-truncate" title={file.name}>
            {file.name}
          </span>
        </div>

        <div className="text-muted small">
          <div>{formatBytes(file.size)}</div>
          <div>{new Date(file.modifiedAt).toLocaleDateString()}</div>
        </div>
      </div>

      <div className="card-footer bg-transparent border-0 d-flex justify-content-end gap-1 pt-0">
        <button
          className="btn btn-sm btn-light border"
          title="Download"
          onClick={(e) => {
            e.stopPropagation();
            onDownload(file.name);
          }}
        >
          ⬇️
        </button>
        <button
          className="btn btn-sm btn-light border text-danger"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(file.name);
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
};

export default FileCard;