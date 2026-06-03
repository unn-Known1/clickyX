const http = require('http');

function bridgeRequest(endpoint, data) {
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 32123,
      path: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(responseData)); }
        catch { resolve({ raw: responseData }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(args) {
  const { transcript, meetingTitle, date, participants } = args || {};

  if (!transcript) {
    return { error: 'Missing required field: transcript' };
  }

  const title = meetingTitle || 'Untitled Meeting';
  const meetingDate = date || new Date().toISOString().split('T')[0];
  const attendees = participants || 'Unknown';

  console.log(`[meeting-notes] Processing "${title}" transcript (${transcript.length} chars)`);

  try {
    const systemPrompt = `You are a meeting notes assistant. Transform the raw transcript into well-structured meeting notes.

Format the notes with these sections:

## Meeting: ${title}
**Date:** ${meetingDate}
**Participants:** ${attendees}

### Agenda / Topics Covered
- List the main topics discussed

### Key Discussion Points
- Summarize important discussions, decisions, and insights

### Action Items
| Task | Owner | Due Date |
|------|-------|----------|
| ...  | ...   | ...      |

### Decisions Made
- List any decisions reached

### Next Steps
- Outline follow-up actions

### Notes & Highlights
- Additional observations or important quotes`;

    const resp = await bridgeRequest('/v1/messages', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Raw transcript:\n\n${transcript}` },
      ],
      stream: false,
    });

    const notes = resp?.content || resp?.raw || 'Notes generation returned no content.';
    console.log(`[meeting-notes] Generated ${notes.length} chars of structured notes`);

    return {
      result: 'Meeting notes generated',
      meetingTitle: title,
      date: meetingDate,
      participants: attendees,
      notes,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[meeting-notes] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
