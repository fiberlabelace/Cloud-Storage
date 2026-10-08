const express = require('express');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Points directly to server-files so Samba and API share the same files
const STORAGE_DIR = path.join(__dirname, '../server-files');
if (!fs.existsSync(STORAGE_DIR)) {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

// Serve files directly for previewing (images, PDFs, text, etc.)
app.use('/api/files/raw', express.static(STORAGE_DIR));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, STORAGE_DIR),
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

app.get('/', (req, res) => res.send('Server is working!'));

// 1. GET ALL FILES
app.get('/api/files', async (req, res) => {
  try {
    const fileNames = await fs.promises.readdir(STORAGE_DIR);
    const files = await Promise.all(
      fileNames.map(async (name) => {
        const filePath = path.join(STORAGE_DIR, name);
        const stats = await fs.promises.stat(filePath);
        return {
          name,
          size: stats.size,
          modifiedAt: stats.mtime,
          isFile: stats.isFile()
        };
      })
    );
    res.json({ files: files.filter((f) => f.isFile) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve file list' });
  }
});

// 2. UPLOAD FILES
app.post('/api/files', upload.array('myFile'), (req, res) => {
  res.json({ success: true, count: req.files ? req.files.length : 0 });
});

// 3. DOWNLOAD FILE
app.get('/api/files/raw/:filename', (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  res.sendFile(filePath);
});
// 4. DELETE FILE
app.delete('/api/files/:filename', async (req, res) => {
  try {
    const filePath = path.join(STORAGE_DIR, req.params.filename);
    await fs.promises.unlink(filePath);
    res.json({ success: true, filename: req.params.filename });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete file' });
  }
});
// Add this route right above app.listen(...)
app.get('/api/files/raw/:filename', (req, res) => {
  const filePath = path.join(STORAGE_DIR, req.params.filename);
  
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // sendFile automatically sets the correct Content-Type (image/png, application/pdf, etc.)
  res.sendFile(filePath);
});
app.listen(3000, () => {
  console.log('Server is running on port 3000');
});