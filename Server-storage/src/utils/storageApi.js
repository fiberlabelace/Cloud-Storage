const configuredApiBase = import.meta.env.VITE_API_BASE_URL;
const defaultApiBase = 'http://100.83.204.64:3000/api';

export const API_BASE = (configuredApiBase || defaultApiBase).replace(/\/+$/, '');

const parseResponse = async (response) => {
  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }
  return body;
};

const request = async (url, options) => parseResponse(await fetch(url, options));

const fileEndpoint = (fileName, action = '') =>
  `${API_BASE}/files/${action}${encodeURIComponent(fileName)}`;

export const getRawFileUrl = (fileName) => fileEndpoint(fileName, 'raw/');
export const getDownloadUrl = (fileName) => fileEndpoint(fileName, 'download/');

export const listServerFiles = async (trash = false) => {
  const query = trash ? '?trash=true' : '';
  const result = await request(`${API_BASE}/files${query}`);
  return result.files.map((file) => ({
    id: `server:${file.name}`,
    name: file.name,
    type: 'file',
    parent: 'root',
    mime: '',
    size: file.size,
    mod: new Date(file.modifiedAt).getTime(),
    remote: true,
    trashed: trash
  }));
};

export const uploadServerFile = async (file, fileName, onProgress) => {
  const init = await request(`${API_BASE}/upload/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName,
      totalSize: file.size,
      mimeType: file.type || 'application/octet-stream'
    })
  });

  const { uploadId } = init;
  const chunkSize = 2 * 1024 * 1024;
  let startByte = 0;
  let retries = 0;

  while (startByte < file.size) {
    const endByte = Math.min(startByte + chunkSize, file.size);
    try {
      const result = await request(`${API_BASE}/upload/chunk?uploadId=${encodeURIComponent(uploadId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file.slice(startByte, endByte)
      });
      if (result.receivedBytes !== endByte) {
        throw new Error('Server acknowledged an unexpected upload offset');
      }
      startByte = endByte;
      retries = 0;
      onProgress?.(file.size === 0 ? 100 : Math.round((startByte / file.size) * 100));
    } catch (err) {
      retries += 1;
      if (retries >= 5) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * retries));
      const status = await request(`${API_BASE}/upload/status?uploadId=${encodeURIComponent(uploadId)}`);
      if (status.receivedBytes !== startByte && status.receivedBytes !== endByte) {
        throw new Error('Server upload status is inconsistent; upload stopped to avoid corrupting the file', { cause: err });
      }
      startByte = status.receivedBytes;
      if (startByte === endByte) retries = 0;
    }
  }

  await request(`${API_BASE}/upload/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uploadId })
  });
};

export const readServerFile = async (fileName) => {
  const response = await fetch(getRawFileUrl(fileName));
  if (!response.ok) {
    const result = await parseResponse(response);
    throw new Error(result?.error || `Request failed (${response.status})`);
  }
  return response.blob();
};

export const trashServerFile = (fileName) => request(`${API_BASE}/files/trash`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName })
});

export const restoreServerFile = (fileName) => request(`${API_BASE}/files/restore`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName })
});

export const renameServerFile = (fileName, newFileName) => request(`${API_BASE}/files/rename`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName, newFileName })
});

export const copyServerFile = (fileName, newFileName) => request(`${API_BASE}/files/copy`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ fileName, newFileName })
});

export const deleteServerFile = (fileName, trashed = false) => request(
  `${API_BASE}/files${trashed ? '/trash' : `/${encodeURIComponent(fileName)}`}`,
  trashed
    ? {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName })
      }
    : { method: 'DELETE' }
);
