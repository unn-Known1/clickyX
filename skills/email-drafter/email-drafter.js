// Email Drafter — Draft professional emails from bullet points
// Usage: { points, to, subject, tone, context, action }

module.exports = { main };

const http = require('http');

function bridgeRequest(data) {
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 32123, path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(args) {
  const { points, to, subject, tone = 'professional', context, action = 'draft', emailText } = args || {};

  try {
    if (action === 'improve' && emailText) {
      const resp = await bridgeRequest({
        messages: [
          { role: 'system', content: `You are an expert business writer. Improve the given email to be more ${tone}, clear, and effective. Keep the same intent but enhance the language and structure.` },
          { role: 'user', content: `Improve this email:\n\n${emailText}` },
        ],
        stream: false,
      });
      return { result: 'Email improved', email: resp?.content || resp?.raw };
    }

    if (!points && !context) return { error: 'Missing points or context to draft from' };

    const pointsStr = Array.isArray(points) ? points.map((p, i) => `${i + 1}. ${p}`).join('\n') : points;
    const toStr = to ? `Recipient: ${to}\n` : '';
    const subjectStr = subject ? `Subject: ${subject}\n` : '';

    const resp = await bridgeRequest({
      messages: [
        {
          role: 'system',
          content: `You are an expert business email writer. Draft professional emails that are:
- Clear and concise
- Appropriately toned (${tone})
- Well-structured with greeting, body, and closing
- Action-oriented when needed
Output just the email text, ready to send. Include Subject: line at top if not provided.`,
        },
        {
          role: 'user',
          content: `Draft an email with these details:\n${toStr}${subjectStr}${context ? `Context: ${context}\n` : ''}${pointsStr ? `Key points to cover:\n${pointsStr}` : ''}`,
        },
      ],
      stream: false,
    });

    const email = resp?.content || resp?.raw || '';
    const subjectLineMatch = email.match(/^Subject:\s*(.+)$/im);
    const extractedSubject = subjectLineMatch ? subjectLineMatch[1] : subject;

    return { result: 'Email drafted', email, subject: extractedSubject, to, tone };
  } catch (err) {
    console.error('[email-drafter]', err.message);
    return { error: err.message };
  }
}
