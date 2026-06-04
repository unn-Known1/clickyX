// GitHub Issues — Create, list, close, comment on GitHub issues
// Usage: { action: "list"|"create"|"close"|"comment"|"get", owner, repo, ...params }
// Requires: GITHUB_TOKEN env var or token param

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

// Try gh CLI first, fall back to API
function tryGhCli(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', timeout: 15000 });
  } catch {
    return null;
  }
}

async function main(args) {
  const { action, owner, repo, issueNumber, title, body, labels, assignees, state = 'open', comment, token: tokenArg } = args || {};
  const token = tokenArg || process.env.GITHUB_TOKEN;

  if (!owner || !repo) return { error: 'Missing owner or repo' };

  // Prefer gh CLI when available and no explicit token
  if (!tokenArg) {
    const ghCheck = tryGhCli('gh --version');
    if (ghCheck) {
      try {
        switch (action) {
          case 'list': {
            const out = tryGhCli(`gh issue list --repo ${owner}/${repo} --state ${state} --json number,title,state,labels,assignees,createdAt --limit 30`);
            if (out) return { result: 'Issues listed', issues: JSON.parse(out) };
            break;
          }
          case 'create': {
            if (!title) return { error: 'Missing title' };
            const labelFlag = labels?.length ? `--label "${labels.join(',')}"` : '';
            const out = tryGhCli(`gh issue create --repo ${owner}/${repo} --title "${title.replace(/"/g, '\\"')}" --body "${(body || '').replace(/"/g, '\\"')}" ${labelFlag}`);
            if (out) return { result: 'Issue created', url: out.trim() };
            break;
          }
          case 'close': {
            if (!issueNumber) return { error: 'Missing issueNumber' };
            tryGhCli(`gh issue close ${issueNumber} --repo ${owner}/${repo}`);
            return { result: 'Issue closed', issueNumber };
          }
          case 'comment': {
            if (!issueNumber || !comment) return { error: 'Missing issueNumber or comment' };
            tryGhCli(`gh issue comment ${issueNumber} --repo ${owner}/${repo} --body "${comment.replace(/"/g, '\\"')}"`);
            return { result: 'Comment posted', issueNumber };
          }
        }
      } catch (e) {
        console.warn('[github-issues] gh CLI failed, falling back to API:', e.message);
      }
    }
  }

  if (!token) return { error: 'Missing GITHUB_TOKEN. Set env var or install gh CLI.' };

  try {
    switch (action) {
      case 'list': {
        const data = await ghFetch(token, `/repos/${owner}/${repo}/issues?state=${state}&per_page=30`);
        return { result: `Found ${data.length} issues`, issues: data.map((i) => ({ number: i.number, title: i.title, state: i.state, labels: i.labels?.map((l) => l.name), created_at: i.created_at })) };
      }
      case 'get': {
        if (!issueNumber) return { error: 'Missing issueNumber' };
        const i = await ghFetch(token, `/repos/${owner}/${repo}/issues/${issueNumber}`);
        return { result: 'Issue fetched', number: i.number, title: i.title, body: i.body, state: i.state, labels: i.labels?.map((l) => l.name) };
      }
      case 'create': {
        if (!title) return { error: 'Missing title' };
        const i = await ghFetch(token, `/repos/${owner}/${repo}/issues`, {
          method: 'POST',
          body: JSON.stringify({ title, body: body || '', labels: labels || [], assignees: assignees || [] }),
        });
        return { result: 'Issue created', number: i.number, url: i.html_url };
      }
      case 'close': {
        if (!issueNumber) return { error: 'Missing issueNumber' };
        await ghFetch(token, `/repos/${owner}/${repo}/issues/${issueNumber}`, {
          method: 'PATCH',
          body: JSON.stringify({ state: 'closed' }),
        });
        return { result: 'Issue closed', issueNumber };
      }
      case 'comment': {
        if (!issueNumber || !comment) return { error: 'Missing issueNumber or comment' };
        const c = await ghFetch(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
          method: 'POST',
          body: JSON.stringify({ body: comment }),
        });
        return { result: 'Comment posted', id: c.id, url: c.html_url };
      }
      default:
        return { error: `Unknown action: ${action}. Use: list, get, create, close, comment` };
    }
  } catch (err) {
    console.error('[github-issues]', err.message);
    return { error: err.message };
  }
}
