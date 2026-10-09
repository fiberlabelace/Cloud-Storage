const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-storage-test-'));
process.env.STORAGE_DIR = path.join(testDir, 'uploads');
process.env.TEMP_DIR = path.join(testDir, 'temp');
const app = require('../server');

test('chunked uploads and file operations work end-to-end', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
    await fs.promises.rm(testDir, { recursive: true, force: true });
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const json = (value) => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value)
  });

  let response = await fetch(`${baseUrl}/api/upload/init`, json({
    fileName: '../outside.txt',
    totalSize: 1,
    mimeType: 'text/plain'
  }));
  assert.equal(response.status, 400);

  response = await fetch(`${baseUrl}/api/upload/init`, json({
    fileName: 'folder/sample.txt',
    totalSize: 11,
    mimeType: 'text/plain'
  }));
  assert.equal(response.status, 200);
  const { uploadId } = await response.json();

  response = await fetch(`${baseUrl}/api/upload/complete`, json({ uploadId }));
  assert.equal(response.status, 400, 'incomplete uploads must not be finalized');

  response = await fetch(`${baseUrl}/api/upload/chunk?uploadId=${uploadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('hello ')
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).receivedBytes, 6);

  response = await fetch(`${baseUrl}/api/upload/chunk?uploadId=${uploadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('world')
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).progress, 100);

  response = await fetch(`${baseUrl}/api/upload/complete`, json({ uploadId }));
  assert.equal(response.status, 200);
  assert.deepEqual(await fs.promises.readFile(path.join(testDir, 'uploads', 'folder', 'sample.txt')), Buffer.from('hello world'));

  response = await fetch(`${baseUrl}/api/files`);
  assert.deepEqual((await response.json()).files.map((file) => file.name), ['folder/sample.txt']);

  response = await fetch(`${baseUrl}/api/files/raw/folder%2Fsample.txt`);
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'hello world');

  response = await fetch(`${baseUrl}/api/files/download/folder%2Fsample.txt`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-disposition'), /attachment/);

  response = await fetch(`${baseUrl}/api/files/copy`, json({
    fileName: 'folder/sample.txt',
    newFileName: 'folder/copy.txt'
  }));
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/files/rename`, json({
    fileName: 'folder/copy.txt',
    newFileName: 'folder/renamed.txt'
  }));
  assert.equal(response.status, 200);
  assert.equal(await fs.promises.readFile(path.join(testDir, 'uploads', 'folder', 'renamed.txt'), 'utf8'), 'hello world');

  response = await fetch(`${baseUrl}/api/upload/init`, json({
    fileName: 'folder/sample.txt',
    totalSize: 0,
    mimeType: 'text/plain'
  }));
  assert.equal(response.status, 409, 'uploads must not overwrite existing files');

  response = await fetch(`${baseUrl}/api/files/trash`, json({ fileName: 'folder/sample.txt' }));
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/files?trash=true`);
  assert.deepEqual((await response.json()).files.map((file) => file.name), ['folder/sample.txt']);

  response = await fetch(`${baseUrl}/api/upload/init`, json({
    fileName: 'folder/sample.txt',
    totalSize: 3,
    mimeType: 'text/plain'
  }));
  assert.equal(response.status, 200);
  const replacementUpload = await response.json();
  response = await fetch(`${baseUrl}/api/upload/chunk?uploadId=${replacementUpload.uploadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('new')
  });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/upload/complete`, json({ uploadId: replacementUpload.uploadId }));
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/api/files/restore`, json({ fileName: 'folder/sample.txt' }));
  assert.equal(response.status, 409, 'restore must not overwrite a replacement file');
  assert.equal(await fs.promises.readFile(path.join(testDir, 'uploads', 'folder', 'sample.txt'), 'utf8'), 'new');

  response = await fetch(`${baseUrl}/api/files/trash`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: 'folder/sample.txt' })
  });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/files?trash=true`);
  assert.deepEqual((await response.json()).files, []);

  response = await fetch(`${baseUrl}/api/files/folder%2Fsample.txt`, { method: 'DELETE' });
  assert.equal(response.status, 200);
  response = await fetch(`${baseUrl}/api/files/raw/folder%2Fsample.txt`);
  assert.equal(response.status, 404);

  response = await fetch(`${baseUrl}/api/files/renamed.txt`, { method: 'DELETE' });
  assert.equal(response.status, 404);
  response = await fetch(`${baseUrl}/api/files/folder%2Frenamed.txt`, { method: 'DELETE' });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/api/upload/init`, json({
    fileName: 'empty.txt',
    totalSize: 0,
    mimeType: 'text/plain'
  }));
  assert.equal(response.status, 200);
  const emptyUpload = await response.json();
  response = await fetch(`${baseUrl}/api/upload/complete`, json({ uploadId: emptyUpload.uploadId }));
  assert.equal(response.status, 200);
  assert.equal((await fs.promises.stat(path.join(testDir, 'uploads', 'empty.txt'))).size, 0);
});
