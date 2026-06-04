// Process Manager — List, kill, and manage system processes
// Usage: { action: "list"|"kill"|"find"|"top"|"info", pid, name, signal }

module.exports = { main };

const { execSync } = require('child_process');

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim(); } catch (e) { return e.stdout || ''; }
}

function parseProcesses(limit = 30) {
  if (process.platform === 'win32') {
    const out = run('wmic process get ProcessId,Name,WorkingSetSize,CommandLine /format:csv');
    return out.split('\n').slice(2).filter(Boolean).slice(0, limit).map((l) => {
      const [, cmd, name, pid, mem] = l.split(',');
      return { pid: pid?.trim(), name: name?.trim(), memKB: Math.round(parseInt(mem || 0) / 1024), cmd: cmd?.trim().slice(0, 80) };
    });
  }
  const out = run(`ps aux --sort=-%cpu 2>/dev/null | head -${limit + 1} || ps aux | head -${limit + 1}`);
  return out.split('\n').slice(1).filter(Boolean).map((l) => {
    const p = l.trim().split(/\s+/);
    return { user: p[0], pid: p[1], cpu: p[2], mem: p[3], vsz: p[4], rss: p[5], stat: p[7], command: p.slice(10).join(' ').slice(0, 80) };
  });
}

async function main(args) {
  const { action, pid, name, signal = 'TERM', limit = 20 } = args || {};

  try {
    switch (action) {
      case 'list':
      case 'top': {
        const processes = parseProcesses(limit);
        return { result: `${processes.length} processes`, processes };
      }

      case 'find': {
        if (!name) return { error: 'Missing name to search' };
        if (process.platform === 'win32') {
          const out = run(`wmic process where "name like '%${name}%'" get ProcessId,Name,CommandLine /format:csv`);
          const procs = out.split('\n').slice(2).filter(Boolean).map((l) => {
            const [, cmd, n, p] = l.split(',');
            return { pid: p?.trim(), name: n?.trim(), cmd: cmd?.trim() };
          }).filter((p) => p.name);
          return { result: `${procs.length} processes match "${name}"`, processes: procs };
        }
        const out = run(`pgrep -la "${name}" 2>/dev/null || ps aux | grep -i "${name}" | grep -v grep`);
        const procs = out.split('\n').filter(Boolean).map((l) => {
          const p = l.trim().split(/\s+/);
          return process.platform === 'darwin' ? { pid: p[0], command: p.slice(1).join(' ') } : { user: p[0], pid: p[1], cpu: p[2], mem: p[3], command: p.slice(10).join(' ').slice(0, 80) };
        });
        return { result: `${procs.length} processes match "${name}"`, processes: procs };
      }

      case 'kill': {
        if (!pid && !name) return { error: 'Missing pid or name' };
        if (name) {
          const cmd = process.platform === 'win32' ? `taskkill /F /IM "${name}"` : `pkill -${signal} "${name}"`;
          run(cmd);
          return { result: `Killed processes named "${name}"` };
        }
        const cmd = process.platform === 'win32' ? `taskkill /F /PID ${pid}` : `kill -${signal} ${pid}`;
        run(cmd);
        return { result: `Signal ${signal} sent to PID ${pid}` };
      }

      case 'info': {
        if (!pid) return { error: 'Missing pid' };
        if (process.platform === 'win32') {
          const out = run(`wmic process where "ProcessId=${pid}" get /format:list`);
          return { result: 'Process info', info: out };
        }
        const out = run(`ps -p ${pid} -o pid,ppid,user,%cpu,%mem,stat,etime,command 2>/dev/null`);
        return { result: 'Process info', pid, info: out };
      }

      default:
        return { error: `Unknown action: ${action}. Use: list, top, find, kill, info` };
    }
  } catch (err) {
    console.error('[process-manager]', err.message);
    return { error: err.message };
  }
}
