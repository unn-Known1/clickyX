// Document Formatter — Format markdown and convert between text formats
// Usage: { action: "format"|"toc"|"lint"|"convert", text, filePath, fromFormat, toFormat }

module.exports = { main };

const fs = require('fs');
const { execSync } = require('child_process');

function fixMarkdown(text) {
  let fixed = text;
  // Normalize heading spacing
  fixed = fixed.replace(/^(#{1,6})([^#\s])/gm, '$1 $2');
  // Normalize list items
  fixed = fixed.replace(/^(\s*)[-*+]([^\s])/gm, '$1- $2');
  // Trim trailing whitespace
  fixed = fixed.replace(/[ \t]+$/gm, '');
  // Ensure single blank line between paragraphs (not more than 2)
  fixed = fixed.replace(/\n{3,}/g, '\n\n');
  // Ensure blank line before and after headings
  fixed = fixed.replace(/([^\n])\n(#{1,6} )/g, '$1\n\n$2');
  fixed = fixed.replace(/(#{1,6} .+)\n([^\n#])/g, '$1\n\n$2');
  return fixed.trim() + '\n';
}

function generateTOC(text) {
  const headings = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const title = match[2];
      const anchor = title.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      headings.push({ level, title, anchor });
    }
  }
  const toc = headings.map((h) => `${'  '.repeat(h.level - 1)}- [${h.title}](#${h.anchor})`).join('\n');
  return `## Table of Contents\n\n${toc}\n`;
}

function lintMarkdown(text) {
  const issues = [];
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.length > 120) issues.push({ line: i + 1, issue: `Line too long (${line.length} chars)`, severity: 'warning' });
    if (/\t/.test(line)) issues.push({ line: i + 1, issue: 'Use spaces instead of tabs', severity: 'warning' });
    if (/ $/.test(line)) issues.push({ line: i + 1, issue: 'Trailing whitespace', severity: 'info' });
    if (/^#{1,6}[^#\s]/.test(line)) issues.push({ line: i + 1, issue: 'Missing space after #', severity: 'error' });
  }
  return issues;
}

async function main(args) {
  const { action, text: textInput, filePath, fromFormat, toFormat } = args || {};

  let text = textInput;
  if (!text && filePath && fs.existsSync(filePath)) {
    text = fs.readFileSync(filePath, 'utf-8');
  }

  try {
    switch (action) {
      case 'format': {
        if (!text) return { error: 'Missing text or filePath' };
        const formatted = fixMarkdown(text);
        if (filePath) fs.writeFileSync(filePath, formatted, 'utf-8');
        return { result: 'Document formatted', formatted, savedTo: filePath || null };
      }

      case 'toc': {
        if (!text) return { error: 'Missing text or filePath' };
        const toc = generateTOC(text);
        const withToc = text.replace(/^(# .+\n)/, `$1\n${toc}\n`);
        if (filePath) fs.writeFileSync(filePath, withToc, 'utf-8');
        return { result: 'TOC generated', toc, fullDocument: withToc };
      }

      case 'lint': {
        if (!text) return { error: 'Missing text or filePath' };
        const issues = lintMarkdown(text);
        const errorCount = issues.filter((i) => i.severity === 'error').length;
        return { result: `${issues.length} issues found`, errors: errorCount, issues };
      }

      case 'convert': {
        if (!text) return { error: 'Missing text or filePath' };
        // Try pandoc if available
        try {
          const from = fromFormat || 'markdown';
          const to = toFormat || 'html';
          const input = text;
          const tmpIn = `/tmp/doc_${Date.now()}.${from}`;
          fs.writeFileSync(tmpIn, input, 'utf-8');
          const output = execSync(`pandoc -f ${from} -t ${to} "${tmpIn}"`, { encoding: 'utf-8', timeout: 15000 });
          fs.unlinkSync(tmpIn);
          return { result: `Converted ${from} → ${to}`, output };
        } catch {
          // Fallback: basic markdown → HTML
          if ((fromFormat || 'markdown') === 'markdown' && toFormat === 'html') {
            const html = text
              .replace(/^# (.+)$/gm, '<h1>$1</h1>')
              .replace(/^## (.+)$/gm, '<h2>$1</h2>')
              .replace(/^### (.+)$/gm, '<h3>$1</h3>')
              .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
              .replace(/\*(.+?)\*/g, '<em>$1</em>')
              .replace(/`(.+?)`/g, '<code>$1</code>')
              .replace(/\n\n/g, '</p><p>')
              .replace(/^- (.+)$/gm, '<li>$1</li>');
            return { result: 'Converted markdown → HTML (basic)', output: `<p>${html}</p>` };
          }
          return { error: 'pandoc not available and format not supported for basic conversion' };
        }
      }

      case 'wordcount': {
        if (!text) return { error: 'Missing text or filePath' };
        const stripped = text.replace(/```[\s\S]*?```/g, '').replace(/[#*_`~\[\]()]/g, '');
        const words = stripped.match(/\b\w+\b/g) || [];
        const headings = (text.match(/^#{1,6} .+$/gm) || []).length;
        return { result: 'Word count', words: words.length, characters: text.length, headings, paragraphs: text.split(/\n\n+/).length };
      }

      default:
        return { error: `Unknown action: ${action}. Use: format, toc, lint, convert, wordcount` };
    }
  } catch (err) {
    console.error('[document-formatter]', err.message);
    return { error: err.message };
  }
}
