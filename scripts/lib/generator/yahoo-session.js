const https = require('node:https');

const COOKIE_URL = 'https://fc.yahoo.com/';
const CRUMB_URL = 'https://query2.finance.yahoo.com/v1/test/getcrumb';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 investor-report/1.0';

let cachedSession = null;
let cachedAt = 0;
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes

function rawRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.setTimeout(15000, () => req.destroy(new Error(`Timeout for ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

async function createSession() {
  const r1 = await rawRequest(COOKIE_URL, { 'User-Agent': UA });
  const setCookies = r1.headers['set-cookie'] || [];
  const cookie = setCookies.map(c => c.split(';')[0]).join('; ');

  if (!cookie) {
    throw new Error('Failed to obtain Yahoo session cookie');
  }

  const r2 = await rawRequest(CRUMB_URL, { 'User-Agent': UA, Cookie: cookie });
  if (r2.status !== 200) {
    throw new Error(`Failed to obtain Yahoo crumb: HTTP ${r2.status}`);
  }

  const crumb = r2.body.trim();
  if (!crumb) {
    throw new Error('Empty crumb returned from Yahoo');
  }

  return { cookie, crumb };
}

async function getYahooSession() {
  const now = Date.now();
  if (cachedSession && (now - cachedAt) < SESSION_TTL_MS) {
    return cachedSession;
  }

  cachedSession = await createSession();
  cachedAt = now;
  return cachedSession;
}

function clearYahooSession() {
  cachedSession = null;
  cachedAt = 0;
}

module.exports = { getYahooSession, clearYahooSession };
