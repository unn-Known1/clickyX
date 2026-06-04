// Docker Manager — List, start, stop, inspect containers and images
// Usage: { action: "ps"|"start"|"stop"|"inspect"|"images"|"logs"|"rm", container, ... }

module.exports = { main };

const { execSync } = require('child_process');

function docker(cmd, opts = {}) {
  try {
    return execSync(`docker ${cmd}`, { encoding: 'utf-8', timeout: 30000, ...opts });
  } catch (e) {
    throw new Error(e.stderr || e.message);
  }
}

async function main(args) {
  const { action, container, image, lines = 50, format = 'table', all = false } = args || {};

  // Check docker availability
  try {
    docker('info --format "{{.ServerVersion}}"');
  } catch {
    return { error: 'Docker is not running or not installed.' };
  }

  try {
    switch (action) {
      case 'ps': {
        const flag = all ? '-a' : '';
        const out = docker(`ps ${flag} --format "{{json .}}"`);
        const containers = out.trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
        return { result: `${containers.length} container(s)`, containers };
      }

      case 'start': {
        if (!container) return { error: 'Missing container name/id' };
        docker(`start ${container}`);
        return { result: 'Container started', container };
      }

      case 'stop': {
        if (!container) return { error: 'Missing container name/id' };
        docker(`stop ${container}`);
        return { result: 'Container stopped', container };
      }

      case 'restart': {
        if (!container) return { error: 'Missing container' };
        docker(`restart ${container}`);
        return { result: 'Container restarted', container };
      }

      case 'rm': {
        if (!container) return { error: 'Missing container' };
        docker(`rm -f ${container}`);
        return { result: 'Container removed', container };
      }

      case 'inspect': {
        if (!container) return { error: 'Missing container name/id' };
        const out = docker(`inspect ${container}`);
        const data = JSON.parse(out);
        const c = data[0];
        return {
          result: 'Container inspected',
          id: c.Id?.slice(0, 12),
          name: c.Name,
          image: c.Config?.Image,
          state: c.State,
          ports: c.HostConfig?.PortBindings,
          env: c.Config?.Env,
          mounts: c.Mounts?.map((m) => ({ source: m.Source, destination: m.Destination })),
        };
      }

      case 'logs': {
        if (!container) return { error: 'Missing container' };
        const out = docker(`logs --tail ${lines} ${container}`);
        return { result: 'Logs fetched', container, logs: out };
      }

      case 'images': {
        const out = docker('images --format "{{json .}}"');
        const images = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
        return { result: `${images.length} image(s)`, images };
      }

      case 'pull': {
        if (!image) return { error: 'Missing image' };
        const out = docker(`pull ${image}`);
        return { result: 'Image pulled', image, output: out.trim() };
      }

      case 'stats': {
        const out = docker('stats --no-stream --format "{{json .}}"');
        const stats = out.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
        return { result: `Stats for ${stats.length} container(s)`, stats };
      }

      default:
        return { error: `Unknown action: ${action}. Use: ps, start, stop, restart, rm, inspect, logs, images, pull, stats` };
    }
  } catch (err) {
    console.error('[docker-manager]', err.message);
    return { error: err.message };
  }
}
