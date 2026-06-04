// Git Helper — Log, diff, blame, stash, cherry-pick, branch management
// Usage: { action: "log"|"diff"|"blame"|"stash"|"branch"|"status"|"cherry-pick", cwd, ...params }

module.exports = { main };

const { execSync } = require('child_process');
const path = require('path');

function git(cmd, cwd) {
  try {
    return execSync(`git ${cmd}`, { cwd: cwd || process.cwd(), encoding: 'utf-8', timeout: 30000 });
  } catch (e) {
    throw new Error(e.stderr?.trim() || e.message);
  }
}

async function main(args) {
  const { action, cwd, file, commit, branch, from, to, lines = 20, message, targetBranch } = args || {};
  const repoDir = cwd || process.cwd();

  try {
    // Verify it's a git repo
    try { git('rev-parse --git-dir', repoDir); } catch { return { error: `Not a git repository: ${repoDir}` }; }

    switch (action) {
      case 'log': {
        const format = '--format="%H|%an|%ae|%ad|%s" --date=short';
        const limitFlag = `--max-count=${lines}`;
        const fileFlag = file ? `-- "${file}"` : '';
        const out = git(`log ${format} ${limitFlag} ${fileFlag}`, repoDir);
        const commits = out.trim().split('\n').filter(Boolean).map((l) => {
          const [hash, author, email, date, ...msgParts] = l.replace(/"/g, '').split('|');
          return { hash: hash?.slice(0, 8), author, email, date, message: msgParts.join('|') };
        });
        return { result: `${commits.length} commits`, commits };
      }

      case 'diff': {
        const target = commit || (from && to ? `${from}..${to}` : '');
        const fileFlag = file ? `-- "${file}"` : '';
        const out = git(`diff ${target} ${fileFlag}`, repoDir);
        return { result: 'Diff', diff: out.slice(0, 10000), truncated: out.length > 10000 };
      }

      case 'blame': {
        if (!file) return { error: 'Missing file' };
        const out = git(`blame --porcelain "${file}"`, repoDir);
        const lines_out = out.trim().split('\n');
        const entries = [];
        let current = {};
        for (const line of lines_out) {
          if (line.match(/^[0-9a-f]{40}/)) {
            const [hash, origLine, finalLine] = line.split(' ');
            current = { hash: hash?.slice(0, 8), origLine, finalLine };
          } else if (line.startsWith('author ')) current.author = line.slice(7);
          else if (line.startsWith('author-time ')) current.time = new Date(parseInt(line.slice(12)) * 1000).toISOString().slice(0, 10);
          else if (line.startsWith('summary ')) current.summary = line.slice(8);
          else if (line.startsWith('\t')) { current.content = line.slice(1); entries.push({ ...current }); current = {}; }
        }
        return { result: `Blame for ${file}`, entries: entries.slice(0, 50) };
      }

      case 'stash': {
        const sub = args?.sub || 'list';
        if (sub === 'list') {
          const out = git('stash list', repoDir);
          return { result: 'Stash list', stashes: out.trim().split('\n').filter(Boolean) };
        }
        if (sub === 'save') {
          git(`stash push -m "${(message || 'stash').replace(/"/g, '\\"')}"`, repoDir);
          return { result: 'Stashed changes' };
        }
        if (sub === 'pop') { git('stash pop', repoDir); return { result: 'Stash popped' }; }
        if (sub === 'drop') { git('stash drop', repoDir); return { result: 'Stash dropped' }; }
        return { error: 'Unknown stash sub-action. Use: list, save, pop, drop' };
      }

      case 'branch': {
        const all = git('branch -a', repoDir);
        const current = git('branch --show-current', repoDir).trim();
        const branches = all.trim().split('\n').map((b) => b.replace(/^\*?\s+/, ''));
        return { result: `${branches.length} branches`, current, branches };
      }

      case 'status': {
        const out = git('status --porcelain', repoDir);
        const files = out.trim().split('\n').filter(Boolean).map((l) => ({
          status: l.slice(0, 2).trim(), file: l.slice(3),
        }));
        const branch = git('branch --show-current', repoDir).trim();
        return { result: `${files.length} changed files`, branch, files };
      }

      case 'cherry-pick': {
        if (!commit) return { error: 'Missing commit hash' };
        git(`cherry-pick ${commit}`, repoDir);
        return { result: `Cherry-picked ${commit}`, repoDir };
      }

      case 'remote': {
        const out = git('remote -v', repoDir);
        const remotes = out.trim().split('\n').filter(Boolean).map((l) => {
          const [name, url, type] = l.split(/\s+/);
          return { name, url, type: type?.replace(/[()]/g, '') };
        });
        return { result: `${remotes.length / 2 | 0} remote(s)`, remotes };
      }

      default:
        return { error: `Unknown action: ${action}. Use: log, diff, blame, stash, branch, status, cherry-pick, remote` };
    }
  } catch (err) {
    console.error('[git-helper]', err.message);
    return { error: err.message };
  }
}
