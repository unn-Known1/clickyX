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
  const { text, targetLanguage, sourceLanguage, tone } = args || {};

  if (!text || !targetLanguage) {
    return { error: 'Missing required fields: text, targetLanguage' };
  }

  console.log(`[translator] Translating ${text.length} chars → ${targetLanguage}${tone ? ' (' + tone + ')' : ''}`);

  try {
    const source = sourceLanguage ? ` from ${sourceLanguage}` : '';
    const toneGuide = tone ? ` Use a ${tone} tone in the translation.` : '';
    const instruction = `Translate the following text${source} to ${targetLanguage}.${toneGuide} Return only the translated text, no explanations.`;

    const resp = await bridgeRequest('/v1/messages', {
      messages: [
        { role: 'system', content: 'You are a professional translator. Provide accurate, natural-sounding translations.' },
        { role: 'user', content: `${instruction}\n\nText: ${text}` },
      ],
      stream: false,
    });

    const translation = resp?.content || resp?.raw || 'Translation returned no content.';
    console.log(`[translator] Translation: ${translation.length} chars`);

    return {
      result: 'Translation complete',
      translation,
      sourceLanguage: sourceLanguage || 'auto-detected',
      targetLanguage,
      originalText: text,
      tone: tone || 'neutral',
    };
  } catch (err) {
    console.error('[translator] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
