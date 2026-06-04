// Prompt Optimizer — Analyze and improve AI prompts
// Usage: { prompt, goal, style }

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
  const { prompt, goal, style = 'general', action = 'optimize' } = args || {};

  if (!prompt) return { error: 'Missing prompt to analyze' };

  const issues = [];
  // Heuristic analysis
  if (prompt.length < 10) issues.push('Too short — add more context and detail');
  if (!prompt.includes('\n') && prompt.length > 200) issues.push('Consider breaking into sections for clarity');
  if (/^(please|can you|could you|help me)/i.test(prompt)) issues.push('Remove polite fillers — be direct and specific');
  if (!prompt.match(/\b(output|format|return|respond|provide)\b/i)) issues.push('Consider specifying output format');
  if (prompt.split(' ').length > 300) issues.push('Prompt may be too long — consider summarizing context');
  const vagueWords = ['something', 'stuff', 'thing', 'etc', 'and so on'];
  const foundVague = vagueWords.filter((w) => prompt.toLowerCase().includes(w));
  if (foundVague.length > 0) issues.push(`Vague language found: ${foundVague.join(', ')}`);

  try {
    const systemMsg = `You are an expert prompt engineer. Your task is to:
1. Analyze the given prompt for issues (ambiguity, verbosity, missing context, unclear output format)
2. Provide an improved version
3. Explain what you changed and why
Output in this exact JSON format: { "analysis": "...", "improved": "...", "changes": ["..."] }`;

    const userMsg = `${goal ? `Goal: ${goal}\n\n` : ''}Original prompt:\n${prompt}`;

    const resp = await bridgeRequest({
      messages: [{ role: 'system', content: systemMsg }, { role: 'user', content: userMsg }],
      stream: false,
    });

    const content = resp?.content || resp?.raw || '';
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]+\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: content, improved: null, changes: [] };
    } catch {
      parsed = { analysis: content, improved: null, changes: [] };
    }

    return {
      result: 'Prompt analyzed',
      original: prompt,
      heuristicIssues: issues,
      analysis: parsed.analysis,
      improved: parsed.improved,
      changes: parsed.changes,
    };
  } catch (err) {
    // Return just heuristic analysis if AI unavailable
    return {
      result: 'Heuristic analysis only (AI unavailable)',
      original: prompt,
      issues,
      suggestions: [
        'Be specific about desired output format',
        'Include relevant context',
        'Use active voice and direct instructions',
        'Specify constraints and requirements upfront',
      ],
    };
  }
}
