// Google Drive — Search, upload, download, and share files
// Usage: { action: "search"|"upload"|"download"|"share"|"list", ...params }
// Requires: GDRIVE_ACCESS_TOKEN env var

module.exports = { main };

const { createReadStream, writeFileSync } = require('fs');
const path = require('path');

const BASE = 'https://www.googleapis.com/drive/v3';
const UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

async function driveFetch(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Drive API ${res.status}: ${err}`);
  }
  if (res.status === 204) return {};
  return res.json();
}

async function main(args) {
  const { action, query, fileId, localPath, name, mimeType, role = 'reader', emailAddress, accessToken } = args || {};
  const token = accessToken || process.env.GDRIVE_ACCESS_TOKEN;
  if (!token) return { error: 'Missing GDRIVE_ACCESS_TOKEN' };

  try {
    switch (action) {
      case 'search':
      case 'list': {
        const q = query ? encodeURIComponent(query) : '';
        const url = `${BASE}/files?fields=files(id,name,mimeType,size,modifiedTime,webViewLink)${q ? `&q=${q}` : ''}&pageSize=20`;
        const data = await driveFetch(token, url);
        return { result: `Found ${(data.files || []).length} files`, files: data.files };
      }

      case 'download': {
        if (!fileId) return { error: 'Missing fileId' };
        const meta = await driveFetch(token, `${BASE}/files/${fileId}?fields=name,mimeType`);
        const res = await fetch(`${BASE}/files/${fileId}?alt=media`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(`Download failed: ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        const outPath = localPath || path.join(process.cwd(), meta.name);
        writeFileSync(outPath, buffer);
        return { result: 'File downloaded', path: outPath, name: meta.name, size: buffer.length };
      }

      case 'upload': {
        if (!localPath) return { error: 'Missing localPath' };
        const fs = require('fs');
        const content = fs.readFileSync(localPath);
        const fileName = name || path.basename(localPath);
        const type = mimeType || 'application/octet-stream';
        // Multipart upload
        const boundary = '-------boundary_' + Date.now();
        const metadata = JSON.stringify({ name: fileName, mimeType: type });
        const body = Buffer.concat([
          Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
          Buffer.from(metadata),
          Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${type}\r\n\r\n`),
          content,
          Buffer.from(`\r\n--${boundary}--`),
        ]);
        const res = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,name,webViewLink`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body,
        });
        if (!res.ok) throw new Error(`Upload failed: ${await res.text()}`);
        const file = await res.json();
        return { result: 'File uploaded', id: file.id, name: file.name, link: file.webViewLink };
      }

      case 'share': {
        if (!fileId || !emailAddress) return { error: 'Missing fileId or emailAddress' };
        await driveFetch(token, `${BASE}/files/${fileId}/permissions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'user', role, emailAddress }),
        });
        return { result: `Shared with ${emailAddress} as ${role}`, fileId };
      }

      default:
        return { error: `Unknown action: ${action}. Use: search, list, download, upload, share` };
    }
  } catch (err) {
    console.error('[google-drive]', err.message);
    return { error: err.message };
  }
}
