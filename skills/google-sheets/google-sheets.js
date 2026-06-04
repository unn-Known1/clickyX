// Google Sheets — Read/write cells, create and modify spreadsheets
// Usage: { action: "read"|"write"|"create"|"append", spreadsheetId, range, values, ... }
// Requires: GSHEETS_ACCESS_TOKEN env var

module.exports = { main };

const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

async function sheetsFetch(token, path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main(args) {
  const { action, spreadsheetId, range, values, title, sheetName, accessToken } = args || {};
  const token = accessToken || process.env.GSHEETS_ACCESS_TOKEN;
  if (!token) return { error: 'Missing GSHEETS_ACCESS_TOKEN' };

  try {
    switch (action) {
      case 'create': {
        const data = await sheetsFetch(token, '', {
          method: 'POST',
          body: JSON.stringify({
            properties: { title: title || 'New Spreadsheet' },
            sheets: [{ properties: { title: sheetName || 'Sheet1' } }],
          }),
        });
        return { result: 'Spreadsheet created', spreadsheetId: data.spreadsheetId, url: data.spreadsheetUrl };
      }

      case 'read': {
        if (!spreadsheetId || !range) return { error: 'Missing spreadsheetId or range' };
        const data = await sheetsFetch(token, `/${spreadsheetId}/values/${encodeURIComponent(range)}`);
        return {
          result: 'Data read',
          range: data.range,
          values: data.values || [],
          majorDimension: data.majorDimension,
        };
      }

      case 'write': {
        if (!spreadsheetId || !range || !values) return { error: 'Missing spreadsheetId, range, or values' };
        const rows = Array.isArray(values[0]) ? values : [values];
        const data = await sheetsFetch(token, `/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
          method: 'PUT',
          body: JSON.stringify({ range, majorDimension: 'ROWS', values: rows }),
        });
        return { result: 'Cells written', updatedRange: data.updatedRange, updatedCells: data.updatedCells };
      }

      case 'append': {
        if (!spreadsheetId || !range || !values) return { error: 'Missing spreadsheetId, range, or values' };
        const rows = Array.isArray(values[0]) ? values : [values];
        const data = await sheetsFetch(token, `/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
          method: 'POST',
          body: JSON.stringify({ range, majorDimension: 'ROWS', values: rows }),
        });
        return { result: 'Rows appended', updatedRange: data.updates?.updatedRange, updatedRows: data.updates?.updatedRows };
      }

      default:
        return { error: `Unknown action: ${action}. Use: create, read, write, append` };
    }
  } catch (err) {
    console.error('[google-sheets]', err.message);
    return { error: err.message };
  }
}
