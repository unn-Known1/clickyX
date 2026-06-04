// Notion — Read and write Notion pages and databases
// Usage: { action: "search"|"readPage"|"createPage"|"appendBlock"|"queryDb", ...params }
// Requires: NOTION_TOKEN env var (Integration token)

module.exports = { main };

const NOTION_VERSION = '2022-06-28';

async function notionFetch(token, path, options = {}) {
  const res = await fetch(`https://api.notion.com/v1${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Notion API ${res.status}: ${await res.text()}`);
  return res.json();
}

function extractText(richText) {
  return (richText || []).map((t) => t.plain_text || '').join('');
}

function extractPageContent(page) {
  const props = {};
  for (const [key, val] of Object.entries(page.properties || {})) {
    if (val.title) props[key] = extractText(val.title);
    else if (val.rich_text) props[key] = extractText(val.rich_text);
    else if (val.select) props[key] = val.select?.name;
    else if (val.multi_select) props[key] = val.multi_select?.map((s) => s.name);
    else if (val.date) props[key] = val.date?.start;
    else if (val.number !== undefined) props[key] = val.number;
    else if (val.checkbox !== undefined) props[key] = val.checkbox;
  }
  return props;
}

async function main(args) {
  const { action, query, pageId, databaseId, title, content, properties, filter, token: tokenArg } = args || {};
  const token = tokenArg || process.env.NOTION_TOKEN;
  if (!token) return { error: 'Missing NOTION_TOKEN' };

  try {
    switch (action) {
      case 'search': {
        const data = await notionFetch(token, '/search', {
          method: 'POST',
          body: JSON.stringify({ query: query || '', page_size: 20 }),
        });
        return {
          result: `Found ${data.results?.length || 0} results`,
          results: (data.results || []).map((r) => ({
            id: r.id, type: r.object, title: extractText(r.properties?.title?.title || r.properties?.Name?.title),
            url: r.url,
          })),
        };
      }

      case 'readPage': {
        if (!pageId) return { error: 'Missing pageId' };
        const page = await notionFetch(token, `/pages/${pageId}`);
        const blocks = await notionFetch(token, `/blocks/${pageId}/children?page_size=100`);
        const blockTexts = (blocks.results || []).map((b) => {
          const type = b.type;
          const block = b[type];
          if (block?.rich_text) return `[${type}] ${extractText(block.rich_text)}`;
          return `[${type}]`;
        });
        return {
          result: 'Page read',
          id: page.id,
          properties: extractPageContent(page),
          blocks: blockTexts,
          url: page.url,
        };
      }

      case 'createPage': {
        if (!title) return { error: 'Missing title' };
        const parent = databaseId ? { database_id: databaseId } : { page_id: pageId || '' };
        if (!databaseId && !pageId) return { error: 'Missing databaseId or pageId (parent)' };
        const body = {
          parent,
          properties: databaseId
            ? { Name: { title: [{ text: { content: title } }] }, ...(properties || {}) }
            : { title: [{ text: { content: title } }] },
          children: content ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content } }] } }] : [],
        };
        const page = await notionFetch(token, '/pages', { method: 'POST', body: JSON.stringify(body) });
        return { result: 'Page created', id: page.id, url: page.url };
      }

      case 'appendBlock': {
        if (!pageId || !content) return { error: 'Missing pageId or content' };
        const children = typeof content === 'string'
          ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content } }] } }]
          : content;
        await notionFetch(token, `/blocks/${pageId}/children`, {
          method: 'PATCH',
          body: JSON.stringify({ children }),
        });
        return { result: 'Block appended', pageId };
      }

      case 'queryDb': {
        if (!databaseId) return { error: 'Missing databaseId' };
        const data = await notionFetch(token, `/databases/${databaseId}/query`, {
          method: 'POST',
          body: JSON.stringify({ filter: filter || {}, page_size: 50 }),
        });
        return {
          result: `${data.results?.length || 0} records`,
          records: (data.results || []).map((r) => ({ id: r.id, properties: extractPageContent(r), url: r.url })),
        };
      }

      default:
        return { error: `Unknown action: ${action}. Use: search, readPage, createPage, appendBlock, queryDb` };
    }
  } catch (err) {
    console.error('[notion]', err.message);
    return { error: err.message };
  }
}
