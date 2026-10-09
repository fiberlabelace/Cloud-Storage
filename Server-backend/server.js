const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const STORAGE_DIR = path.resolve(process.env.STORAGE_DIR || path.join(__dirname, 'uploads'));
const TEMP_DIR = path.resolve(process.env.TEMP_DIR || path.join(__dirname, 'temp_chunks'));
const TRASH_DIR = path.join(STORAGE_DIR, '.trash');

fs.mkdirSync(STORAGE_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

const activeUploads = new Map();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
  exposedHeaders: ['Content-Range', 'Accept-Ranges', 'Content-Length']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const resolveStoredPath = (fileName, baseDir = STORAGE_DIR) => {
  if (typeof fileName !== 'string' || !fileName || fileName.includes('\\') || fileName.startsWith('/')) {
    return null;
  }

  const segments = fileName.split('/');
  if (segments.some((segment) =>
    !segment || segment === '.' || segment === '..' || /[<>:"|?*\u0000-\u001f]/.test(segment)
  )) return null;
  return path.join(baseDir, ...segments);
};

const moveWithoutOverwrite = async (source, destination) => {
  await fs.promises.copyFile(source, destination, fs.constants.COPYFILE_EXCL);
  await fs.promises.unlink(source);
};

const listDirectory = async (directory, prefix = '') => {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.trash') continue;
    const relativeName = prefix ? `${prefix}/${entry.name}` : entry.name;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listDirectory(fullPath, relativeName));
    } else if (entry.isFile()) {
      const stats = await fs.promises.stat(fullPath);
      files.push({
        name: relativeName,
        size: stats.size,
        modifiedAt: stats.mtime,
        isFile: true
      });
    }
  }
  return files;
};

const respondFileError = (res, err, message) => {
  console.error(message, err);
  if (!res.headersSent) res.status(500).json({ error: message });
};

app.get('/', (req, res) => res.send('Server is working!'));

app.get('/api/files', async (req, res) => {
  try {
    if (req.query.trash === 'true') {
      let files = [];
      try {
        files = await listDirectory(TRASH_DIR);
      } catch (err) {
        if (err.code !== 'ENOENT') throw err;
      }
      return res.json({ files, trashed: true });
    }
    res.json({ files: await listDirectory(STORAGE_DIR) });
  } catch (err) {
    respondFileError(res, err, 'Failed to read files');
  }
});

app.get('/api/files/download/:filename', (req, res) => {
  const filePath = resolveStoredPath(req.params.filename);
  if (!filePath) return res.status(400).json({ error: 'Invalid file name' });
  res.download(filePath, path.basename(filePath), (err) => {
    if (err && !res.headersSent) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
      respondFileError(res, err, 'Failed to download file');
    }
  });
});

app.get('/api/files/raw/:filename', (req, res) => {
  const filePath = resolveStoredPath(req.params.filename);
  if (!filePath) return res.status(400).json({ error: 'Invalid file name' });
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
      respondFileError(res, err, 'Failed to read file');
    }
  });
});

app.post('/api/files/trash', async (req, res) => {
  const { fileName } = req.body;
  const filePath = resolveStoredPath(fileName);
  const trashPath = resolveStoredPath(fileName, TRASH_DIR);
  if (!filePath || !trashPath) return res.status(400).json({ error: 'Invalid file name' });
  try {
    await fs.promises.mkdir(path.dirname(trashPath), { recursive: true });
    await moveWithoutOverwrite(filePath, trashPath);
    res.json({ message: 'File moved to trash' });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'A file with this name is already in trash' });
    respondFileError(res, err, 'Failed to move file to trash');
  }
});

app.post('/api/files/restore', async (req, res) => {
  const { fileName } = req.body;
  const trashPath = resolveStoredPath(fileName, TRASH_DIR);
  const filePath = resolveStoredPath(fileName);
  if (!trashPath || !filePath) return res.status(400).json({ error: 'Invalid file name' });
  try {
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await moveWithoutOverwrite(trashPath, filePath);
    res.json({ message: 'File restored' });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Trashed file not found' });
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'A file with this name already exists' });
    respondFileError(res, err, 'Failed to restore file');
  }
});

app.delete('/api/files/trash', async (req, res) => {
  const { fileName } = req.body;
  const trashPath = resolveStoredPath(fileName, TRASH_DIR);
  if (!trashPath) return res.status(400).json({ error: 'Invalid file name' });
  try {
    await fs.promises.unlink(trashPath);
    res.json({ message: 'File permanently deleted' });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'Trashed file not found' });
    respondFileError(res, err, 'Failed to delete file');
  }
});

app.post('/api/files/rename', async (req, res) => {
  const { fileName, newFileName } = req.body;
  const filePath = resolveStoredPath(fileName);
  const newPath = resolveStoredPath(newFileName);
  if (!filePath || !newPath) return res.status(400).json({ error: 'Invalid file name' });
  try {
    await fs.promises.mkdir(path.dirname(newPath), { recursive: true });
    await fs.promises.copyFile(filePath, newPath, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(filePath);
    res.json({ message: 'File renamed', fileName: newFileName });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'A file with this name already exists' });
    respondFileError(res, err, 'Failed to rename file');
  }
});

