// Skill Installer — Install skills from URLs, GitHub repos, or local paths
// Usage: { action: "install"|"uninstall"|"update", source, slug }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findSkillsDir() {
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = path.join(dir, 'skills');
    if (fs.existsSync(candidate)) return candidate;
    dir = path.dirname(dir);
  }
  return path.join(process.cwd(), 'skills');
}

async function downloadFile(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  return res.text();
}

async function installFromGitHub(repoPath, skillsDir) {
  // repoPath: "owner/repo" or "owner/repo/subdir"
  const parts = repoPath.split('/');
  const owner = parts[0];
  const repo = parts[1];
  const subdir = parts.slice(2).join('/') || '';

  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${subdir}`;
  const res = await fetch(apiUrl, { headers: { 'Accept': 'application/vnd.github.v3+json' } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: Cannot find repo ${repoPath}`);
  const files = await res.json();

  if (!Array.isArray(files)) throw new Error(`Expected directory listing from GitHub`);

  const tomlFile = files.find((f) => f.name.endsWith('.toml'));
  const jsFile = files.find((f) => f.name.endsWith('.js'));
  if (!tomlFile || !jsFile) throw new Error('No .toml or .js skill files found in the repo directory');

  const slug = tomlFile.name.replace('.toml', '');
  const skillDir = path.join(skillsDir, slug);
  fs.mkdirSync(skillDir, { recursive: true });

  const tomlContent = await downloadFile(tomlFile.download_url);
  const jsContent = await downloadFile(jsFile.download_url);
  fs.writeFileSync(path.join(skillDir, tomlFile.name), tomlContent, 'utf-8');
  fs.writeFileSync(path.join(skillDir, jsFile.name), jsContent, 'utf-8');
  return slug;
}

async function main(args) {
  const { action, source, slug } = args || {};
  const skillsDir = findSkillsDir();

  try {
    switch (action) {
      case 'install': {
        if (!source) return { error: 'Missing source (URL, GitHub path, or local path)' };

        // Local directory
        if (fs.existsSync(source)) {
          const entries = fs.readdirSync(source);
          const toml = entries.find((f) => f.endsWith('.toml'));
          const js = entries.find((f) => f.endsWith('.js'));
          if (!toml || !js) return { error: 'Source directory must contain .toml and .js files' };
          const skillSlug = toml.replace('.toml', '');
          const dest = path.join(skillsDir, skillSlug);
          fs.mkdirSync(dest, { recursive: true });
          fs.copyFileSync(path.join(source, toml), path.join(dest, toml));
          fs.copyFileSync(path.join(source, js), path.join(dest, js));
          return { result: 'Skill installed from local path', slug: skillSlug, path: dest };
        }

        // GitHub: owner/repo or owner/repo/subdir
        if (source.match(/^[\w-]+\/[\w.-]+/)) {
          const installed = await installFromGitHub(source, skillsDir);
          return { result: 'Skill installed from GitHub', slug: installed, path: path.join(skillsDir, installed) };
        }

        // URL: download directly
        if (source.startsWith('http')) {
          const content = await downloadFile(source);
          const fileName = source.split('/').pop();
          const skillSlug = slug || fileName.replace('.js', '').replace('.toml', '');
          const skillDir = path.join(skillsDir, skillSlug);
          fs.mkdirSync(skillDir, { recursive: true });
          fs.writeFileSync(path.join(skillDir, fileName), content, 'utf-8');
          return { result: 'Skill file downloaded', slug: skillSlug, file: fileName, note: 'You may need to manually create the .toml file' };
        }

        return { error: 'Unrecognized source format. Use a local path, GitHub path (owner/repo), or URL.' };
      }

      case 'uninstall': {
        if (!slug) return { error: 'Missing slug' };
        const skillDir = path.join(skillsDir, slug);
        if (!fs.existsSync(skillDir)) return { error: `Skill "${slug}" not found` };
        fs.rmSync(skillDir, { recursive: true, force: true });
        return { result: `Skill "${slug}" uninstalled` };
      }

      case 'list': {
        const dirs = fs.readdirSync(skillsDir, { withFileTypes: true })
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
        return { result: `${dirs.length} installed skills`, skills: dirs };
      }

      default:
        return { error: `Unknown action: ${action}. Use: install, uninstall, list` };
    }
  } catch (err) {
    console.error('[skill-installer]', err.message);
    return { error: err.message };
  }
}
