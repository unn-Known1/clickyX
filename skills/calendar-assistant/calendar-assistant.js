// Calendar Assistant — Read events from local .ics / ical files
// Usage: { action: "read"|"upcoming"|"search", filePath, days, query }

module.exports = { main };

const fs = require('fs');
const path = require('path');
const os = require('os');

// Minimal iCal parser (no dependencies)
function parseIcal(text) {
  const events = [];
  const lines = text.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
  let current = null;

  function parseDate(val) {
    // TZID=...:YYYYMMDDTHHmmss or VALUE=DATE:YYYYMMDD
    const raw = val.split(':').pop();
    if (!raw) return null;
    if (raw.length === 8) {
      return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`);
    }
    return new Date(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}T${raw.slice(9, 11)}:${raw.slice(11, 13)}:${raw.slice(13, 15)}Z`);
  }

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { current = {}; continue; }
    if (line === 'END:VEVENT') { if (current) events.push(current); current = null; continue; }
    if (!current) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon);
    const val = line.slice(colon + 1);
    if (key.startsWith('DTSTART')) current.start = parseDate(line);
    else if (key.startsWith('DTEND')) current.end = parseDate(line);
    else if (key === 'SUMMARY') current.summary = val;
    else if (key === 'DESCRIPTION') current.description = val.replace(/\\n/g, '\n');
    else if (key === 'LOCATION') current.location = val;
    else if (key === 'UID') current.uid = val;
  }
  return events;
}

function findIcsFiles() {
  const home = os.homedir();
  const candidates = [];
  // macOS calendar cache
  if (process.platform === 'darwin') {
    const calDir = path.join(home, 'Library', 'Calendars');
    if (fs.existsSync(calDir)) {
      walkForIcs(calDir, candidates, 3);
    }
  }
  // Common locations
  const common = [
    path.join(home, 'Documents'),
    path.join(home, 'Downloads'),
    home,
  ];
  for (const dir of common) {
    if (fs.existsSync(dir)) walkForIcs(dir, candidates, 2);
  }
  return [...new Set(candidates)];
}

function walkForIcs(dir, results, depth) {
  if (depth <= 0) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.')) walkForIcs(full, results, depth - 1);
      else if (entry.name.endsWith('.ics') || entry.name.endsWith('.ical')) results.push(full);
    }
  } catch { /* skip */ }
}

async function main(args) {
  const { action, filePath, days = 7, query } = args || {};

  try {
    // Gather ics files
    const files = filePath ? [filePath] : findIcsFiles();
    if (files.length === 0) return { error: 'No .ics files found. Provide filePath or place .ics files in ~/Documents.' };

    let allEvents = [];
    for (const f of files) {
      try {
        const text = fs.readFileSync(f, 'utf-8');
        const events = parseIcal(text);
        allEvents.push(...events.map((e) => ({ ...e, source: path.basename(f) })));
      } catch { /* skip invalid */ }
    }

    const now = new Date();
    const future = new Date(now.getTime() + days * 86400000);

    switch (action) {
      case 'upcoming':
      case 'read': {
        const upcoming = allEvents
          .filter((e) => e.start && e.start >= now && e.start <= future)
          .sort((a, b) => a.start - b.start);
        return {
          result: `${upcoming.length} upcoming event(s) in next ${days} days`,
          events: upcoming.map((e) => ({
            summary: e.summary,
            start: e.start?.toISOString(),
            end: e.end?.toISOString(),
            location: e.location,
            description: e.description?.slice(0, 200),
            source: e.source,
          })),
        };
      }

      case 'search': {
        if (!query) return { error: 'Missing query' };
        const q = query.toLowerCase();
        const results = allEvents.filter((e) =>
          e.summary?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.location?.toLowerCase().includes(q)
        ).slice(0, 20);
        return {
          result: `${results.length} matching event(s)`,
          events: results.map((e) => ({ summary: e.summary, start: e.start?.toISOString(), location: e.location, source: e.source })),
        };
      }

      default:
        return { error: `Unknown action: ${action}. Use: upcoming, read, search` };
    }
  } catch (err) {
    console.error('[calendar-assistant]', err.message);
    return { error: err.message };
  }
}
