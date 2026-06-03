const http = require('http');
const https = require('https');

function stripHtmlTags(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
    .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
    .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/ +/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();
}

function fetchUrl(url) {
  const mod = url.startsWith('https') ? https : http;
  return new Promise((resolve, reject) => {
    mod.get(url, { timeout: 15000, headers: { 'User-Agent': 'ClickyX-WebScraper/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        resolve(fetchUrl(res.headers.location));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
  });
}

async function main(args) {
  const { url, extractBy } = args || {};

  if (!url) {
    return { error: 'Missing required field: url' };
  }

  console.log(`[web-scraper] Fetching ${url}`);

  try {
    const html = await fetchUrl(url);
    const text = stripHtmlTags(html);

    const lines = text.split('\n').filter(l => l.trim().length > 0);
    const maxLines = extractBy?.maxLines || 500;
    const truncated = lines.slice(0, maxLines);
    const content = truncated.join('\n');

    console.log(`[web-scraper] Extracted ${content.length} chars from ${url}`);

    return {
      result: 'Content extracted',
      url,
      title: html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || '',
      content,
      totalChars: content.length,
      truncated: lines.length > maxLines,
    };
  } catch (err) {
    console.error('[web-scraper] Error:', err.message);
    return { error: err.message };
  }
}

module.exports = { main };
