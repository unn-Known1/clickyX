// Agent Builder — Guide users in building custom ClickyX agents
// Usage: { action: "design"|"scaffold"|"explain"|"list-skills", ...params }

module.exports = { main };

const fs = require('fs');
const path = require('path');
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

function findSkillsDir() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const c = path.join(dir, 'skills');
    if (fs.existsSync(c)) return c;
    dir = path.dirname(dir);
  }
  return null;
}

async function main(args) {
  const { action, name, goal, skills: skillList, description } = args || {};

  try {
    switch (action) {
      case 'list-skills': {
        const skillsDir = findSkillsDir();
        if (!skillsDir) return { error: 'Skills directory not found' };
        const dirs = fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory());
        const skills = dirs.map((d) => {
          const toml = path.join(skillsDir, d.name, `${d.name}.toml`);
          if (!fs.existsSync(toml)) return null;
          const content = fs.readFileSync(toml, 'utf-8');
          const desc = content.match(/description\s*=\s*"([^"]+)"/)?.[1] || '';
          return { name: d.name, description: desc };
        }).filter(Boolean);
        return { result: `${skills.length} available skills`, skills };
      }

      case 'design': {
        if (!goal) return { error: 'Missing goal for agent design' };
        const skillsDir = findSkillsDir();
        const availableSkills = skillsDir
          ? fs.readdirSync(skillsDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
          : [];

        try {
          const resp = await bridgeRequest({
            messages: [
              {
                role: 'system',
                content: `You are an expert at designing AI agents. Given a goal, you recommend:
1. Agent name and slug
2. Which skills to enable (from the available list)
3. A system prompt for the agent
4. Expected capabilities
Output as JSON: { name, slug, skills, systemPrompt, capabilities }`,
              },
              {
                role: 'user',
                content: `Design an agent for: ${goal}\n\nAvailable skills: ${availableSkills.join(', ')}`,
              },
            ],
            stream: false,
          });
          const content = resp?.content || resp?.raw || '';
          const jsonMatch = content.match(/\{[\s\S]+\}/);
          const design = jsonMatch ? JSON.parse(jsonMatch[0]) : { name: 'Custom Agent', slug: 'custom-agent', skills: [], systemPrompt: content };
          return { result: 'Agent designed', design, availableSkills };
        } catch (e) {
          return {
            result: 'Design suggestion (AI unavailable)',
            design: { name: name || 'My Agent', slug: 'my-agent', skills: skillList || [], systemPrompt: `You are an AI agent. Your goal: ${goal}` },
          };
        }
      }

      case 'scaffold': {
        if (!name) return { error: 'Missing agent name' };
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
        return {
          result: 'Agent configuration',
          agentConfig: {
            name,
            slug,
            skills: skillList || [],
            systemPrompt: description || `You are ${name}, an AI agent that helps users accomplish tasks.`,
            instructions: [
              `1. Use the ClickyX UI to create an agent named "${name}" with slug "${slug}"`,
              `2. Enable the suggested skills: ${(skillList || []).join(', ')}`,
              `3. Set the initial prompt: "${description || `Help with ${name} tasks`}"`,
              `4. Click "Run" and provide your task`,
            ],
          },
        };
      }

      case 'explain': {
        const topic = description || name || 'ClickyX agents';
        try {
          const resp = await bridgeRequest({
            messages: [
              { role: 'system', content: 'You are a ClickyX expert. Explain how agents work in ClickyX clearly and concisely.' },
              { role: 'user', content: `Explain: ${topic}` },
            ],
            stream: false,
          });
          return { result: 'Explanation', explanation: resp?.content || resp?.raw };
        } catch {
          return {
            result: 'Explanation',
            explanation: 'ClickyX agents are AI-powered workers that combine skills to accomplish tasks. Each agent has: a name/slug identifier, a set of enabled skills (tools), an optional system prompt, and can be run with custom prompts. Agents use the Codex runtime to execute skill chains autonomously.',
          };
        }
      }

      default:
        return { error: `Unknown action: ${action}. Use: list-skills, design, scaffold, explain` };
    }
  } catch (err) {
    console.error('[agent-builder]', err.message);
    return { error: err.message };
  }
}
