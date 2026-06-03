const { execSync } = require('child_process');

const WHITELISTED_COMMANDS = ['ls', 'pwd', 'cat', 'find', 'grep', 'head', 'tail', 'wc', 'echo'];

function isSafeCommand(command) {
  const baseCmd = command.trim().split(/\s+/)[0];
  if (!WHITELISTED_COMMANDS.includes(baseCmd)) {
    return { safe: false, reason: `Command '${baseCmd}' is not in the whitelist` };
  }
  const dangerous = /[;&|`$(){}]|(?:^|\s)(rm|sudo|chmod|chown|mkfs|dd|>|>>)(?:\s|$)/i;
  if (dangerous.test(command)) {
    return { safe: false, reason: 'Command contains disallowed operators or dangerous commands' };
  }
  return { safe: true };
}

async function main(args) {
  const { command, workingDirectory, timeout } = args || {};

  if (!command) {
    return { error: 'Missing required field: command' };
  }

  console.log(`[shell-executor] Executing: ${command}`);

  try {
    const check = isSafeCommand(command);
    if (!check.safe) {
      return { error: check.reason };
    }

    const opts = {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      timeout: timeout || 10000,
    };
    if (workingDirectory) {
      opts.cwd = workingDirectory;
    }

    const stdout = execSync(command, opts);
    console.log(`[shell-executor] Output: ${stdout.length} chars`);

    return {
      result: 'Command executed',
      command,
      stdout: stdout.trim(),
      exitCode: 0,
      workingDirectory: workingDirectory || process.cwd(),
    };
  } catch (err) {
    console.error('[shell-executor] Error:', err.message);
    return {
      error: err.message,
      command,
      stdout: err.stdout?.toString().trim() || '',
      stderr: err.stderr?.toString().trim() || '',
      exitCode: err.status || -1,
    };
  }
}

module.exports = { main };
