// Env Manager — Read, write, and manage environment variables and .env files
// Usage: { action: "read"|"write"|"list"|"delete"|"load"|"generate", filePath, key, value }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const os = require('os');

function parseEnvFile(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    let key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    // Strip quotes
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function serializeEnvFile(vars) {
  return Object.entries(vars).map(([k, v]) => {
    const needsQuotes = /[\s#"']/.test(v);
    return `${k}=${needsQuotes ? `"${v.replace(/"/g, '\\"')}"` : v}`;
  }).join('\n') + '\n';
}

async function main(args) {
  const { action, filePath: fileArg, key, value } = args || {};
  const envFile = fileArg || path.join(process.cwd(), '.env');

  try {
    switch (action) {
      case 'read': {
        if (!key) return { error: 'Missing key' };
        // Check process env first, then .env file
        if (process.env[key] !== undefined) {
          return { result: 'Found in process env', key, value: process.env[key], source: 'process' };
        }
        if (fs.existsSync(envFile)) {
          const vars = parseEnvFile(fs.readFileSync(envFile, 'utf-8'));
          if (vars[key] !== undefined) return { result: 'Found in .env', key, value: vars[key], source: envFile };
        }
        return { result: `Key "${key}" not found`, key, value: null };
      }

      case 'list': {
        const envVars = {};
        if (fs.existsSync(envFile)) {
          Object.assign(envVars, parseEnvFile(fs.readFileSync(envFile, 'utf-8')));
        }
        // Optionally mask secrets
        const masked = Object.fromEntries(
          Object.entries(envVars).map(([k, v]) => [k, /key|secret|token|password|pass/i.test(k) ? '****' : v])
        );
        return { result: `${Object.keys(masked).length} variables in ${envFile}`, variables: masked, filePath: envFile };
      }

      case 'write':
      case 'set': {
        if (!key || value === undefined) return { error: 'Missing key or value' };
        let vars = {};
        if (fs.existsSync(envFile)) {
          vars = parseEnvFile(fs.readFileSync(envFile, 'utf-8'));
        }
        vars[key] = String(value);
        fs.mkdirSync(path.dirname(envFile), { recursive: true });
        fs.writeFileSync(envFile, serializeEnvFile(vars), 'utf-8');
        return { result: 'Variable written', key, filePath: envFile };
      }

      case 'delete': {
        if (!key) return { error: 'Missing key' };
        if (!fs.existsSync(envFile)) return { error: `.env file not found: ${envFile}` };
        const vars = parseEnvFile(fs.readFileSync(envFile, 'utf-8'));
        const existed = key in vars;
        delete vars[key];
        fs.writeFileSync(envFile, serializeEnvFile(vars), 'utf-8');
        return { result: existed ? `Deleted ${key}` : `Key ${key} not found`, filePath: envFile };
      }

      case 'load': {
        if (!fs.existsSync(envFile)) return { error: `.env file not found: ${envFile}` };
        const vars = parseEnvFile(fs.readFileSync(envFile, 'utf-8'));
        let loaded = 0;
        for (const [k, v] of Object.entries(vars)) {
          if (!process.env[k]) { process.env[k] = v; loaded++; }
        }
        return { result: `Loaded ${loaded} variables into process.env`, total: Object.keys(vars).length, loaded };
      }

      case 'generate': {
        // Generate a new .env template
        const template = [
          '# Application',
          'APP_NAME=myapp',
          'APP_ENV=development',
          'APP_PORT=3000',
          '',
          '# Database',
          'DB_HOST=localhost',
          'DB_PORT=5432',
          'DB_NAME=',
          'DB_USER=',
          'DB_PASSWORD=',
          '',
          '# API Keys',
          'OPENAI_API_KEY=',
          'ANTHROPIC_API_KEY=',
          '',
        ].join('\n');
        const outPath = envFile.endsWith('.env') ? envFile.replace('.env', '.env.example') : envFile + '.example';
        fs.writeFileSync(outPath, template, 'utf-8');
        return { result: 'Template generated', path: outPath };
      }

      default:
        return { error: `Unknown action: ${action}. Use: read, list, write, delete, load, generate` };
    }
  } catch (err) {
    console.error('[env-manager]', err.message);
    return { error: err.message };
  }
}
