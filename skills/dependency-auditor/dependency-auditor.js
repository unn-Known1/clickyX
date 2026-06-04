// Dependency Auditor — Check npm, cargo, and pip dependencies for vulnerabilities
// Usage: { action: "audit"|"check"|"outdated", projectPath, ecosystem }

module.exports = { main };

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function run(cmd, cwd, timeout = 60000) {
  try { return { output: execSync(cmd, { cwd, encoding: 'utf-8', timeout }), error: null }; }
  catch (e) { return { output: e.stdout || '', error: e.stderr || e.message }; }
}

function detectEcosystem(dir) {
  if (fs.existsSync(path.join(dir, 'package.json'))) return 'npm';
  if (fs.existsSync(path.join(dir, 'Cargo.toml'))) return 'cargo';
  if (fs.existsSync(path.join(dir, 'requirements.txt')) || fs.existsSync(path.join(dir, 'pyproject.toml'))) return 'pip';
  return null;
}

async function auditNpm(dir) {
  const { output, error } = run('npm audit --json', dir);
  const raw = output || error || '{}';
  try {
    const data = JSON.parse(raw);
    const vulns = data.vulnerabilities || {};
    const meta = data.metadata?.vulnerabilities || {};
    const findings = Object.entries(vulns).slice(0, 20).map(([name, info]) => ({
      name,
      severity: info.severity,
      range: info.range,
      fixAvailable: !!info.fixAvailable,
    }));
    return { ecosystem: 'npm', summary: meta, findings, total: Object.keys(vulns).length };
  } catch {
    return { ecosystem: 'npm', raw: raw.slice(0, 2000) };
  }
}

async function auditCargo(dir) {
  const { output, error } = run('cargo audit --json 2>/dev/null || cargo audit', dir);
  const raw = output || error || '';
  try {
    const data = JSON.parse(raw);
    const vulns = data.vulnerabilities?.list || [];
    return {
      ecosystem: 'cargo',
      total: vulns.length,
      findings: vulns.slice(0, 20).map((v) => ({
        crate: v.package?.name,
        version: v.package?.version,
        id: v.advisory?.id,
        title: v.advisory?.title,
        severity: v.advisory?.cvss?.score ? (v.advisory.cvss.score >= 9 ? 'critical' : v.advisory.cvss.score >= 7 ? 'high' : 'medium') : 'unknown',
        url: v.advisory?.url,
      })),
    };
  } catch {
    return { ecosystem: 'cargo', output: raw.slice(0, 2000) };
  }
}

async function auditPip(dir) {
  const { output, error } = run('pip-audit --format json 2>/dev/null || safety check --json 2>/dev/null', dir);
  const raw = output || error || '[]';
  try {
    const data = JSON.parse(raw);
    const vulns = Array.isArray(data) ? data : data.vulnerabilities || [];
    return {
      ecosystem: 'pip',
      total: vulns.length,
      findings: vulns.slice(0, 20).map((v) => ({
        package: v.name || v.package_name,
        version: v.version || v.installed_version,
        id: v.id || v.vulnerability_id,
        description: (v.description || v.advisory || '').slice(0, 200),
      })),
    };
  } catch {
    return { ecosystem: 'pip', output: raw.slice(0, 2000) };
  }
}

async function main(args) {
  const { action, projectPath: pathArg, ecosystem: ecoArg } = args || {};
  const projectPath = pathArg || process.cwd();

  if (!fs.existsSync(projectPath)) return { error: `Path not found: ${projectPath}` };

  const ecosystem = ecoArg || detectEcosystem(projectPath);
  if (!ecosystem) return { error: 'Could not detect ecosystem. Expected package.json, Cargo.toml, or requirements.txt.' };

  try {
    switch (action) {
      case 'audit':
      case 'check': {
        if (ecosystem === 'npm') return await auditNpm(projectPath);
        if (ecosystem === 'cargo') return await auditCargo(projectPath);
        if (ecosystem === 'pip') return await auditPip(projectPath);
        return { error: `Unsupported ecosystem: ${ecosystem}` };
      }

      case 'outdated': {
        if (ecosystem === 'npm') {
          const { output } = run('npm outdated --json', projectPath);
          try {
            const data = JSON.parse(output || '{}');
            const outdated = Object.entries(data).map(([name, info]) => ({ name, current: info.current, wanted: info.wanted, latest: info.latest }));
            return { result: `${outdated.length} outdated package(s)`, ecosystem: 'npm', packages: outdated };
          } catch { return { ecosystem: 'npm', output: output?.slice(0, 2000) }; }
        }
        if (ecosystem === 'cargo') {
          const { output } = run('cargo outdated --format json 2>/dev/null || cargo outdated', projectPath);
          return { ecosystem: 'cargo', output: output?.slice(0, 2000) };
        }
        if (ecosystem === 'pip') {
          const { output } = run('pip list --outdated --format json', projectPath);
          try {
            const data = JSON.parse(output || '[]');
            return { result: `${data.length} outdated package(s)`, ecosystem: 'pip', packages: data };
          } catch { return { ecosystem: 'pip', output: output?.slice(0, 2000) }; }
        }
        break;
      }

      default:
        return { error: `Unknown action: ${action}. Use: audit, check, outdated` };
    }
  } catch (err) {
    console.error('[dependency-auditor]', err.message);
    return { error: err.message };
  }
}
