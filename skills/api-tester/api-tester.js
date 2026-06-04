// API Tester — HTTP client for testing REST APIs with assertions and reporting
// Usage: { action: "request"|"suite"|"health", url, method, headers, body, assertions, ... }

module.exports = { main };

async function makeRequest(url, method = 'GET', headers = {}, body, timeout = 10000) {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      signal: controller.signal,
    };
    if (body && method !== 'GET') {
      options.body = typeof body === 'string' ? body : JSON.stringify(body);
    }

    const res = await fetch(url, options);
    clearTimeout(timer);
    const latency = Date.now() - start;

    let responseBody;
    const ct = res.headers.get('content-type') || '';
    try {
      responseBody = ct.includes('application/json') ? await res.json() : await res.text();
    } catch { responseBody = null; }

    return {
      ok: true,
      status: res.status,
      statusText: res.statusText,
      latencyMs: latency,
      headers: Object.fromEntries(res.headers.entries()),
      body: responseBody,
      size: typeof responseBody === 'string' ? responseBody.length : JSON.stringify(responseBody || '').length,
    };
  } catch (e) {
    clearTimeout(timer);
    return { ok: false, error: e.message, latencyMs: Date.now() - start };
  }
}

function runAssertions(response, assertions) {
  const results = [];
  for (const assertion of (assertions || [])) {
    const { type, expected, path } = assertion;
    let actual;
    let pass = false;
    let message = '';

    switch (type) {
      case 'status':
        actual = response.status;
        pass = actual === expected;
        message = `Status ${actual} ${pass ? '==' : '!='} ${expected}`;
        break;
      case 'statusOk':
        pass = response.status >= 200 && response.status < 300;
        message = `Status ${response.status} is ${pass ? '' : 'not '}OK`;
        break;
      case 'bodyContains':
        actual = JSON.stringify(response.body);
        pass = actual.includes(String(expected));
        message = `Body ${pass ? 'contains' : 'does not contain'} "${expected}"`;
        break;
      case 'latency':
        actual = response.latencyMs;
        pass = actual <= expected;
        message = `Latency ${actual}ms ${pass ? '<=' : '>'} ${expected}ms`;
        break;
      case 'jsonPath': {
        const parts = (path || '').replace(/^\./, '').split('.');
        let val = response.body;
        for (const p of parts) val = val?.[p];
        pass = String(val) === String(expected);
        message = `${path} = ${val} ${pass ? '==' : '!='} ${expected}`;
        break;
      }
      default:
        message = `Unknown assertion type: ${type}`;
    }

    results.push({ type, pass, message, actual });
  }
  return results;
}

async function main(args) {
  const { action, url, method = 'GET', headers, body, assertions, urls, timeout } = args || {};

  try {
    switch (action) {
      case 'request': {
        if (!url) return { error: 'Missing url' };
        const response = await makeRequest(url, method, headers, body, timeout);
        const assertionResults = runAssertions(response, assertions);
        const passed = assertionResults.filter((a) => a.pass).length;
        return {
          result: `${method} ${url} → ${response.status || 'error'}`,
          response,
          assertions: assertionResults,
          passed: `${passed}/${assertionResults.length}`,
          success: response.ok && assertionResults.every((a) => a.pass),
        };
      }

      case 'health': {
        if (!url && !urls) return { error: 'Missing url or urls' };
        const targets = urls || [url];
        const results = await Promise.all(
          targets.map(async (u) => {
            const res = await makeRequest(u, 'GET', headers, null, timeout || 5000);
            return { url: u, status: res.status, latencyMs: res.latencyMs, ok: res.ok && res.status === 200 };
          })
        );
        const healthy = results.filter((r) => r.ok).length;
        return { result: `${healthy}/${results.length} endpoints healthy`, checks: results };
      }

      case 'suite': {
        const { requests: reqList } = args || {};
        if (!reqList?.length) return { error: 'Missing requests array for suite' };
        const results = [];
        for (const req of reqList) {
          const res = await makeRequest(req.url, req.method || 'GET', req.headers, req.body, timeout);
          const assertResults = runAssertions(res, req.assertions);
          results.push({
            name: req.name || `${req.method || 'GET'} ${req.url}`,
            response: { status: res.status, latencyMs: res.latencyMs, ok: res.ok },
            assertions: assertResults,
            passed: assertResults.every((a) => a.pass),
          });
        }
        const passedCount = results.filter((r) => r.passed).length;
        return { result: `${passedCount}/${results.length} requests passed`, suite: results };
      }

      default:
        return { error: `Unknown action: ${action}. Use: request, health, suite` };
    }
  } catch (err) {
    console.error('[api-tester]', err.message);
    return { error: err.message };
  }
}
