/**
 * Example Skill Template
 *
 * Skills are Node.js modules that export a `main` async function.
 * The `args` parameter receives arguments from the Codex runtime.
 * Skills communicate with the ClickyX bridge at http://127.0.0.1:32123.
 *
 * To create a new skill:
 * 1. Copy this directory: cp -r skills/skill-template skills/my-new-skill
 * 2. Rename both files: my-new-skill.toml and my-new-skill.js
 * 3. Edit the .toml with your skill metadata
 * 4. Implement your logic in the .js file
 */
async function main(args) {
  // args contains the parameters passed from Codex
  const { input } = args || {};

  // Use the bridge API to interact with the app
  const http = require('http');

  const body = JSON.stringify({ text: `Processed: ${input || 'nothing'}`, x: 0, y: 0 });

  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: '127.0.0.1',
      port: 32123,
      path: '/caption',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ raw: data }); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = { main };
