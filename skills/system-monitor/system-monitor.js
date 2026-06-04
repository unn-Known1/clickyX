// System Monitor — CPU, memory, disk, and process monitoring
// Usage: { action: "cpu"|"memory"|"disk"|"processes"|"all", count }

module.exports = { main };

const { execSync } = require('child_process');
const os = require('os');

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 10000 }).trim(); } catch { return ''; }
}

function getCpuUsage() {
  const cpus = os.cpus();
  const total = cpus.reduce((sum, c) => {
    const times = c.times;
    return sum + times.user + times.nice + times.sys + times.idle + times.irq;
  }, 0);
  const idle = cpus.reduce((s, c) => s + c.times.idle, 0);
  const used = ((total - idle) / total * 100).toFixed(1);
  return { cores: cpus.length, model: cpus[0]?.model, usagePercent: parseFloat(used) };
}

function getMemory() {
  const total = os.totalmem();
  const free = os.freemem();
  const used = total - free;
  return {
    totalMB: Math.round(total / 1024 / 1024),
    usedMB: Math.round(used / 1024 / 1024),
    freeMB: Math.round(free / 1024 / 1024),
    usagePercent: parseFloat((used / total * 100).toFixed(1)),
  };
}

function getDisk() {
  if (process.platform === 'win32') {
    const out = run('wmic logicaldisk get size,freespace,caption');
    const lines = out.split('\n').slice(1).filter(Boolean);
    return lines.map((l) => {
      const parts = l.trim().split(/\s+/);
      if (parts.length < 3) return null;
      const [caption, free, size] = parts;
      return { mount: caption, totalGB: (parseInt(size) / 1e9).toFixed(1), freeGB: (parseInt(free) / 1e9).toFixed(1) };
    }).filter(Boolean);
  }
  const out = run("df -h -x tmpfs -x devtmpfs 2>/dev/null || df -h");
  const lines = out.split('\n').slice(1).filter(Boolean);
  return lines.map((l) => {
    const parts = l.trim().split(/\s+/);
    return parts.length >= 6 ? { fs: parts[0], size: parts[1], used: parts[2], avail: parts[3], use: parts[4], mount: parts[5] } : null;
  }).filter(Boolean);
}

function getProcesses(count = 15) {
  if (process.platform === 'win32') {
    const out = run(`wmic process get Caption,WorkingSetSize,ProcessId /format:csv`);
    const lines = out.split('\n').slice(2).filter(Boolean);
    return lines.slice(0, count).map((l) => {
      const [, caption, pid, mem] = l.split(',');
      return { name: caption?.trim(), pid: pid?.trim(), memKB: Math.round(parseInt(mem || 0) / 1024) };
    });
  }
  const out = run(`ps aux --sort=-%mem 2>/dev/null | head -${count + 1} || ps aux | head -${count + 1}`);
  const lines = out.split('\n').slice(1).filter(Boolean);
  return lines.map((l) => {
    const parts = l.trim().split(/\s+/);
    return { user: parts[0], pid: parts[1], cpu: parts[2], mem: parts[3], command: parts.slice(10).join(' ').slice(0, 60) };
  });
}

async function main(args) {
  const { action = 'all', count = 15 } = args || {};

  try {
    switch (action) {
      case 'cpu': return { result: 'CPU info', cpu: getCpuUsage(), loadAvg: os.loadavg(), uptime: Math.round(os.uptime()) + 's' };
      case 'memory': return { result: 'Memory info', memory: getMemory() };
      case 'disk': return { result: 'Disk info', disks: getDisk() };
      case 'processes': return { result: `Top ${count} processes`, processes: getProcesses(count) };
      case 'all': {
        return {
          result: 'System snapshot',
          platform: process.platform,
          hostname: os.hostname(),
          uptime: Math.round(os.uptime()) + 's',
          cpu: getCpuUsage(),
          memory: getMemory(),
          disks: getDisk(),
          topProcesses: getProcesses(10),
        };
      }
      default:
        return { error: `Unknown action: ${action}. Use: cpu, memory, disk, processes, all` };
    }
  } catch (err) {
    console.error('[system-monitor]', err.message);
    return { error: err.message };
  }
}
