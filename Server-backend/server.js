const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// CORS Configuration
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));

const STORAGE_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(__dirname, 'temp_chunks');

if (!fs.existsSync(STORAGE_DIR)) fs.mkdirSync(STORAGE_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const activeUploads = new Map();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.send('Server is working!'));

// File listing
app.get('/api/files', (req, res) => {
  fs.readdir(STORAGE_DIR, { withFileTypes: true }, (err, entries) => {
    if (err) return res.status(500).json({ error: 'Failed to read files' });
    try {
      const files = entries
        .filter((entry) => entry.isFile())
        .map((entry) => {
          const stats = fs.statSync(path.join(STORAGE_DIR, entry.name));
          return {
            name: entry.name,
            size: stats.size,
            modifiedAt: stats.mtime,
            isFile: true
          };
        });
      res.json({ files });
    } catch (parseErr) {
      res.status(500).json({ error: 'Failed to parse file list' });
    }
  });
});

// Download
app.get('/api/files/download/:filename', (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.download(filePath);
});

// Raw preview
app.get('/api/files/raw/:filename', (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.filename);
  if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
  res.sendFile(filePath);
});

// Delete
app.delete('/api/files/:filename', (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.filename);
  fs.unlink(filePath, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete file' });
    res.json({ message: 'File deleted' });
  });
});

// Resumable upload initialization
app.post('/api/upload/init', (req, res) => {
  const { fileName, totalSize, mimeType } = req.body;
  const uploadId = crypto.randomUUID();
  const tempFilePath = path.join(TEMP_DIR, `${uploadId}.part`);

  fs.writeFileSync(tempFilePath, Buffer.alloc(0));

  activeUploads.set(uploadId, {
    fileName,
    totalSize,
    mimeType,
    tempFilePath,
    receivedBytes: 0
  });

  res.json({ uploadId });
});

// Append chunk
app.put('/api/upload/chunk', express.raw({ type: 'application/octet-stream', limit: '20mb' }), (req, res) => {
  const uploadId = req.query.uploadId;
  const upload = activeUploads.get(uploadId);

  if (!upload) return res.status(404).json({ error: 'Upload session not found' });

  fs.appendFile(upload.tempFilePath, req.body, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to write chunk' });

    upload.receivedBytes += req.body.length;

    res.json({
      receivedBytes: upload.receivedBytes,
      totalSize: upload.totalSize,
      progress: Math.round((upload.receivedBytes / upload.totalSize) * 100)
    });
  });
});

// Status check
app.get('/api/upload/status', (req, res) => {
  const uploadId = req.query.uploadId;
  const upload = activeUploads.get(uploadId);
  if (!upload) return res.status(404).json({ error: 'Session not found' });

  res.json({
    receivedBytes: upload.receivedBytes,
    totalSize: upload.totalSize
  });
});

// Finalize upload
app.post('/api/upload/complete', (req, res) => {
  const { uploadId } = req.body;
  const upload = activeUploads.get(uploadId);
  if (!upload) return res.status(404).json({ error: 'Session not found' });

  const finalPath = path.join(STORAGE_DIR, upload.fileName);
  fs.rename(upload.tempFilePath, finalPath, (err) => {
    if (err) return res.status(500).json({ error: 'Failed to finalize file' });
    activeUploads.delete(uploadId);
    res.json({ message: 'Upload complete', fileName: upload.fileName });
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});