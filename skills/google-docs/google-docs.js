// Google Docs — Create, read, and edit Google Docs documents
// Usage: { action: "create"|"read"|"append"|"replace", ...params }
// Requires: GDOCS_ACCESS_TOKEN env var

module.exports = { main };

const BASE = 'https://docs.googleapis.com/v1/documents';

async function docsFetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Docs API ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractText(doc) {
  let text = '';
  for (const elem of (doc.body?.content || [])) {
    if (elem.paragraph) {
      for (const pe of (elem.paragraph.elements || [])) {
        text += pe.textRun?.content || '';
      }
    }
  }
  return text;
}

async function main(args) {
  const { action, documentId, title, content, searchText, replaceText, accessToken } = args || {};
  const token = accessToken || process.env.GDOCS_ACCESS_TOKEN;
  if (!token) return { error: 'Missing GDOCS_ACCESS_TOKEN' };

  try {
    switch (action) {
      case 'create': {
        const doc = await docsFetch(token, '', {
          method: 'POST',
          body: JSON.stringify({ title: title || 'Untitled Document' }),
        });
        if (content) {
          await docsFetch(token, `/${doc.documentId}:batchUpdate`, {
            method: 'POST',
            body: JSON.stringify({
              requests: [{ insertText: { location: { index: 1 }, text: content } }],
            }),
          });
        }
        return { result: 'Document created', documentId: doc.documentId, title: doc.title };
      }

      case 'read': {
        if (!documentId) return { error: 'Missing documentId' };
        const doc = await docsFetch(token, `/${documentId}`);
        return {
          result: 'Document read',
          title: doc.title,
          documentId: doc.documentId,
          text: extractText(doc),
          revisionId: doc.revisionId,
        };
      }

      case 'append': {
        if (!documentId || !content) return { error: 'Missing documentId or content' };
        const doc = await docsFetch(token, `/${documentId}`);
        const endIndex = doc.body?.content?.at(-1)?.endIndex ?? 1;
        await docsFetch(token, `/${documentId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({
            requests: [{ insertText: { location: { index: endIndex - 1 }, text: '\n' + content } }],
          }),
        });
        return { result: 'Text appended', documentId };
      }

      case 'replace': {
        if (!documentId || !searchText || replaceText === undefined) return { error: 'Missing documentId, searchText, or replaceText' };
        await docsFetch(token, `/${documentId}:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({
            requests: [{ replaceAllText: { containsText: { text: searchText, matchCase: false }, replaceText } }],
          }),
        });
        return { result: 'Text replaced', documentId, searchText, replaceText };
      }

      default:
        return { error: `Unknown action: ${action}. Use: create, read, append, replace` };
    }
  } catch (err) {
    console.error('[google-docs]', err.message);
    return { error: err.message };
  }
}
