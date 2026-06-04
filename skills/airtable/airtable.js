// Airtable — Read and write records in Airtable bases and tables
// Usage: { action: "list"|"get"|"create"|"update"|"delete", baseId, tableId, ...params }
// Requires: AIRTABLE_API_KEY env var

module.exports = { main };

async function atFetch(token, path, options = {}) {
  const res = await fetch(`https://api.airtable.com/v0${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Airtable API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main(args) {
  const { action, baseId, tableId, recordId, fields, filterFormula, maxRecords = 50, token: tokenArg } = args || {};
  const token = tokenArg || process.env.AIRTABLE_API_KEY;

  if (!token) return { error: 'Missing AIRTABLE_API_KEY' };
  if (!baseId || !tableId) return { error: 'Missing baseId or tableId' };

  const base = `/${baseId}/${encodeURIComponent(tableId)}`;

  try {
    switch (action) {
      case 'list': {
        const params = new URLSearchParams({ pageSize: String(Math.min(maxRecords, 100)) });
        if (filterFormula) params.set('filterByFormula', filterFormula);
        const data = await atFetch(token, `${base}?${params}`);
        return { result: `${data.records?.length || 0} records`, records: data.records };
      }

      case 'get': {
        if (!recordId) return { error: 'Missing recordId' };
        const data = await atFetch(token, `${base}/${recordId}`);
        return { result: 'Record fetched', id: data.id, fields: data.fields };
      }

      case 'create': {
        if (!fields) return { error: 'Missing fields' };
        const payload = Array.isArray(fields)
          ? { records: fields.map((f) => ({ fields: f })) }
          : { records: [{ fields }] };
        const data = await atFetch(token, base, { method: 'POST', body: JSON.stringify(payload) });
        return { result: `${data.records?.length || 0} record(s) created`, records: data.records };
      }

      case 'update': {
        if (!recordId || !fields) return { error: 'Missing recordId or fields' };
        const data = await atFetch(token, `${base}/${recordId}`, {
          method: 'PATCH',
          body: JSON.stringify({ fields }),
        });
        return { result: 'Record updated', id: data.id, fields: data.fields };
      }

      case 'delete': {
        if (!recordId) return { error: 'Missing recordId' };
        const data = await atFetch(token, `${base}/${recordId}`, { method: 'DELETE' });
        return { result: 'Record deleted', deleted: data.deleted, id: data.id };
      }

      default:
        return { error: `Unknown action: ${action}. Use: list, get, create, update, delete` };
    }
  } catch (err) {
    console.error('[airtable]', err.message);
    return { error: err.message };
  }
}
