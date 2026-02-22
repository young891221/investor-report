const https = require('node:https');

const BASE_URL = 'https://finviz.com/screener.ashx';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 investor-report-scanner/1.0';

function buildScreenerUrl(filters, startRow) {
  const row = typeof startRow === 'number' ? startRow : 1;
  return `${BASE_URL}?v=111&f=${encodeURIComponent(filters)}&r=${row}&ft=4`;
}

function parseFinvizTable(html) {
  const results = [];
  const tickerPattern = /href="quote\.ashx\?t=([A-Z]{1,5})(?:&[^"]*)?"/g;
  const seen = new Set();
  let match;

  while ((match = tickerPattern.exec(html)) !== null) {
    const ticker = match[1];
    if (!seen.has(ticker)) {
      seen.add(ticker);
      results.push({ ticker });
    }
  }

  const rowPattern = /quote\.ashx\?t=([A-Z]{1,5})(?:&[^"]*)?">([^<]+)<\/a>/g;
  const nameMap = new Map();

  while ((match = rowPattern.exec(html)) !== null) {
    const name = match[2].trim();
    if (name && !/^\d+$/.test(name)) {
      nameMap.set(match[1], name);
    }
  }

  return results.map(item => ({
    ticker: item.ticker,
    company: nameMap.get(item.ticker) || '',
  }));
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error(`Timeout for ${url}`)));
    req.on('error', reject);
    req.end();
  });
}

async function fetchScreenerResults(filters) {
  const allResults = [];
  let page = 1;
  const maxPages = 3;

  for (let i = 0; i < maxPages; i++) {
    const url = buildScreenerUrl(filters, page);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (error) {
      if (i === 0) throw error;
      break;
    }

    const pageResults = parseFinvizTable(html);
    if (pageResults.length === 0) break;

    allResults.push(...pageResults);
    page += 20;

    if (i < maxPages - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  const seen = new Set();
  return allResults.filter(item => {
    if (seen.has(item.ticker)) return false;
    seen.add(item.ticker);
    return true;
  });
}

module.exports = { buildScreenerUrl, parseFinvizTable, fetchScreenerResults, fetchHtml };
