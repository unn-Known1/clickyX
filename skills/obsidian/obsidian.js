// Obsidian — Read and write Obsidian vault files on local filesystem
// Usage: { action: "read"|"write"|"search"|"list"|"create", vaultPath, noteName, content, query }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const os = require('os');

function defaultVaultPath() {
  // Common default locations
  const home = os.homedir();
  const candidates = [
    path.join(home, 'Documents', 'Obsidian Vault'),
    path.join(home, 'Obsidian'),
    path.join(home, 'vault'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.join(home, 'Documents', 'Obsidian Vault');
}

function resolveNote(vaultPath, noteName) {
  let p = path.join(vaultPath, noteName);
  if (!p.endsWith('.md')) p += '.md';
  return p;
}

function searchInFile(filePath, query) {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    if (content.toLowerCase().includes(query.toLowerCase())) {
      const lines = content.split('\n');
      const matches = lines.filter((l) => l.toLowerCase().includes(query.toLowerCase()));
      return matches.slice(0, 3);
    }
  } catch { /* skip */ }
  return null;
}

function walkDir(dir, ext = '.md') {
  const results = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results.push(...walkDir(full, ext));
      else if (entry.name.endsWith(ext)) results.push(full);
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

async function main(args) {
  const { action, vaultPath: vaultArg, noteName, content, query, tags } = args || {};
  const vaultPath = vaultArg || process.env.OBSIDIAN_VAULT || defaultVaultPath();

  if (!fs.existsSync(vaultPath)) {
    return { error: `Vault not found at: ${vaultPath}. Set OBSIDIAN_VAULT env var or pass vaultPath.` };
  }

  try {
    switch (action) {
      case 'list': {
        const files = walkDir(vaultPath);
        return {
          result: `${files.length} notes in vault`,
          notes: files.map((f) => path.relative(vaultPath, f)),
        };
      }

      case 'read': {
        if (!noteName) return { error: 'Missing noteName' };
        const filePath = resolveNote(vaultPath, noteName);
        if (!fs.existsSync(filePath)) return { error: `Note not found: ${filePath}` };
        const text = fs.readFileSync(filePath, 'utf-8');
        // Parse frontmatter
        const fmMatch = text.match(/^---\n([\s\S]*?)\n---\n/);
        const frontmatter = fmMatch ? fmMatch[1] : null;
        const body = fmMatch ? text.slice(fmMatch[0].length) : text;
        return { result: 'Note read', name: noteName, frontmatter, body, length: text.length };
      }

      case 'write': {
        if (!noteName || content === undefined) return { error: 'Missing noteName or content' };
        const filePath = resolveNote(vaultPath, noteName);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, 'utf-8');
        return { result: 'Note written', name: noteName, path: filePath, size: content.length };
      }

      case 'create': {
        if (!noteName) return { error: 'Missing noteName' };
        const filePath = resolveNote(vaultPath, noteName);
        if (fs.existsSync(filePath)) return { error: `Note already exists: ${noteName}` };
        const tagBlock = tags?.length ? `---\ntags: [${tags.join(', ')}]\n---\n\n` : '';
        const text = tagBlock + (content || `# ${noteName}\n\n`);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, text, 'utf-8');
        return { result: 'Note created', name: noteName, path: filePath };
      }

      case 'append': {
        if (!noteName || !content) return { error: 'Missing noteName or content' };
        const filePath = resolveNote(vaultPath, noteName);
        if (!fs.existsSync(filePath)) return { error: `Note not found: ${noteName}` };
        fs.appendFileSync(filePath, '\n' + content, 'utf-8');
        return { result: 'Content appended', noteName };
      }

      case 'search': {
        if (!query) return { error: 'Missing query' };
        const files = walkDir(vaultPath);
        const results = [];
        for (const f of files) {
          const matches = searchInFile(f, query);
          if (matches) {
            results.push({ note: path.relative(vaultPath, f), matches });
          }
          if (results.length >= 20) break;
        }
        return { result: `${results.length} notes match "${query}"`, results };
      }

      default:
        return { error: `Unknown action: ${action}. Use: list, read, write, create, append, search` };
    }
  } catch (err) {
    console.error('[obsidian]', err.message);
    return { error: err.message };
  }
}
