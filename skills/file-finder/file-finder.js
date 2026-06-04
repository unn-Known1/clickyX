// File Finder — Advanced file search with content, name, date, and size filters
// Usage: { action: "name"|"content"|"recent"|"large"|"type", root, pattern, query, days, sizeKB, ext }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

function walkDir(dir, results, opts, depth = 0) {
  if (depth > (opts.maxDepth || 10)) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }

  for (const entry of entries) {
    if (entry.name.startsWith('.') && !opts.includeHidden) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!['node_modules', '.git', '__pycache__', '.next', 'dist', 'build'].includes(entry.name)) {
        walkDir(full, results, opts, depth + 1);
      }
    } else if (entry.isFile()) {
      results.push(full);
      if (results.length > (opts.maxFiles || 50000)) return;
    }
  }
}

function matchesFilters(filePath, opts) {
  const name = path.basename(filePath);
  if (opts.pattern && !name.toLowerCase().includes(opts.pattern.toLowerCase()) &&
    !new RegExp(opts.pattern, 'i').test(name)) return false;
  if (opts.ext) {
    const exts = Array.isArray(opts.ext) ? opts.ext : [opts.ext];
    if (!exts.some((e) => name.endsWith(e.startsWith('.') ? e : '.' + e))) return false;
  }
  if (opts.days || opts.sizeKB) {
    try {
      const stat = fs.statSync(filePath);
      if (opts.days) {
        const cutoff = Date.now() - opts.days * 86400000;
        if (stat.mtimeMs < cutoff) return false;
      }
      if (opts.sizeKB) {
        if (stat.size / 1024 < opts.sizeKB) return false;
      }
    } catch { return false; }
  }
  return true;
}

async function main(args) {
  const { action, root: rootArg, pattern, query, days, sizeKB, ext, maxResults = 50 } = args || {};
  const root = rootArg || process.cwd();

  if (!fs.existsSync(root)) return { error: `Root path not found: ${root}` };

  try {
    // Try system tools first for performance
    if (action === 'name' || action === 'content') {
      if (process.platform !== 'win32') {
        if (action === 'name' && pattern) {
          const out = execSync(`find "${root}" -name "*${pattern}*" -not -path "*/node_modules/*" -not -path "*/.git/*" 2>/dev/null | head -${maxResults}`, {
            encoding: 'utf-8', timeout: 15000,
          }).trim();
          const files = out.split('\n').filter(Boolean);
          return { result: `${files.length} files found`, files };
        }
        if (action === 'content' && query) {
          const extFlag = ext ? `--include="*.${ext}"` : '';
          const out = execSync(`grep -r -l ${extFlag} "${query}" "${root}" --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null | head -${maxResults}`, {
            encoding: 'utf-8', timeout: 15000,
          }).trim();
          const files = out.split('\n').filter(Boolean);
          return {
            result: `${files.length} files contain "${query}"`,
            files,
          };
        }
      }
    }

    // Fallback: manual walk
    const allFiles = [];
    walkDir(root, allFiles, { includeHidden: false });

    switch (action) {
      case 'name': {
        const matches = allFiles.filter((f) => matchesFilters(f, { pattern, ext, days, sizeKB })).slice(0, maxResults);
        return { result: `${matches.length} files match`, files: matches.map((f) => path.relative(root, f)) };
      }

      case 'content': {
        if (!query) return { error: 'Missing query for content search' };
        const q = query.toLowerCase();
        const results = [];
        for (const f of allFiles) {
          if (!matchesFilters(f, { ext, days })) continue;
          try {
            const stat = fs.statSync(f);
            if (stat.size > 5 * 1024 * 1024) continue; // skip >5MB
            const content = fs.readFileSync(f, 'utf-8');
            if (content.toLowerCase().includes(q)) {
              const lines = content.split('\n');
              const matches = lines.filter((l) => l.toLowerCase().includes(q)).slice(0, 3);
              results.push({ file: path.relative(root, f), matches });
              if (results.length >= maxResults) break;
            }
          } catch { /* skip binary or unreadable */ }
        }
        return { result: `${results.length} files match`, results };
      }

      case 'recent': {
        const cutoff = Date.now() - (days || 7) * 86400000;
        const recent = allFiles
          .map((f) => { try { return { f, mtime: fs.statSync(f).mtimeMs }; } catch { return null; } })
          .filter((x) => x && x.mtime > cutoff)
          .sort((a, b) => b.mtime - a.mtime)
          .slice(0, maxResults)
          .map(({ f, mtime }) => ({ file: path.relative(root, f), modified: new Date(mtime).toISOString() }));
        return { result: `${recent.length} recent files`, files: recent };
      }

      case 'large': {
        const minSize = (sizeKB || 1024) * 1024;
        const large = allFiles
          .map((f) => { try { const s = fs.statSync(f); return { f, size: s.size }; } catch { return null; } })
          .filter((x) => x && x.size >= minSize)
          .sort((a, b) => b.size - a.size)
          .slice(0, maxResults)
          .map(({ f, size }) => ({ file: path.relative(root, f), sizeMB: (size / 1024 / 1024).toFixed(1) }));
        return { result: `${large.length} large files`, files: large };
      }

      case 'type': {
        if (!ext) return { error: 'Missing ext for type search' };
        const matches = allFiles.filter((f) => matchesFilters(f, { ext })).slice(0, maxResults);
        return { result: `${matches.length} .${ext} files`, files: matches.map((f) => path.relative(root, f)) };
      }

      default:
        return { error: `Unknown action: ${action}. Use: name, content, recent, large, type` };
    }
  } catch (err) {
    console.error('[file-finder]', err.message);
    return { error: err.message };
  }
}
