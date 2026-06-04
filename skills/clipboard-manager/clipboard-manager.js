// Clipboard Manager — Read, write, and manage clipboard on all platforms
// Usage: { action: "read"|"write"|"clear", text }

module.exports = { main };

const { execSync, spawnSync } = require('child_process');

function readClipboard() {
  const platform = process.platform;
  if (platform === 'darwin') {
    return execSync('pbpaste', { encoding: 'utf-8' });
  } else if (platform === 'win32') {
    return execSync('powershell -command "Get-Clipboard"', { encoding: 'utf-8' });
  } else {
    // Linux: try xclip, xsel, wl-paste
    for (const cmd of ['xclip -selection clipboard -o', 'xsel --clipboard --output', 'wl-paste']) {
      try { return execSync(cmd, { encoding: 'utf-8', timeout: 5000 }); } catch { /* try next */ }
    }
    throw new Error('No clipboard tool found. Install xclip, xsel, or wl-clipboard.');
  }
}

function writeClipboard(text) {
  const platform = process.platform;
  if (platform === 'darwin') {
    const result = spawnSync('pbcopy', { input: text, encoding: 'utf-8' });
    if (result.error) throw result.error;
  } else if (platform === 'win32') {
    execSync(`powershell -command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`);
  } else {
    for (const [cmd, args] of [
      ['xclip', ['-selection', 'clipboard']],
      ['xsel', ['--clipboard', '--input']],
      ['wl-copy', []],
    ]) {
      try {
        const result = spawnSync(cmd, args, { input: text, encoding: 'utf-8' });
        if (!result.error) return;
      } catch { /* try next */ }
    }
    throw new Error('No clipboard tool found. Install xclip, xsel, or wl-clipboard.');
  }
}

async function main(args) {
  const { action, text } = args || {};

  try {
    switch (action) {
      case 'read': {
        const content = readClipboard();
        return {
          result: 'Clipboard read',
          content,
          length: content.length,
          preview: content.slice(0, 200),
        };
      }

      case 'write': {
        if (text === undefined) return { error: 'Missing text' };
        writeClipboard(String(text));
        return { result: 'Clipboard written', length: String(text).length };
      }

      case 'clear': {
        writeClipboard('');
        return { result: 'Clipboard cleared' };
      }

      case 'info': {
        const content = readClipboard();
        return {
          result: 'Clipboard info',
          length: content.length,
          lines: content.split('\n').length,
          hasUrl: /https?:\/\/\S+/.test(content),
          hasEmail: /\b[\w.+-]+@[\w-]+\.\w+\b/.test(content),
          preview: content.slice(0, 100),
        };
      }

      default:
        return { error: `Unknown action: ${action}. Use: read, write, clear, info` };
    }
  } catch (err) {
    console.error('[clipboard-manager]', err.message);
    return { error: err.message };
  }
}
