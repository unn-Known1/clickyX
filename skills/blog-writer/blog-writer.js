// Blog Writer — Generate blog posts with SEO optimization
// Usage: { topic, audience, tone, length, keywords, outline }

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
  const { topic, audience = 'general', tone = 'professional', length = 'medium', keywords = [], outline, action = 'write' } = args || {};
  if (!topic) return { error: 'Missing topic' };

  const wordCounts = { short: 400, medium: 800, long: 1500, detailed: 2500 };
  const targetWords = wordCounts[length] || 800;
  const kwStr = keywords.length > 0 ? `\nTarget keywords: ${keywords.join(', ')}` : '';
  const outlineStr = outline ? `\nOutline to follow:\n${outline}` : '';

  try {
    if (action === 'outline') {
      const resp = await bridgeRequest({
        messages: [
          { role: 'system', content: 'You are an expert content strategist. Create a detailed blog post outline with SEO-optimized headings.' },
          { role: 'user', content: `Create an outline for a ${length} blog post about: ${topic}\nAudience: ${audience}\nTone: ${tone}${kwStr}` },
        ],
        stream: false,
      });
      return { result: 'Outline generated', outline: resp?.content || resp?.raw };
    }

    const resp = await bridgeRequest({
      messages: [
        {
          role: 'system',
          content: `You are an expert blog writer and SEO specialist. Write engaging, well-structured blog posts.
Guidelines:
- Target ~${targetWords} words
- Tone: ${tone}
- Audience: ${audience}
- Use proper markdown formatting (H1 title, H2/H3 sections)
- Include a compelling introduction and conclusion
- Use natural language for SEO keywords
- Add a meta description at the end (marked with "META:")${kwStr}${outlineStr}`,
        },
        { role: 'user', content: `Write a blog post about: ${topic}` },
      ],
      stream: false,
    });

    const content = resp?.content || resp?.raw || '';
    const metaMatch = content.match(/META:\s*(.+?)(?:\n|$)/i);
    const meta = metaMatch ? metaMatch[1] : null;
    const body = metaMatch ? content.replace(metaMatch[0], '').trim() : content;
    const wordCount = body.split(/\s+/).length;

    return { result: 'Blog post generated', content: body, metaDescription: meta, wordCount, topic, tone, audience };
  } catch (err) {
    console.error('[blog-writer]', err.message);
    return { error: err.message };
  }
}
