// Network Checker — Ping, DNS lookup, traceroute, port scan, HTTP check
// Usage: { action: "ping"|"dns"|"traceroute"|"port"|"http", host, port, ... }

module.exports = { main };

const { execSync } = require('child_process');
const net = require('net');
const dns = require('dns').promises;

function run(cmd) {
  try { return execSync(cmd, { encoding: 'utf-8', timeout: 15000 }).trim(); } catch (e) { return e.stdout || e.message; }
}

function pingHost(host, count = 4) {
  const flag = process.platform === 'win32' ? `-n ${count}` : `-c ${count}`;
  const out = run(`ping ${flag} ${host}`);
  const avgMatch = out.match(/(?:avg|Average)[^\d]*(\d+\.?\d*)/i);
  const lossMatch = out.match(/(\d+)%\s*(?:packet\s*)?loss/i);
  return { raw: out.slice(0, 500), avgMs: avgMatch ? parseFloat(avgMatch[1]) : null, lossPercent: lossMatch ? parseInt(lossMatch[1]) : null };
}

async function dnsLookup(host, type = 'A') {
  const results = {};
  const types = type === 'all' ? ['A', 'AAAA', 'MX', 'TXT', 'NS', 'CNAME'] : [type.toUpperCase()];
  for (const t of types) {
    try {
      switch (t) {
        case 'A': results.A = await dns.resolve4(host); break;
        case 'AAAA': results.AAAA = await dns.resolve6(host); break;
        case 'MX': results.MX = await dns.resolveMx(host); break;
        case 'TXT': results.TXT = (await dns.resolveTxt(host)).map((r) => r.join('')); break;
        case 'NS': results.NS = await dns.resolveNs(host); break;
        case 'CNAME': results.CNAME = await dns.resolveCname(host); break;
      }
    } catch { /* skip unsupported */ }
  }
  return results;
}

async function checkPort(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const sock = new net.Socket();
    const timer = setTimeout(() => { sock.destroy(); resolve({ open: false, reason: 'timeout' }); }, timeout);
    sock.connect(port, host, () => {
      clearTimeout(timer);
      sock.destroy();
      resolve({ open: true });
    });
    sock.on('error', (e) => { clearTimeout(timer); resolve({ open: false, reason: e.code }); });
  });
}

async function checkPorts(host, ports) {
  const results = await Promise.all(
    ports.map(async (p) => ({ port: p, ...(await checkPort(host, p)) }))
  );
  return results;
}

async function httpCheck(url) {
  const start = Date.now();
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    return {
      status: res.status,
      ok: res.ok,
      latencyMs: Date.now() - start,
      contentType: res.headers.get('content-type'),
      server: res.headers.get('server'),
      redirected: res.redirected,
      finalUrl: res.url,
    };
  } catch (e) {
    return { error: e.message, latencyMs: Date.now() - start };
  }
}

async function main(args) {
  const { action, host, port, ports, count = 4, type = 'A', url } = args || {};

  try {
    switch (action) {
      case 'ping': {
        if (!host) return { error: 'Missing host' };
        const result = pingHost(host, count);
        return { result: `Ping ${host}`, host, ...result };
      }

      case 'dns': {
        if (!host) return { error: 'Missing host' };
        const records = await dnsLookup(host, type);
        return { result: `DNS lookup for ${host}`, host, type, records };
      }

      case 'traceroute': {
        if (!host) return { error: 'Missing host' };
        const cmd = process.platform === 'win32' ? `tracert ${host}` : `traceroute -m 20 ${host} 2>&1 || tracepath ${host} 2>&1`;
        const out = run(cmd);
        return { result: `Traceroute to ${host}`, output: out.slice(0, 2000) };
      }

      case 'port': {
        if (!host) return { error: 'Missing host' };
        const portsToCheck = ports ? (Array.isArray(ports) ? ports : [ports]) : [port || 80];
        const results = await checkPorts(host, portsToCheck.map(Number));
        return { result: `Port check for ${host}`, host, ports: results };
      }

      case 'scan': {
        if (!host) return { error: 'Missing host' };
        // Common ports scan
        const commonPorts = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 6379, 8080, 8443, 27017];
        const results = await checkPorts(host, commonPorts);
        const open = results.filter((r) => r.open);
        return { result: `${open.length}/${commonPorts.length} ports open on ${host}`, open, all: results };
      }

      case 'http': {
        const target = url || (host ? `http://${host}` : null);
        if (!target) return { error: 'Missing url or host' };
        const result = await httpCheck(target);
        return { result: `HTTP check for ${target}`, url: target, ...result };
      }

      default:
        return { error: `Unknown action: ${action}. Use: ping, dns, traceroute, port, scan, http` };
    }
  } catch (err) {
    console.error('[network-checker]', err.message);
    return { error: err.message };
  }
}
