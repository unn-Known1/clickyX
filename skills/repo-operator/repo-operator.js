const { execSync } = require('child_process');

function gitCmd(args, repoPath) {
  const opts = repoPath ? { cwd: repoPath } : {};
  return execSync(`git ${args}`, { ...opts, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
}

async function main(args) {
  const { action, repoPath, message, branch, extraArgs } = args || {};

  console.log(`[repo-operator] action=${action} repo=${repoPath || 'cwd'}`);

  try {
    switch (action) {
      case 'status': {
        const output = gitCmd('status', repoPath);
        return { result: output };
      }
      case 'diff': {
        const target = extraArgs || 'HEAD';
        const output = gitCmd(`diff ${target}`, repoPath);
        return { result: output || 'No changes' };
      }
      case 'log': {
        const count = extraArgs || '10';
        const output = gitCmd(`log --oneline -${count}`, repoPath);
        return { result: output || 'No commits' };
      }
      case 'commit': {
        if (!message) return { error: 'Missing required field: message' };
        gitCmd('add -A', repoPath);
        const output = gitCmd(`commit -m "${message.replace(/"/g, '\\"')}"`, repoPath);
        return { result: output };
      }
      case 'branch': {
        const output = gitCmd('branch', repoPath);
        return { result: output };
      }
      case 'create_branch': {
        if (!branch) return { error: 'Missing required field: branch' };
        const output = gitCmd(`checkout -b "${branch}"`, repoPath);
        return { result: output };
      }
      case 'checkout': {
        if (!branch) return { error: 'Missing required field: branch' };
        const output = gitCmd(`checkout "${branch}"`, repoPath);
        return { result: output };
      }
      default:
        return { error: `Unknown action: ${action}. Use: status, diff, log, commit, branch, create_branch, checkout` };
    }
  } catch (err) {
    console.error('[repo-operator] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
