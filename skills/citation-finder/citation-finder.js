// Citation Finder — Find and format citations using CrossRef and PubMed APIs
// Usage: { action: "search"|"format"|"doi", query, doi, format, authors }

module.exports = { main };

async function crossRefSearch(query, limit = 5) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,published-print,container-title,volume,issue,page,publisher`;
  const res = await fetch(url, { headers: { 'User-Agent': 'ClickyX/1.0 (mailto:user@example.com)' } });
  if (!res.ok) throw new Error(`CrossRef API ${res.status}`);
  const data = await res.json();
  return data.message?.items || [];
}

async function pubmedSearch(query, limit = 5) {
  const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${limit}&retmode=json`;
  const searchRes = await fetch(searchUrl);
  const searchData = await searchRes.json();
  const ids = searchData.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
  const fetchRes = await fetch(fetchUrl);
  const fetchData = await fetchRes.json();
  return Object.values(fetchData.result || {}).filter((r) => r.uid);
}

function formatCrossRef(item, style = 'apa') {
  const authors = (item.author || []).map((a) => `${a.family || ''}, ${(a.given || '').slice(0, 1)}.`).join(', ');
  const year = item['published-print']?.['date-parts']?.[0]?.[0] || item['published-online']?.['date-parts']?.[0]?.[0] || 'n.d.';
  const title = Array.isArray(item.title) ? item.title[0] : item.title || 'Unknown Title';
  const journal = Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'] || '';
  const doi = item.DOI ? `https://doi.org/${item.DOI}` : '';
  const vol = item.volume ? `, ${item.volume}` : '';
  const issue = item.issue ? `(${item.issue})` : '';
  const pages = item.page ? `, ${item.page}` : '';

  if (style === 'apa') return `${authors || 'Unknown'} (${year}). ${title}. ${journal ? `*${journal}*` : ''}${vol}${issue}${pages}. ${doi}`;
  if (style === 'mla') return `${authors || 'Unknown'}. "${title}." ${journal ? `*${journal}*` : ''} ${vol.replace(',', '')} ${year}. ${doi}`;
  if (style === 'chicago') return `${authors || 'Unknown'}. "${title}." ${journal ? `*${journal}*` : ''} ${vol}${issue} (${year})${pages}. ${doi}`;
  return `${authors} (${year}). ${title}. ${doi}`;
}

async function main(args) {
  const { action, query, doi, format: citationFormat = 'apa', source = 'crossref', limit = 5 } = args || {};

  try {
    switch (action) {
      case 'search': {
        if (!query) return { error: 'Missing query' };
        let items = [];
        if (source === 'pubmed') {
          const pubmedItems = await pubmedSearch(query, limit);
          return {
            result: `${pubmedItems.length} PubMed results`,
            citations: pubmedItems.map((i) => ({
              pmid: i.uid,
              title: i.title,
              authors: i.authors?.map((a) => a.name).join(', '),
              pubDate: i.pubdate,
              journal: i.fulljournalname,
              doi: i.elocationid?.match(/doi:\s*(.+)/)?.[1],
            })),
          };
        }
        items = await crossRefSearch(query, limit);
        return {
          result: `${items.length} CrossRef results`,
          citations: items.map((item) => ({
            doi: item.DOI,
            title: Array.isArray(item.title) ? item.title[0] : item.title,
            authors: (item.author || []).map((a) => `${a.given || ''} ${a.family || ''}`).join(', '),
            year: item['published-print']?.['date-parts']?.[0]?.[0],
            journal: Array.isArray(item['container-title']) ? item['container-title'][0] : item['container-title'],
            formatted: formatCrossRef(item, citationFormat),
          })),
        };
      }

      case 'format': {
        if (!doi) return { error: 'Missing doi' };
        const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
        const res = await fetch(url, { headers: { 'User-Agent': 'ClickyX/1.0' } });
        if (!res.ok) throw new Error(`CrossRef DOI lookup failed: ${res.status}`);
        const data = await res.json();
        const item = data.message;
        return {
          result: 'Citation formatted',
          doi,
          apa: formatCrossRef(item, 'apa'),
          mla: formatCrossRef(item, 'mla'),
          chicago: formatCrossRef(item, 'chicago'),
          raw: { title: item.title, authors: item.author, year: item['published-print']?.['date-parts']?.[0]?.[0] },
        };
      }

      case 'doi': {
        if (!query) return { error: 'Missing query to find DOI' };
        const items = await crossRefSearch(query, 3);
        return {
          result: `Top ${items.length} matches`,
          matches: items.map((i) => ({
            doi: i.DOI,
            title: Array.isArray(i.title) ? i.title[0] : i.title,
            score: i.score,
          })),
        };
      }

      default:
        return { error: `Unknown action: ${action}. Use: search, format, doi` };
    }
  } catch (err) {
    console.error('[citation-finder]', err.message);
    return { error: err.message };
  }
}