app.post('/api/files/copy', async (req, res) => {
  const { fileName, newFileName } = req.body;
  const filePath = resolveStoredPath(fileName);
  const copyPath = resolveStoredPath(newFileName);
  if (!filePath || !copyPath) return res.status(400).json({ error: 'Invalid file name' });
  try {
    await fs.promises.mkdir(path.dirname(copyPath), { recursive: true });
    await fs.promises.copyFile(filePath, copyPath, fs.constants.COPYFILE_EXCL);
    res.json({ message: 'File copied', fileName: newFileName });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'A file with this name already exists' });
    respondFileError(res, err, 'Failed to copy file');
  }
});

app.delete('/api/files/:filename', async (req, res) => {
  const filePath = resolveStoredPath(req.params.filename);
  if (!filePath) return res.status(400).json({ error: 'Invalid file name' });
  try {
    await fs.promises.unlink(filePath);
    res.json({ message: 'File deleted' });
  } catch (err) {
    if (err.code === 'ENOENT') return res.status(404).json({ error: 'File not found' });
    respondFileError(res, err, 'Failed to delete file');
  }
});

app.post('/api/upload/init', async (req, res) => {
  const { fileName, totalSize, mimeType } = req.body;
  const finalPath = resolveStoredPath(fileName);
  if (!finalPath) return res.status(400).json({ error: 'Invalid file name' });
  if (!Number.isSafeInteger(totalSize) || totalSize < 0) {
    return res.status(400).json({ error: 'Invalid file size' });
  }
  if (typeof mimeType !== 'string') return res.status(400).json({ error: 'Invalid file type' });

  try {
    await fs.promises.access(path.dirname(finalPath));
  } catch (err) {
    if (err.code !== 'ENOENT') return respondFileError(res, err, 'Failed to check destination');
  }

  try {
    await fs.promises.access(finalPath);
    return res.status(409).json({ error: 'A file with this name already exists' });
  } catch (err) {
    if (err.code !== 'ENOENT') return respondFileError(res, err, 'Failed to check destination');
  }

  const uploadId = crypto.randomUUID();
  const tempFilePath = path.join(TEMP_DIR, `${uploadId}.part`);
  try {
    await fs.promises.writeFile(tempFilePath, Buffer.alloc(0), { flag: 'wx' });
  } catch (err) {
    return respondFileError(res, err, 'Failed to initialize upload');
  }

  activeUploads.set(uploadId, {
    fileName,
    totalSize,
    mimeType,
    tempFilePath,
    receivedBytes: 0
  });
  res.json({ uploadId });
});

app.put('/api/upload/chunk', express.raw({
  type: 'application/octet-stream',
  limit: '20mb'
}), async (req, res) => {
  const upload = activeUploads.get(req.query.uploadId);
  if (!upload) return res.status(404).json({ error: 'Upload session not found' });
  if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
    return res.status(400).json({ error: 'Upload chunk must not be empty' });
  }
  if (upload.receivedBytes + req.body.length > upload.totalSize) {
    return res.status(400).json({ error: 'Upload chunk exceeds the declared file size' });
  }

  try {
    await fs.promises.appendFile(upload.tempFilePath, req.body);
    upload.receivedBytes += req.body.length;
    res.json({
      receivedBytes: upload.receivedBytes,
      totalSize: upload.totalSize,
      progress: upload.totalSize === 0 ? 100 : Math.round((upload.receivedBytes / upload.totalSize) * 100)
    });
  } catch (err) {
    respondFileError(res, err, 'Failed to write upload chunk');
  }
});

app.get('/api/upload/status', (req, res) => {
  const upload = activeUploads.get(req.query.uploadId);
  if (!upload) return res.status(404).json({ error: 'Upload session not found' });
  res.json({ receivedBytes: upload.receivedBytes, totalSize: upload.totalSize });
});

app.post('/api/upload/complete', async (req, res) => {
  const { uploadId } = req.body;
  const upload = activeUploads.get(uploadId);
  if (!upload) return res.status(404).json({ error: 'Upload session not found' });
  if (upload.receivedBytes !== upload.totalSize) {
    return res.status(400).json({ error: 'Uploaded bytes do not match the declared file size' });
  }

  const finalPath = resolveStoredPath(upload.fileName);
  try {
    await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });
    await fs.promises.copyFile(upload.tempFilePath, finalPath, fs.constants.COPYFILE_EXCL);
    await fs.promises.unlink(upload.tempFilePath);
    activeUploads.delete(uploadId);
    res.json({ message: 'Upload complete', fileName: upload.fileName });
  } catch (err) {
    if (err.code === 'EEXIST') return res.status(409).json({ error: 'A file with this name already exists' });
    respondFileError(res, err, 'Failed to finalize file upload');
  }
});

if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on port ${PORT}`);
  });
}

module.exports = app;
