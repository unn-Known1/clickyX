// Secret Scanner — Scan code for exposed secrets, API keys, and credentials
// Usage: { action: "scan"|"file"|"diff", path, filePath, text }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Patterns for common secrets
const SECRET_PATTERNS = [
  { type: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { type: 'AWS Secret Key', pattern: /(?:aws_secret|AWS_SECRET)[_\s]*[=:]\s*["']?([A-Za-z0-9/+=]{40})["']?/gi, severity: 'critical' },
  { type: 'GitHub Token', pattern: /ghp_[a-zA-Z0-9]{36}|github_pat_[a-zA-Z0-9_]{82}/g, severity: 'critical' },
  { type: 'Google API Key', pattern: /AIza[0-9A-Za-z-_]{35}/g, severity: 'high' },
  { type: 'Slack Token', pattern: /xox[baprs]-[0-9A-Za-z-]+/g, severity: 'high' },
  { type: 'Stripe Secret Key', pattern: /sk_live_[0-9A-Za-z]{24,}/g, severity: 'critical' },
  { type: 'Stripe Publishable Key', pattern: /pk_live_[0-9A-Za-z]{24,}/g, severity: 'medium' },
  { type: 'OpenAI API Key', pattern: /sk-[a-zA-Z0-9]{48}/g, severity: 'critical' },
  { type: 'Private Key Block', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, severity: 'critical' },
  { type: 'JWT Token', pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g, severity: 'medium' },
  { type: 'Password in URL', pattern: /(?:https?:\/\/)[^:@\s]+:[^@\s]+@/g, severity: 'high' },
  { type: 'Generic API Key', pattern: /(?:api[_-]?key|apikey|api_secret)[_\s]*[=:]\s*["']?([a-zA-Z0-9_-]{20,})["']?/gi, severity: 'medium' },
  { type: 'Generic Secret', pattern: /(?:secret|password|passwd|token)[_\s]*[=:]\s*["']([a-zA-Z0-9_@#$%^&*!-]{8,})["']/gi, severity: 'medium' },
  { type: 'Bearer Token', pattern: /Bearer\s+[a-zA-Z0-9\-._~+/]+=*/g, severity: 'high' },
];

function scanText(text, filePath = '') {
  const findings = [];
  for (const { type, pattern, severity } of SECRET_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = re.exec(text)) !== null) {
      const lineNum = text.slice(0, match.index).split('\n').length;
      const masked = match[0].slice(0, 6) + '***' + match[0].slice(-3);
      findings.push({ type, severity, file: filePath, line: lineNum, match: masked, offset: match.index });
    }
  }
  return findings;
}

function walkDir(dir, results, depth = 0) {
  if (depth > 5) return;
  const skipDirs = ['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '__pycache__'];
  const skipExts = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.ico', '.woff', '.ttf', '.pdf', '.zip'];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (skipDirs.includes(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walkDir(full, results, depth + 1);
      else if (entry.isFile() && !skipExts.includes(path.extname(entry.name).toLowerCase())) {
        results.push(full);
      }
    }
  } catch { /* skip inaccessible */ }
}

async function main(args) {
  const { action, path: scanPath, filePath, text } = args || {};

  try {
    // Try gitleaks or trufflehog first
    if (action === 'scan' && scanPath && fs.statSync(scanPath).isDirectory()) {
      for (const tool of ['gitleaks detect --source . --no-git', 'trufflehog filesystem .']) {
        try {
          const out = execSync(tool, { cwd: scanPath, encoding: 'utf-8', timeout: 30000 });
          return { result: `${tool.split(' ')[0]} scan complete`, output: out.slice(0, 3000) };
        } catch { /* try next */ }
      }
    }

    switch (action) {
      case 'scan': {
        if (!scanPath) return { error: 'Missing path to scan' };
        const stat = fs.statSync(scanPath);
        const allFindings = [];

        if (stat.isFile()) {
          const content = fs.readFileSync(scanPath, 'utf-8');
          allFindings.push(...scanText(content, scanPath));
        } else {
          const files = [];
          walkDir(scanPath, files);
          for (const f of files) {
            try {
              const stat = fs.statSync(f);
              if (stat.size > 1024 * 1024) continue; // skip > 1MB
              const content = fs.readFileSync(f, 'utf-8');
              allFindings.push(...scanText(content, f));
            } catch { /* skip binary */ }
          }
        }

        const critical = allFindings.filter((f) => f.severity === 'critical').length;
        const high = allFindings.filter((f) => f.severity === 'high').length;
        return {
          result: `${allFindings.length} potential secret(s) found`,
          path: scanPath,
          summary: { critical, high, medium: allFindings.length - critical - high },
          findings: allFindings.slice(0, 50).map((f) => ({ ...f, file: path.relative(scanPath, f.file || '') })),
        };
      }

      case 'text': {
        if (!text) return { error: 'Missing text to scan' };
        const findings = scanText(text, 'input');
        return { result: `${findings.length} potential secret(s)`, findings };
      }

      default:
        return { error: `Unknown action: ${action}. Use: scan, text` };
    }
  } catch (err) {
    console.error('[secret-scanner]', err.message);
    return { error: err.message };
  }
}
