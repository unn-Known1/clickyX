// npm Helper — Run scripts, check outdated packages, audit for vulnerabilities
// Usage: { action: "run"|"outdated"|"audit"|"install"|"list"|"info", script, cwd, package }

module.exports = { main };

const { execSync } = require('child_process');
const path = require('path');

function run(cmd, cwd) {
  try {
    return { output: execSync(cmd, { cwd, encoding: 'utf-8', timeout: 120000 }), error: null };
  } catch (e) {
    return { output: e.stdout || '', error: e.stderr || e.message };
  }
}

async function main(args) {
  const { action, script, cwd: cwdArg, package: pkg, manager = 'npm' } = args || {};
  const cwd = cwdArg || process.cwd();
  const bin = manager === 'yarn' ? 'yarn' : manager === 'pnpm' ? 'pnpm' : 'npm';

  try {
    switch (action) {
      case 'run': {
        if (!script) return { error: 'Missing script name' };
        const { output, error } = run(`${bin} run ${script}`, cwd);
        return { result: error ? 'Script failed' : 'Script completed', script, output: output.slice(0, 5000), error: error?.slice(0, 2000) };
      }

      case 'outdated': {
        const { output } = run(`${bin} outdated --json`, cwd);
        let parsed = {};
        try { parsed = JSON.parse(output); } catch { /* npm exits non-zero when outdated */ }
        const packages = Object.entries(parsed).map(([name, info]) => ({
          name, current: info.current, wanted: info.wanted, latest: info.latest,
        }));
        return { result: `${packages.length} outdated package(s)`, packages };
      }

      case 'audit': {
        const { output, error } = run(`${bin} audit --json`, cwd);
        const raw = output || error || '{}';
        let parsed = {};
        try { parsed = JSON.parse(raw); } catch { return { result: 'Audit output', raw: raw.slice(0, 3000) }; }
        const vulns = parsed.vulnerabilities || parsed.advisories || {};
        const summary = parsed.metadata?.vulnerabilities || parsed.metadata || {};
        return {
          result: 'Audit complete',
          summary,
          vulnerabilityCount: Object.keys(vulns).length,
          vulnerabilities: Object.values(vulns).slice(0, 10).map((v) => ({
            name: v.name || v.module_name,
            severity: v.severity,
            title: v.title || v.overview,
          })),
        };
      }

      case 'install': {
        const pkgArg = pkg ? ` ${pkg}` : '';
        const { output, error } = run(`${bin} install${pkgArg}`, cwd);
        return { result: error ? 'Install failed' : 'Install complete', output: output.slice(0, 2000), error: error?.slice(0, 1000) };
      }

      case 'list': {
        const { output } = run(`${bin} list --depth=0 --json`, cwd);
        let parsed = {};
        try { parsed = JSON.parse(output); } catch { return { result: 'List output', raw: output.slice(0, 3000) }; }
        const deps = Object.entries(parsed.dependencies || {}).map(([name, info]) => ({ name, version: info.version }));
        return { result: `${deps.length} top-level packages`, packages: deps };
      }

      case 'info': {
        if (!pkg) return { error: 'Missing package name' };
        const { output } = run(`npm info ${pkg} --json`, cwd);
        try {
          const info = JSON.parse(output);
          return { name: info.name, version: info.version, description: info.description, license: info.license, homepage: info.homepage, keywords: info.keywords };
        } catch {
          return { result: output.slice(0, 1000) };
        }
      }

      case 'scripts': {
        const { output } = run(`${bin} run --json 2>/dev/null || cat package.json`, cwd);
        try {
          const pkg = JSON.parse(output);
          return { result: 'Scripts listed', scripts: pkg.scripts || {} };
        } catch {
          return { result: 'Scripts', raw: output.slice(0, 1000) };
        }
      }

      default:
        return { error: `Unknown action: ${action}. Use: run, outdated, audit, install, list, info, scripts` };
    }
  } catch (err) {
    console.error('[npm-helper]', err.message);
    return { error: err.message };
  }
}
