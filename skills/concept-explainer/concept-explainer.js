// Concept Explainer — Explain technical concepts with examples and analogies
// Usage: { concept, level, domain, format, analogy }

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
  const { concept, level = 'intermediate', domain, format = 'markdown', analogy = true, examples = true, action = 'explain' } = args || {};

  if (!concept) return { error: 'Missing concept to explain' };

  const levelGuides = {
    beginner: 'Explain as if to a complete beginner with no technical background. Use simple words and relatable everyday analogies.',
    intermediate: 'Explain to someone with some technical background. Include technical terms but define them. Use code examples where relevant.',
    expert: 'Explain at an expert level. Include technical depth, edge cases, trade-offs, and advanced nuances.',
    'eli5': 'Explain it like I\'m 5 years old. Use very simple language, fun analogies, and avoid all jargon.',
  };

  const levelGuide = levelGuides[level] || levelGuides.intermediate;
  const domainContext = domain ? `Context: ${domain} domain\n` : '';
  const analogyReq = analogy ? '- Include a creative real-world analogy\n' : '';
  const examplesReq = examples ? '- Include 1-2 concrete code or practical examples\n' : '';
  const formatReq = format === 'markdown' ? 'Format with markdown (headers, code blocks, bullet points)' : 'Plain text format';

  try {
    const resp = await bridgeRequest({
      messages: [
        {
          role: 'system',
          content: `You are a world-class technical educator known for clear, engaging explanations.
${levelGuide}
${domainContext}Guidelines:
${analogyReq}${examplesReq}- Structure: Brief overview → Core concept → Details → ${analogy ? 'Analogy →' : ''} ${examples ? 'Example →' : ''} Summary
- ${formatReq}`,
        },
        {
          role: 'user',
          content: action === 'compare'
            ? `Compare and contrast: ${concept}`
            : action === 'history'
            ? `Explain the history and evolution of: ${concept}`
            : `Explain: ${concept}`,
        },
      ],
      stream: false,
    });

    const explanation = resp?.content || resp?.raw || '';

    return {
      result: 'Concept explained',
      concept,
      level,
      explanation,
      wordCount: explanation.split(/\s+/).length,
    };
  } catch (err) {
    console.error('[concept-explainer]', err.message);
    return { error: err.message };
  }
}
