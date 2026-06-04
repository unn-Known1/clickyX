// CSV Analyzer — Load, query, filter, and generate statistics from CSV data
// Usage: { action: "load"|"stats"|"filter"|"query"|"head", filePath, column, filter, limit }

module.exports = { main };

const fs = require('fs');
const path = require('path');

function parseCSV(content) {
  const lines = content.split('\n').filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };

  // Detect delimiter
  const firstLine = lines[0];
  const delimiters = [',', '\t', ';', '|'];
  const delimiter = delimiters.find((d) => firstLine.includes(d)) || ',';

  function parseLine(line) {
    const result = [];
    let inQuotes = false;
    let current = '';
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && !inQuotes) { inQuotes = true; continue; }
      if (ch === '"' && inQuotes) { inQuotes = false; continue; }
      if (ch === delimiter && !inQuotes) { result.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    result.push(current.trim());
    return result;
  }

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1).map((l) => {
    const vals = parseLine(l);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
    return obj;
  });

  return { headers, rows, delimiter };
}

function computeStats(rows, column) {
  const values = rows.map((r) => parseFloat(r[column])).filter((v) => !isNaN(v));
  if (values.length === 0) return { type: 'non-numeric', uniqueValues: [...new Set(rows.map((r) => r[column]))].slice(0, 10) };
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0 ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2 : sorted[Math.floor(sorted.length / 2)];
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return { count: values.length, min: Math.min(...values), max: Math.max(...values), sum: sum.toFixed(4), mean: mean.toFixed(4), median: median.toFixed(4), stddev: Math.sqrt(variance).toFixed(4) };
}

async function main(args) {
  const { action, filePath, column, filter: filterExpr, limit = 10, value } = args || {};

  if (!filePath) return { error: 'Missing filePath' };
  if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { headers, rows, delimiter } = parseCSV(content);

    switch (action) {
      case 'load':
      case 'info': {
        return { result: 'CSV loaded', rows: rows.length, columns: headers.length, headers, delimiter, sample: rows.slice(0, 3) };
      }

      case 'head': {
        return { result: `First ${limit} rows`, headers, rows: rows.slice(0, limit) };
      }

      case 'stats': {
        if (column) {
          if (!headers.includes(column)) return { error: `Column "${column}" not found. Available: ${headers.join(', ')}` };
          return { result: `Stats for column "${column}"`, column, stats: computeStats(rows, column) };
        }
        // All columns
        const allStats = {};
        for (const h of headers) { allStats[h] = computeStats(rows, h); }
        return { result: 'Column statistics', columns: allStats, rowCount: rows.length };
      }

      case 'filter': {
        if (!column || value === undefined) return { error: 'Missing column or value for filter' };
        const filtered = rows.filter((r) => String(r[column]).toLowerCase().includes(String(value).toLowerCase()));
        return { result: `${filtered.length} matching rows`, headers, rows: filtered.slice(0, limit) };
      }

      case 'query': {
        // Simple query: "column > value", "column == value", "column contains value"
        if (!filterExpr) return { error: 'Missing filter expression' };
        const match = filterExpr.match(/(\w+)\s*(>|<|==|!=|>=|<=|contains)\s*(.+)/);
        if (!match) return { error: 'Invalid filter. Use: "column > value" or "column contains text"' };
        const [, col, op, val] = match;
        const v = val.trim().replace(/^['"]|['"]$/g, '');
        const filtered = rows.filter((r) => {
          const rv = r[col];
          const nv = parseFloat(v);
          const nrv = parseFloat(rv);
          switch (op) {
            case '>': return !isNaN(nrv) && nrv > nv;
            case '<': return !isNaN(nrv) && nrv < nv;
            case '>=': return !isNaN(nrv) && nrv >= nv;
            case '<=': return !isNaN(nrv) && nrv <= nv;
            case '==': return String(rv) === String(v);
            case '!=': return String(rv) !== String(v);
            case 'contains': return String(rv).toLowerCase().includes(v.toLowerCase());
            default: return false;
          }
        });
        return { result: `${filtered.length} matching rows`, headers, rows: filtered.slice(0, limit) };
      }

      case 'unique': {
        if (!column) return { error: 'Missing column' };
        const unique = [...new Set(rows.map((r) => r[column]))];
        return { result: `${unique.length} unique values in "${column}"`, values: unique.slice(0, 50) };
      }

      default:
        return { error: `Unknown action: ${action}. Use: load, info, head, stats, filter, query, unique` };
    }
  } catch (err) {
    console.error('[csv-analyzer]', err.message);
    return { error: err.message };
  }
}
