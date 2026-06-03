const http = require('http');
const { execSync } = require('child_process');

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

function getGitDiff(repoPath) {
  const opts = repoPath ? { cwd: repoPath } : {};
  return execSync('git diff --unified=5', { ...opts, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

async function main(args) {
  const { repoPath, diffOverride } = args || {};

  console.log(`[code-review] Reviewing code changes${repoPath ? ' in ' + repoPath : ''}`);

  try {
    const diff = diffOverride || getGitDiff(repoPath);

    if (!diff) {
      return { result: 'No changes to review. Working tree is clean.' };
    }

    console.log(`[code-review] Diff size: ${diff.length} chars`);

    const systemPrompt = `You are a senior code reviewer. Review the following git diff and provide feedback.

For each change, consider:
1. **Correctness** — Does the change introduce bugs?
2. **Security** — Are there any security concerns?
3. **Performance** — Could the change impact performance?
4. **Style** — Does it follow best practices and consistent style?
5. **Maintainability** — Is the code clear and easy to maintain?

Format your review with:
- Overall assessment
- Per-file comments (if multiple files)
- Specific line-level suggestions
- Summary of findings`;

    const resp = await bridgeRequest('/v1/messages', {
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Review the following diff:\n\n\`\`\`diff\n${diff}\n\`\`\`` },
      ],
      stream: false,
    });

    const review = resp?.content || resp?.raw || 'Review generated no content.';
    console.log(`[code-review] Review complete (${review.length} chars)`);

    return {
      result: 'Code review complete',
      review,
      diffLength: diff.length,
      reviewedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error('[code-review] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
