// GitHub PR — Create, list, review, and merge Pull Requests
// Usage: { action: "list"|"create"|"get"|"merge"|"review", owner, repo, ...params }
// Requires: GITHUB_TOKEN env var or gh CLI

module.exports = { main };

const { execSync } = require('child_process');

async function ghFetch(token, path, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  if (res.status === 204) return {};
  return res.json();
}

function tryGhCli(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 15000 }); } catch { return null; }
}

async function main(args) {
  const { action, owner, repo, prNumber, title, body, head, base = 'main', mergeMethod = 'merge', event = 'COMMENT', reviewBody, token: tokenArg } = args || {};
  const token = tokenArg || process.env.GITHUB_TOKEN;

  if (!owner || !repo) return { error: 'Missing owner or repo' };

  if (!tokenArg && tryGhCli('gh --version')) {
    try {
      switch (action) {
        case 'list': {
          const out = tryGhCli(`gh pr list --repo ${owner}/${repo} --json number,title,state,headRefName,baseRefName,createdAt --limit 20`);
          if (out) return { result: 'PRs listed', prs: JSON.parse(out) };
          break;
        }
        case 'create': {
          if (!title || !head) return { error: 'Missing title or head branch' };
          const out = tryGhCli(`gh pr create --repo ${owner}/${repo} --title "${title.replace(/"/g, '\\"')}" --body "${(body || '').replace(/"/g, '\\"')}" --base ${base} --head ${head}`);
          if (out) return { result: 'PR created', url: out.trim() };
          break;
        }
        case 'merge': {
          if (!prNumber) return { error: 'Missing prNumber' };
          tryGhCli(`gh pr merge ${prNumber} --repo ${owner}/${repo} --${mergeMethod}`);
          return { result: 'PR merged', prNumber };
        }
      }
    } catch (e) {
      console.warn('[github-pr] gh CLI failed:', e.message);
    }
  }

  if (!token) return { error: 'Missing GITHUB_TOKEN' };

  try {
    switch (action) {
      case 'list': {
        const data = await ghFetch(token, `/repos/${owner}/${repo}/pulls?state=open&per_page=20`);
        return { result: `Found ${data.length} PRs`, prs: data.map((p) => ({ number: p.number, title: p.title, head: p.head?.ref, base: p.base?.ref, state: p.state, created_at: p.created_at, url: p.html_url })) };
      }
      case 'get': {
        if (!prNumber) return { error: 'Missing prNumber' };
        const p = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}`);
        return { number: p.number, title: p.title, body: p.body, head: p.head?.ref, base: p.base?.ref, state: p.state, mergeable: p.mergeable, url: p.html_url };
      }
      case 'create': {
        if (!title || !head) return { error: 'Missing title or head' };
        const p = await ghFetch(token, `/repos/${owner}/${repo}/pulls`, {
          method: 'POST',
          body: JSON.stringify({ title, body: body || '', head, base }),
        });
        return { result: 'PR created', number: p.number, url: p.html_url };
      }
      case 'merge': {
        if (!prNumber) return { error: 'Missing prNumber' };
        await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
          method: 'PUT',
          body: JSON.stringify({ merge_method: mergeMethod }),
        });
        return { result: 'PR merged', prNumber };
      }
      case 'review': {
        if (!prNumber) return { error: 'Missing prNumber' };
        const r = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
          method: 'POST',
          body: JSON.stringify({ body: reviewBody || '', event }),
        });
        return { result: 'Review submitted', id: r.id, state: r.state };
      }
      case 'diff': {
        if (!prNumber) return { error: 'Missing prNumber' };
        const files = await ghFetch(token, `/repos/${owner}/${repo}/pulls/${prNumber}/files`);
        return { result: `${files.length} files changed`, files: files.map((f) => ({ filename: f.filename, status: f.status, additions: f.additions, deletions: f.deletions, patch: f.patch })) };
      }
      default:
        return { error: `Unknown action: ${action}. Use: list, get, create, merge, review, diff` };
    }
  } catch (err) {
    console.error('[github-pr]', err.message);
    return { error: err.message };
  }
}
