// Gmail — Compose, read, search, reply, archive, and label Gmail messages
// Usage: { action: "search"|"read"|"compose"|"reply"|"archive"|"label", ...params }
// Requires: GMAIL_ACCESS_TOKEN env var (OAuth2 access token)

module.exports = { main };

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

async function gmailFetch(token, path, options = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API ${res.status}: ${err}`);
  }
  return res.json();
}

function decodeBase64Url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8');
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body && payload.body.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    for (const part of payload.parts) {
      const body = extractBody(part);
      if (body) return body;
    }
  }
  return '';
}

async function main(args) {
  const { action, query, messageId, to, subject, body, labelIds, replyBody, accessToken } = args || {};
  const token = accessToken || process.env.GMAIL_ACCESS_TOKEN;

  if (!token) return { error: 'Missing GMAIL_ACCESS_TOKEN. Set it in config or pass as accessToken.' };

  try {
    switch (action) {
      case 'search': {
        const q = encodeURIComponent(query || 'is:inbox');
        const data = await gmailFetch(token, `/messages?q=${q}&maxResults=20`);
        const messages = data.messages || [];
        const details = await Promise.all(
          messages.slice(0, 10).map((m) =>
            gmailFetch(token, `/messages/${m.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`)
          )
        );
        return {
          result: `Found ${messages.length} messages`,
          messages: details.map((m) => {
            const headers = m.payload?.headers || [];
            const get = (name) => headers.find((h) => h.name === name)?.value || '';
            return { id: m.id, subject: get('Subject'), from: get('From'), date: get('Date'), snippet: m.snippet };
          }),
        };
      }

      case 'read': {
        if (!messageId) return { error: 'Missing messageId' };
        const m = await gmailFetch(token, `/messages/${messageId}?format=full`);
        const headers = m.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || '';
        return {
          result: 'Message fetched',
          id: m.id,
          subject: get('Subject'),
          from: get('From'),
          to: get('To'),
          date: get('Date'),
          body: extractBody(m.payload),
        };
      }

      case 'compose': {
        if (!to || !subject || !body) return { error: 'Missing to, subject, or body' };
        const raw = Buffer.from(
          `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
        ).toString('base64url');
        const sent = await gmailFetch(token, '/messages/send', {
          method: 'POST',
          body: JSON.stringify({ raw }),
        });
        return { result: 'Email sent', id: sent.id, threadId: sent.threadId };
      }

      case 'reply': {
        if (!messageId || !replyBody) return { error: 'Missing messageId or replyBody' };
        const orig = await gmailFetch(token, `/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Message-ID`);
        const headers = orig.payload?.headers || [];
        const get = (name) => headers.find((h) => h.name === name)?.value || '';
        const replyTo = get('From');
        const subj = get('Subject').startsWith('Re:') ? get('Subject') : `Re: ${get('Subject')}`;
        const msgId = get('Message-ID');
        const raw = Buffer.from(
          `To: ${replyTo}\r\nSubject: ${subj}\r\nIn-Reply-To: ${msgId}\r\nReferences: ${msgId}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${replyBody}`
        ).toString('base64url');
        const sent = await gmailFetch(token, `/messages/send`, {
          method: 'POST',
          body: JSON.stringify({ raw, threadId: orig.threadId }),
        });
        return { result: 'Reply sent', id: sent.id, threadId: sent.threadId };
      }

      case 'archive': {
        if (!messageId) return { error: 'Missing messageId' };
        await gmailFetch(token, `/messages/${messageId}/modify`, {
          method: 'POST',
          body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
        });
        return { result: 'Message archived', messageId };
      }

      case 'label': {
        if (!messageId || !labelIds) return { error: 'Missing messageId or labelIds' };
        const ids = Array.isArray(labelIds) ? labelIds : [labelIds];
        await gmailFetch(token, `/messages/${messageId}/modify`, {
          method: 'POST',
          body: JSON.stringify({ addLabelIds: ids }),
        });
        return { result: 'Labels applied', messageId, labelIds: ids };
      }

      default:
        return { error: `Unknown action: ${action}. Use: search, read, compose, reply, archive, label` };
    }
  } catch (err) {
    console.error('[gmail]', err.message);
    return { error: err.message };
  }
}
