import { useState, useEffect } from 'react';
import { getDownloadUrl, getRawFileUrl } from '../../../utils/storageApi';

const FilePreviewModal = ({ file, onClose }) => {
  const [textResult, setTextResult] = useState({ status: 'idle', content: '' });

  const fileUrl = getRawFileUrl(file.name);
  const ext = file.name.split('.').pop().toLowerCase();

  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext);
  const isPdf = ext === 'pdf';
  const isVideo = ['mp4', 'webm', 'ogg'].includes(ext);
  const isAudio = ['mp3', 'wav'].includes(ext);
  const isText = ['txt', 'json', 'js', 'jsx', 'html', 'css', 'scss', 'md', 'log'].includes(ext);

  useEffect(() => {
    if (isText) {
      let cancelled = false;
      fetch(fileUrl)
        .then((res) => {
          if (!res.ok) throw new Error(`Preview request failed (${res.status})`);
          return res.text();
        })
        .then((content) => {
          if (!cancelled) setTextResult({ status: 'loaded', content });
        })
        .catch((err) => {
          console.error('Failed to load text preview', err);
          if (!cancelled) setTextResult({ status: 'error', content: err.message });
        });
      return () => { cancelled = true; };
    }
  }, [fileUrl, isText]);

  return (
    <div
      className="modal show d-block"
      tabIndex="-1"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content border-0 shadow-lg">
          <div className="modal-header">
            <h6 className="modal-title fw-bold text-truncate">{file.name}</h6>
            <button type="button" className="btn-close" onClick={onClose} />
          </div>
          <div
            className="modal-body d-flex justify-content-center align-items-center bg-light p-0 overflow-auto"
            style={{ maxHeight: '75vh', minHeight: '300px' }}
          >
            {isImage && (
              <img
                src={fileUrl}
                alt={file.name}
                className="img-fluid rounded"
                style={{ maxHeight: '70vh', objectFit: 'contain' }}
              />
            )}

            {isPdf && (
              <iframe
                src={fileUrl}
                title={file.name}
                className="w-100 border-0"
                style={{ height: '70vh' }}
              />
            )}

            {isVideo && (
              <video controls className="w-100" style={{ maxHeight: '70vh' }}>
                <source src={fileUrl} />
                Your browser does not support the video tag.
              </video>
            )}

            {isAudio && (
              <div className="p-4">
                <audio controls src={fileUrl}>
                  Your browser does not support audio.
                </audio>
              </div>
            )}

            {isText && (
              <pre
                className="w-100 p-3 m-0 bg-white"
                style={{ maxHeight: '70vh', overflow: 'auto', fontSize: '0.85rem' }}
              >
                {textResult.status === 'idle'
                  ? 'Loading text...'
                  : textResult.status === 'error'
                    ? `Could not load preview: ${textResult.content}`
                    : textResult.content}
              </pre>
            )}

            {!isImage && !isPdf && !isVideo && !isAudio && !isText && (
              <div className="text-center p-5">
                <div className="fs-1 mb-3">📄</div>
                <p className="text-muted">Preview not available for this file type.</p>
                <a
                  href={getDownloadUrl(file.name)}
                  className="btn btn-primary"
                >
                  Download to view
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FilePreviewModal;