// Data Visualizer — Generate ASCII and SVG charts from data
// Usage: { action: "bar"|"line"|"pie"|"histogram", data, labels, title, width }

module.exports = { main };

function asciiBar(values, labels, title, width = 40) {
  const max = Math.max(...values);
  const lines = [title || 'Bar Chart', '─'.repeat(width + 20)];
  const maxLabel = Math.max(...labels.map((l) => String(l).length), 10);

  for (let i = 0; i < values.length; i++) {
    const barLen = max > 0 ? Math.round((values[i] / max) * width) : 0;
    const bar = '█'.repeat(barLen) + '░'.repeat(width - barLen);
    const label = String(labels[i]).padEnd(maxLabel);
    const val = String(values[i]).padStart(8);
    lines.push(`${label} |${bar}| ${val}`);
  }
  lines.push('─'.repeat(width + 20));
  return lines.join('\n');
}

function asciiLine(values, labels, title, width = 60, height = 15) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;

  const grid = Array.from({ length: height }, () => Array(width).fill(' '));

  // Plot points
  for (let i = 0; i < values.length && i < width; i++) {
    const x = Math.round((i / (values.length - 1)) * (width - 1));
    const y = height - 1 - Math.round(((values[i] - min) / range) * (height - 1));
    if (y >= 0 && y < height && x >= 0 && x < width) grid[y][x] = '●';
  }

  const lines = [title || 'Line Chart'];
  for (let y = 0; y < height; y++) {
    const rowVal = (max - (y / (height - 1)) * range).toFixed(1);
    lines.push(`${String(rowVal).padStart(8)} |${grid[y].join('')}`);
  }
  lines.push(' '.repeat(9) + '+' + '─'.repeat(width));
  if (labels.length > 0) lines.push(' '.repeat(10) + labels[0] + ' '.repeat(width - String(labels[0]).length - String(labels.at(-1)).length) + labels.at(-1));
  return lines.join('\n');
}

function asciiPie(values, labels, title) {
  const total = values.reduce((a, b) => a + b, 0);
  const lines = [title || 'Pie Chart', '─'.repeat(40)];
  const blocks = ['▓', '░', '▒', '█', '▪', '•', '■', '□'];
  for (let i = 0; i < values.length; i++) {
    const pct = total > 0 ? (values[i] / total * 100).toFixed(1) : '0.0';
    const barLen = Math.round(values[i] / total * 20);
    const bar = (blocks[i % blocks.length] || '■').repeat(barLen);
    lines.push(`${String(labels[i] || i).padEnd(15)} ${bar.padEnd(20)} ${pct}% (${values[i]})`);
  }
  lines.push('─'.repeat(40) + `\nTotal: ${total}`);
  return lines.join('\n');
}

function svgBar(values, labels, title, width = 600, height = 300) {
  const max = Math.max(...values, 1);
  const barWidth = (width - 100) / values.length - 10;
  const bars = values.map((v, i) => {
    const bh = Math.round((v / max) * (height - 80));
    const x = 60 + i * (barWidth + 10);
    const y = height - 40 - bh;
    const hue = (i * 40) % 360;
    return `<rect x="${x}" y="${y}" width="${barWidth}" height="${bh}" fill="hsl(${hue},65%,50%)" rx="3"/>
<text x="${x + barWidth / 2}" y="${y - 5}" text-anchor="middle" font-size="10" fill="#ccc">${v}</text>
<text x="${x + barWidth / 2}" y="${height - 20}" text-anchor="middle" font-size="10" fill="#aaa" transform="rotate(-20 ${x + barWidth / 2} ${height - 20})">${String(labels[i] || i).slice(0, 12)}</text>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" style="background:#1a1a2e;font-family:sans-serif">
<text x="${width / 2}" y="25" text-anchor="middle" font-size="14" fill="#fff" font-weight="bold">${title || 'Chart'}</text>
${bars}
</svg>`;
}

async function main(args) {
  const { action, data, labels: labelsArg, title, width, height, format = 'ascii' } = args || {};

  if (!data) return { error: 'Missing data array' };
  const values = Array.isArray(data) ? data.map(Number) : Object.values(data).map(Number);
  const labels = labelsArg || (typeof data === 'object' && !Array.isArray(data) ? Object.keys(data) : values.map((_, i) => String(i)));

  try {
    switch (action) {
      case 'bar': {
        if (format === 'svg') return { result: 'SVG bar chart', svg: svgBar(values, labels, title, width || 600, height || 300) };
        return { result: 'ASCII bar chart', chart: asciiBar(values, labels, title, width || 40) };
      }

      case 'line': {
        return { result: 'ASCII line chart', chart: asciiLine(values, labels, title, width || 60, height || 15) };
      }

      case 'pie': {
        return { result: 'ASCII pie chart', chart: asciiPie(values, labels, title) };
      }

      case 'histogram': {
        const bins = args.bins || 10;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const binSize = (max - min) / bins;
        const counts = Array(bins).fill(0);
        for (const v of values) {
          const bin = Math.min(Math.floor((v - min) / binSize), bins - 1);
          counts[bin]++;
        }
        const binLabels = counts.map((_, i) => (min + i * binSize).toFixed(1));
        return { result: 'Histogram', chart: asciiBar(counts, binLabels, title || `Distribution (${values.length} values)`, width || 40) };
      }

      case 'stats': {
        const sorted = [...values].sort((a, b) => a - b);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
        return {
          result: 'Statistics',
          count: values.length, min: Math.min(...values), max: Math.max(...values),
          mean: mean.toFixed(4), median: sorted[Math.floor(sorted.length / 2)],
          stddev: Math.sqrt(variance).toFixed(4), sum: values.reduce((a, b) => a + b, 0),
        };
      }

      default:
        return { error: `Unknown action: ${action}. Use: bar, line, pie, histogram, stats` };
    }
  } catch (err) {
    console.error('[data-visualizer]', err.message);
    return { error: err.message };
  }
}
