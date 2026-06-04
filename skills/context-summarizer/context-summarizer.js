// Context Summarizer — Summarize long context for efficient AI consumption
// Usage: { text, targetTokens, style, preserveCode }

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

function estimateTokens(text) {
  // Rough approximation: ~4 chars per token
  return Math.ceil(text.length / 4);
}

function extractCodeBlocks(text) {
  const blocks = [];
  const stripped = text.replace(/```[\s\S]*?```/g, (match) => {
    blocks.push(match);
    return `[CODE_BLOCK_${blocks.length - 1}]`;
  });
  return { stripped, blocks };
}

function chunkedSummarize(text, chunkSize = 8000) {
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(text.slice(i, i + chunkSize));
  }
  return chunks;
}

async function main(args) {
  const { text, targetTokens = 2000, style = 'structured', preserveCode = true } = args || {};

  if (!text) return { error: 'Missing text to summarize' };

  const originalTokens = estimateTokens(text);
  const compressionRatio = (targetTokens / originalTokens * 100).toFixed(0);

  if (originalTokens <= targetTokens) {
    return { result: 'Text already within target token budget', text, originalTokens, targetTokens, compressionNeeded: false };
  }

  // Extract and preserve code blocks if requested
  let processText = text;
  let codeBlocks = [];
  if (preserveCode) {
    const extracted = extractCodeBlocks(text);
    processText = extracted.stripped;
    codeBlocks = extracted.blocks;
  }

  const styleInstructions = {
    structured: 'Create a structured summary with clear sections, key points, and important details. Use markdown headers.',
    dense: 'Create the most information-dense summary possible, removing all fluff and redundancy.',
    outline: 'Create a hierarchical outline capturing all key topics and their relationships.',
    qa: 'Extract the most important facts as Q&A pairs.',
  };

  const instruction = styleInstructions[style] || styleInstructions.structured;
  const targetWords = Math.round(targetTokens * 0.75);

  try {
    const chunks = chunkedSummarize(processText, 12000);
    let summaries = [];

    for (const chunk of chunks) {
      const resp = await bridgeRequest({
        messages: [
          { role: 'system', content: `${instruction} Target: ~${targetWords / chunks.length} words. Preserve all technical details, names, numbers, and critical information.` },
          { role: 'user', content: `Summarize this context:\n\n${chunk}` },
        ],
        stream: false,
      });
      summaries.push(resp?.content || resp?.raw || '');
    }

    let finalSummary = summaries.join('\n\n---\n\n');

    // If multi-chunk, do a second pass to merge
    if (chunks.length > 1) {
      const resp = await bridgeRequest({
        messages: [
          { role: 'system', content: `${instruction} Merge these section summaries into one coherent summary of ~${targetWords} words.` },
          { role: 'user', content: finalSummary },
        ],
        stream: false,
      });
      finalSummary = resp?.content || resp?.raw || finalSummary;
    }

    // Restore code blocks
    if (preserveCode && codeBlocks.length > 0) {
      finalSummary = finalSummary.replace(/\[CODE_BLOCK_(\d+)\]/g, (_, i) => codeBlocks[parseInt(i)] || '');
    }

    return {
      result: 'Context summarized',
      summary: finalSummary,
      originalTokens,
      summaryTokens: estimateTokens(finalSummary),
      compressionRatio: compressionRatio + '%',
      codeBlocksPreserved: codeBlocks.length,
    };
  } catch (err) {
    console.error('[context-summarizer]', err.message);
    return { error: err.message };
  }
}
