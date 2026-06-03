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
  const { text, style, maxLength } = args || {};

  if (!text) {
    return { error: 'Missing required field: text' };
  }

  console.log(`[summarizer] Summarizing ${text.length} chars (style=${style || 'concise'})`);

  try {
    const styleGuide = {
      concise: 'Provide a brief 2-3 sentence summary capturing the essential points.',
      detailed: 'Provide a thorough summary with key points, supporting details, and main arguments.',
      bullet: 'Provide a bullet-point summary with each key point as a separate item.',
      tldr: 'Provide a one-sentence TL;DR summary.',
    };

    const instruction = styleGuide[style] || styleGuide.concise;
    const maxLen = maxLength ? ` Keep the summary under ${maxLength} words.` : '';

    const resp = await bridgeRequest('/v1/messages', {
      messages: [
        {
          role: 'system',
          content: `You are a text summarization assistant. ${instruction}${maxLen} Respond with only the summary, no extra commentary.`,
        },
        { role: 'user', content: `Summarize this text:\n\n${text}` },
      ],
      stream: false,
    });

    const summary = resp?.content || resp?.raw || 'Summarization returned no content.';
    console.log(`[summarizer] Summary: ${summary.length} chars`);

    return {
      result: 'Text summarized',
      summary,
      originalLength: text.length,
      summaryLength: summary.length,
      style: style || 'concise',
    };
  } catch (err) {
    console.error('[summarizer] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
