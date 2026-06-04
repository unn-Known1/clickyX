// Grammar Checker — Check and fix grammar, spelling, and writing style
// Usage: { text, level, fix }

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

// Basic heuristic checks (offline fallback)
function heuristicCheck(text) {
  const issues = [];

  // Double spaces
  const doubleSpaces = [...text.matchAll(/\s{2,}/g)];
  if (doubleSpaces.length > 0) issues.push({ type: 'spacing', count: doubleSpaces.length, message: 'Multiple consecutive spaces found' });

  // Sentence starting with lowercase (after period+space)
  const badStart = [...text.matchAll(/[.!?]\s+[a-z]/g)];
  if (badStart.length > 0) issues.push({ type: 'capitalization', count: badStart.length, message: 'Sentence starting with lowercase letter' });

  // Common misspellings
  const misspellings = {
    'recieve': 'receive', 'seperate': 'separate', 'occured': 'occurred',
    'definately': 'definitely', 'accomodate': 'accommodate', 'occassion': 'occasion',
    'wierd': 'weird', 'goverment': 'government', 'existance': 'existence',
  };
  for (const [wrong, correct] of Object.entries(misspellings)) {
    const re = new RegExp(`\\b${wrong}\\b`, 'gi');
    if (re.test(text)) issues.push({ type: 'spelling', word: wrong, suggestion: correct });
  }

  // Common grammar errors
  const grammarErrors = [
    { pattern: /\bi are\b/i, message: 'Should be "I am"' },
    { pattern: /\bthey is\b/i, message: 'Should be "they are"' },
    { pattern: /\bhe have\b/i, message: 'Should be "he has"' },
    { pattern: /\bshe have\b/i, message: 'Should be "she has"' },
    { pattern: /\ba\s+[aeiou]/i, message: 'Use "an" before vowel sounds' },
  ];
  for (const { pattern, message } of grammarErrors) {
    if (pattern.test(text)) issues.push({ type: 'grammar', message });
  }

  return issues;
}

async function main(args) {
  const { text, level = 'standard', fix = false, action = 'check' } = args || {};
  if (!text) return { error: 'Missing text to check' };

  const heuristics = heuristicCheck(text);

  try {
    const systemPrompt = level === 'strict'
      ? 'You are a professional copy editor. Check for all grammar, spelling, punctuation, style, and clarity issues. Be thorough.'
      : 'You are a grammar assistant. Check for grammar, spelling, and punctuation errors. Focus on clear corrections.';

    const userMsg = fix
      ? `Fix all grammar and spelling issues in this text and return only the corrected version:\n\n${text}`
      : `Check this text for grammar and spelling issues. Return JSON: { "issues": [{ "type": "...", "original": "...", "suggestion": "...", "explanation": "..." }], "overallScore": 0-100, "summary": "..." }\n\n${text}`;

    const resp = await bridgeRequest({
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userMsg }],
      stream: false,
    });

    const content = resp?.content || resp?.raw || '';

    if (fix) {
      return { result: 'Text corrected', corrected: content, original: text };
    }

    let parsed = {};
    try {
      const jsonMatch = content.match(/\{[\s\S]+\}/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: content, issues: [] };
    } catch {
      parsed = { summary: content, issues: [] };
    }

    return {
      result: 'Grammar check complete',
      text,
      issues: [...heuristics, ...(parsed.issues || [])],
      heuristicIssues: heuristics.length,
      aiIssues: (parsed.issues || []).length,
      overallScore: parsed.overallScore,
      summary: parsed.summary,
    };
  } catch (err) {
    return {
      result: 'Heuristic check only (AI unavailable)',
      text,
      issues: heuristics,
      heuristicIssues: heuristics.length,
    };
  }
}
