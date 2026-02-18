const https = require('node:https');

function getJson(url, options = {}) {
  const timeoutMs = typeof options.timeoutMs === 'number' ? options.timeoutMs : 15000;
  const headers = {
    'User-Agent': options.userAgent || 'investor-report-generator/1.0 (contact: ops@example.com)',
    Accept: 'application/json',
    ...options.headers,
  };

  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, res => {
      const chunks = [];

      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error.message}`));
        }
      });
    });

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Timeout after ${timeoutMs}ms for ${url}`));
    });

    req.on('error', reject);
    req.end();
  });
}

async function withRetry(fn, options = {}) {
  const attempts = typeof options.attempts === 'number' ? options.attempts : 2;
  const delayMs = typeof options.delayMs === 'number' ? options.delayMs : 500;

  let lastError;
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

module.exports = {
  getJson,
  withRetry,
};
