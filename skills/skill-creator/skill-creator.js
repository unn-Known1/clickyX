// Skill Creator — Guide user through creating a new ClickyX skill
// Usage: { action: "scaffold"|"list"|"validate", name, slug, description, category, permissions }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const http = require('http');

function bridgeRequest(data) {
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1', port: 32123, path: '/v1/messages', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let d = '';
      res.on('data', (c) => d += c);
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch { resolve({ raw: d }); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function findSkillsDir() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'skills');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return path.join(process.cwd(), 'skills');
}

async function main(args) {
  const { action, name, slug: slugArg, description, category = 'utility', permissions = 'safe', template } = args || {};

  const skillsDir = findSkillsDir();

  try {
    switch (action) {
      case 'scaffold': {
        if (!name) return { error: 'Missing skill name' };
        const slug = slugArg || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        const skillDir = path.join(skillsDir, slug);

        if (fs.existsSync(skillDir)) return { error: `Skill "${slug}" already exists at ${skillDir}` };
        fs.mkdirSync(skillDir, { recursive: true });

        // Generate TOML
        const toml = `name = "${slug}"\ndescription = "${description || name}"\nversion = "1.0.0"\npermission_class = "${permissions}"\nentry_point = "${slug}.js"\n`;
        fs.writeFileSync(path.join(skillDir, `${slug}.toml`), toml, 'utf-8');

        // Generate JS — try AI scaffold or use template
        let jsContent;
        try {
          const resp = await bridgeRequest({
            messages: [
              { role: 'system', content: 'You are a skill developer for ClickyX. Generate a Node.js skill module. Output only the JavaScript code, no markdown.' },
              { role: 'user', content: `Create a ClickyX skill called "${name}".\nDescription: ${description || name}\nCategory: ${category}\nThe module should export { main } and implement async function main(args) that returns { result, ...data } on success or { error } on failure.` },
            ],
            stream: false,
          });
          jsContent = resp?.content || resp?.raw || '';
          // Strip markdown fences
          jsContent = jsContent.replace(/^```(?:javascript|js)?\n/, '').replace(/\n```$/, '');
        } catch { /* fall back to template */ }

        if (!jsContent || jsContent.length < 50) {
          jsContent = `// ${name} — ${description || name}\n// Usage: { action: "...", ... }\n\nmodule.exports = { main };\n\nasync function main(args) {\n  const { action } = args || {};\n  \n  try {\n    switch (action) {\n      case 'run': {\n        // TODO: implement\n        return { result: '${name} executed', input: args };\n      }\n      default:\n        return { error: \`Unknown action: \${action}\` };\n    }\n  } catch (err) {\n    console.error('[${slug}]', err.message);\n    return { error: err.message };\n  }\n}\n`;
        }

        fs.writeFileSync(path.join(skillDir, `${slug}.js`), jsContent, 'utf-8');
        return { result: 'Skill scaffolded', slug, path: skillDir, files: [`${slug}.toml`, `${slug}.js`] };
      }

      case 'list': {
        if (!fs.existsSync(skillsDir)) return { error: `Skills directory not found: ${skillsDir}` };
        const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => {
            const tomlPath = path.join(skillsDir, e.name, `${e.name}.toml`);
            let meta = { name: e.name };
            if (fs.existsSync(tomlPath)) {
              const toml = fs.readFileSync(tomlPath, 'utf-8');
              const desc = toml.match(/description\s*=\s*"([^"]+)"/)?.[1];
              const ver = toml.match(/version\s*=\s*"([^"]+)"/)?.[1];
              meta = { name: e.name, description: desc, version: ver };
            }
            return meta;
          });
        return { result: `${dirs.length} skills`, skills: dirs };
      }

      case 'validate': {
        if (!slugArg) return { error: 'Missing slug' };
        const skillDir = path.join(skillsDir, slugArg);
        const tomlPath = path.join(skillDir, `${slugArg}.toml`);
        const jsPath = path.join(skillDir, `${slugArg}.js`);
        const issues = [];
        if (!fs.existsSync(skillDir)) issues.push(`Directory not found: ${skillDir}`);
        if (!fs.existsSync(tomlPath)) issues.push(`Missing ${slugArg}.toml`);
        if (!fs.existsSync(jsPath)) issues.push(`Missing ${slugArg}.js`);
        if (fs.existsSync(jsPath)) {
          try {
            const mod = require(jsPath);
            if (!mod.main) issues.push('JavaScript does not export { main }');
          } catch (e) { issues.push(`JS parse error: ${e.message}`); }
        }
        return { valid: issues.length === 0, slug: slugArg, issues };
      }

      default:
        return { error: `Unknown action: ${action}. Use: scaffold, list, validate` };
    }
  } catch (err) {
    console.error('[skill-creator]', err.message);
    return { error: err.message };
  }
}
