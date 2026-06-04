// Vercel Deploy — Deploy to Vercel, check deployments and logs
// Usage: { action: "deploy"|"list"|"get"|"logs"|"domains", projectId, teamId, ... }
// Requires: VERCEL_TOKEN env var

module.exports = { main };

const { execSync } = require('child_process');
const path = require('path');

async function vercelFetch(token, path, options = {}) {
  const res = await fetch(`https://api.vercel.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main(args) {
  const { action, projectId, deploymentId, teamId, cwd, token: tokenArg } = args || {};
  const token = tokenArg || process.env.VERCEL_TOKEN;
  const teamQuery = teamId ? `?teamId=${teamId}` : '';

  if (!token) return { error: 'Missing VERCEL_TOKEN' };

  try {
    switch (action) {
      case 'deploy': {
        // Try vercel CLI
        try {
          const dir = cwd || process.cwd();
          const out = execSync(`vercel --token ${token} ${teamId ? `--scope ${teamId}` : ''} --yes`, {
            cwd: dir, encoding: 'utf-8', timeout: 120000,
          });
          const url = out.match(/https:\/\/[^\s]+/)?.[0] || '';
          return { result: 'Deployed', url, output: out.trim() };
        } catch (e) {
          return { error: `Deploy failed: ${e.message}` };
        }
      }

      case 'list': {
        const data = await vercelFetch(token, `/v6/deployments${teamQuery ? teamQuery : '?limit=20'}${teamQuery ? '&limit=20' : ''}`);
        return {
          result: `Found ${(data.deployments || []).length} deployments`,
          deployments: (data.deployments || []).map((d) => ({
            uid: d.uid, name: d.name, url: d.url, state: d.state, createdAt: d.createdAt,
          })),
        };
      }

      case 'get': {
        if (!deploymentId) return { error: 'Missing deploymentId' };
        const d = await vercelFetch(token, `/v13/deployments/${deploymentId}${teamQuery}`);
        return { uid: d.uid, name: d.name, url: d.url, state: d.readyState, createdAt: d.createdAt, meta: d.meta };
      }

      case 'logs': {
        if (!deploymentId) return { error: 'Missing deploymentId' };
        const data = await vercelFetch(token, `/v2/deployments/${deploymentId}/events${teamQuery}`);
        return { result: 'Logs fetched', logs: (data || []).slice(0, 50).map((e) => ({ type: e.type, created: e.created, text: e.payload?.text || '' })) };
      }

      case 'domains': {
        if (!projectId) return { error: 'Missing projectId' };
        const data = await vercelFetch(token, `/v9/projects/${projectId}/domains${teamQuery}`);
        return { result: `${(data.domains || []).length} domains`, domains: (data.domains || []).map((d) => ({ name: d.name, verified: d.verified, configuredBy: d.configuredBy })) };
      }

      default:
        return { error: `Unknown action: ${action}. Use: deploy, list, get, logs, domains` };
    }
  } catch (err) {
    console.error('[vercel-deploy]', err.message);
    return { error: err.message };
  }
}
