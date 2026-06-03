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
  const { topic, depth } = args || {};

  if (!topic) {
    return { error: 'Missing required field: topic' };
  }

  console.log(`[research-report] Generating report on: "${topic}" (depth=${depth || 'standard'})`);

  try {
    const systemPrompt = `You are a research assistant. Generate a comprehensive, well-structured markdown research report on the given topic.

Include the following sections:
1. **Executive Summary** — Brief overview of the topic
2. **Introduction** — Background and context
3. **Key Findings** — Main points organized by subtopic
4. **Analysis** — Deeper examination of important aspects
5. **Conclusion** — Summary and takeaways
6. **References** — Notable sources or further reading suggestions

Use clear headings, bullet points, and tables where appropriate. Be objective and informative.`;

    const resp = await bridgeRequest('/v1/messages', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Topic: ${topic}\n\nDepth: ${depth || 'standard'}\n\nGenerate a research report.` },
      ],
      stream: false,
    });

    const report = resp?.content || resp?.raw || 'Report generation returned no content.';
    console.log(`[research-report] Report generated (${report.length} chars)`);

    return {
      result: 'Research report generated',
      topic,
      report,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[research-report] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
