const http = require('http');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let codexProcess = null;

function findCodexBinary() {
  const candidates = [
    path.join(__dirname, '..', 'bin', 'codex'),
    path.join(__dirname, '..', '..', 'bin', 'codex'),
    '/usr/local/bin/codex',
    process.env.CODEX_PATH,
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return 'codex';
}

async function callBridge(endpoint, data) {
  const body = JSON.stringify(data);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 32123,
      path: endpoint,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let responseData = '';
      res.on('data', (chunk) => responseData += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(responseData)); }
        catch { resolve({ raw: responseData }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main(args) {
  const action = args?.action || 'status';

  switch (action) {
    case 'start': {
      if (codexProcess) {
        return { status: 'already_running', pid: codexProcess.pid };
      }
      const binary = findCodexBinary();
      codexProcess = spawn(binary, [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, CODEX_HOME: process.env.CODEX_HOME || path.join(process.env.HOME || '/tmp', '.codex') },
      });
      return new Promise((resolve) => {
        codexProcess.on('spawn', () => resolve({ status: 'started', pid: codexProcess.pid }));
        codexProcess.on('error', (err) => {
          codexProcess = null;
          resolve({ status: 'error', error: err.message });
        });
      });
    }
    case 'stop': {
      if (!codexProcess) {
        return { status: 'not_running' };
      }
      codexProcess.kill();
      codexProcess = null;
      return { status: 'stopped' };
    }
    case 'status': {
      return {
        running: codexProcess !== null,
        pid: codexProcess?.pid || null,
      };
    }
    case 'agent_create': {
      return callBridge('/agent/create', args);
    }
    case 'agent_run': {
      return callBridge(`/agent/${args.slug}/run`, { prompt: args.prompt || '' });
    }
    default:
      return { status: 'unknown_action', action };
  }
}

module.exports = { main };
