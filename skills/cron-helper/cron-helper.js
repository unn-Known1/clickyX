// Cron Helper — Create, list, and explain cron jobs
// Usage: { action: "list"|"add"|"remove"|"explain"|"validate", expression, command, ... }

module.exports = { main };

const { execSync } = require('child_process');
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

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }); } catch (e) { return e.stdout || ''; }
}

// Maps cron fields to human-readable descriptions
function parseCronExpression(expr) {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return null;
  const [min, hour, dom, month, dow] = parts;
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dowNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const desc = {
    minute: min === '*' ? 'every minute' : `at minute ${min}`,
    hour: hour === '*' ? 'every hour' : `hour ${hour}`,
    dayOfMonth: dom === '*' ? 'every day' : `day ${dom}`,
    month: month === '*' ? 'every month' : `in ${monthNames[parseInt(month) - 1] || month}`,
    dayOfWeek: dow === '*' ? 'every weekday' : `on ${dow.split(',').map((d) => dowNames[parseInt(d)] || d).join(', ')}`,
  };
  return desc;
}

async function main(args) {
  const { action, expression, command, user } = args || {};

  if (process.platform === 'win32') {
    return { error: 'Cron is not available on Windows. Use Task Scheduler instead.' };
  }

  try {
    switch (action) {
      case 'list': {
        const userCron = run(`crontab -l 2>/dev/null`);
        const sysCron = run(`ls /etc/cron.d/ 2>/dev/null`);
        const entries = userCron.split('\n').filter((l) => l.trim() && !l.startsWith('#'));
        return {
          result: `${entries.length} user cron job(s)`,
          userCrontab: entries,
          systemCronDirs: sysCron.split('\n').filter(Boolean),
        };
      }

      case 'add': {
        if (!expression || !command) return { error: 'Missing expression or command' };
        const current = run('crontab -l 2>/dev/null');
        const newEntry = `${expression} ${command}`;
        const updated = (current.trim() ? current.trimEnd() + '\n' : '') + newEntry + '\n';
        execSync(`echo "${updated.replace(/"/g, '\\"')}" | crontab -`, { timeout: 5000 });
        return { result: 'Cron job added', entry: newEntry };
      }

      case 'remove': {
        if (!command) return { error: 'Missing command to remove' };
        const current = run('crontab -l 2>/dev/null');
        const filtered = current.split('\n').filter((l) => !l.includes(command)).join('\n');
        execSync(`echo "${filtered.replace(/"/g, '\\"')}" | crontab -`, { timeout: 5000 });
        return { result: 'Cron job removed', removed: command };
      }

      case 'validate': {
        if (!expression) return { error: 'Missing expression' };
        const parsed = parseCronExpression(expression);
        if (!parsed) return { valid: false, error: 'Invalid cron expression (needs 5 fields)' };
        return { valid: true, expression, parsed };
      }

      case 'explain': {
        if (!expression) return { error: 'Missing expression' };
        const parsed = parseCronExpression(expression);
        if (!parsed) return { error: 'Invalid expression' };
        try {
          const resp = await bridgeRequest({
            messages: [
              { role: 'system', content: 'You are a cron expression expert. Explain the given cron expression in simple English.' },
              { role: 'user', content: `Explain this cron expression: "${expression}"` },
            ],
            stream: false,
          });
          return { expression, parsed, explanation: resp?.content || resp?.raw || `Runs ${parsed.minute}, ${parsed.hour}, ${parsed.dayOfMonth}, ${parsed.month}, ${parsed.dayOfWeek}` };
        } catch {
          return { expression, parsed, explanation: `Runs ${parsed.minute}, ${parsed.hour}, ${parsed.dayOfMonth}, ${parsed.month}, ${parsed.dayOfWeek}` };
        }
      }

      default:
        return { error: `Unknown action: ${action}. Use: list, add, remove, validate, explain` };
    }
  } catch (err) {
    console.error('[cron-helper]', err.message);
    return { error: err.message };
  }
}
