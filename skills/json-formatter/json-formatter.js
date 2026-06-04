// JSON Formatter — Format, validate, query, and transform JSON data
// Usage: { action: "format"|"validate"|"query"|"minify"|"diff", json, filePath, path, transform }

module.exports = { main };

const fs = require('fs');
const { execSync } = require('child_process');

function getByPath(obj, pathExpr) {
  // Simple jq-like path: .key.nested[0].field
  const parts = pathExpr.replace(/^\./, '').split(/[\.\[\]]/).filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    const idx = parseInt(part);
    current = isNaN(idx) ? current[part] : current[idx];
  }
  return current;
}

function deepDiff(a, b, path = '') {
  const diffs = [];
  if (typeof a !== typeof b) {
    diffs.push({ path, type: 'type_change', from: typeof a, to: typeof b });
    return diffs;
  }
  if (typeof a !== 'object' || a === null) {
    if (a !== b) diffs.push({ path, type: 'value_change', from: a, to: b });
    return diffs;
  }
  const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
  for (const key of allKeys) {
    const childPath = path ? `${path}.${key}` : key;
    if (!(key in (a || {}))) diffs.push({ path: childPath, type: 'added', value: b[key] });
    else if (!(key in (b || {}))) diffs.push({ path: childPath, type: 'removed', value: a[key] });
    else diffs.push(...deepDiff(a[key], b[key], childPath));
  }
  return diffs;
}

async function main(args) {
  const { action, json: jsonInput, filePath, path: queryPath, indent = 2, sortKeys = false, transform } = args || {};

  // Load JSON from string or file
  let data;
  let source = jsonInput;
  if (!source && filePath) {
    if (!fs.existsSync(filePath)) return { error: `File not found: ${filePath}` };
    source = fs.readFileSync(filePath, 'utf-8');
  }

  try {
    if (source && typeof source === 'string') {
      data = JSON.parse(source);
    } else if (typeof source === 'object') {
      data = source;
    }
  } catch (e) {
    if (action !== 'validate') return { error: `Invalid JSON: ${e.message}` };
  }

  try {
    switch (action) {
      case 'validate': {
        if (!source) return { error: 'Missing json or filePath' };
        try {
          JSON.parse(typeof source === 'string' ? source : JSON.stringify(source));
          const keys = typeof data === 'object' ? Object.keys(data || {}).length : 0;
          return { valid: true, type: Array.isArray(data) ? 'array' : typeof data, length: Array.isArray(data) ? data.length : keys };
        } catch (e) {
          return { valid: false, error: e.message };
        }
      }

      case 'format':
      case 'pretty': {
        if (!data) return { error: 'Missing json or filePath' };
        let result = data;
        if (sortKeys) {
          result = JSON.parse(JSON.stringify(data, Object.keys(data).sort()));
        }
        const formatted = JSON.stringify(result, null, indent);
        if (filePath) fs.writeFileSync(filePath, formatted, 'utf-8');
        return { result: 'JSON formatted', formatted, length: formatted.length, saved: !!filePath };
      }

      case 'minify': {
        if (!data) return { error: 'Missing json or filePath' };
        const minified = JSON.stringify(data);
        if (filePath) fs.writeFileSync(filePath, minified, 'utf-8');
        const savings = source ? ((1 - minified.length / source.length) * 100).toFixed(1) : 0;
        return { result: 'JSON minified', minified, length: minified.length, savings: savings + '%' };
      }

      case 'query': {
        if (!data || !queryPath) return { error: 'Missing json or path' };
        // Try jq if available
        if (filePath) {
          try {
            const out = execSync(`jq '${queryPath}' "${filePath}"`, { encoding: 'utf-8', timeout: 5000 });
            return { result: 'Query result', path: queryPath, value: JSON.parse(out) };
          } catch { /* fall through to manual */ }
        }
        const value = getByPath(data, queryPath);
        return { result: 'Query result', path: queryPath, value };
      }

      case 'keys': {
        if (!data) return { error: 'Missing json' };
        if (typeof data !== 'object') return { error: 'JSON is not an object' };
        return { result: 'Keys', keys: Array.isArray(data) ? `array[${data.length}]` : Object.keys(data) };
      }

      case 'diff': {
        const { json: json2, filePath: filePath2 } = args || {};
        if (!json2 && !filePath2) return { error: 'Missing second JSON for diff (json2 or filePath2)' };
        let data2;
        if (json2) data2 = typeof json2 === 'string' ? JSON.parse(json2) : json2;
        else data2 = JSON.parse(fs.readFileSync(filePath2, 'utf-8'));
        const diffs = deepDiff(data, data2);
        return { result: `${diffs.length} difference(s)`, differences: diffs.slice(0, 50) };
      }

      default:
        return { error: `Unknown action: ${action}. Use: validate, format, minify, query, keys, diff` };
    }
  } catch (err) {
    console.error('[json-formatter]', err.message);
    return { error: err.message };
  }
}
