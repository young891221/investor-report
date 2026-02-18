const path = require('node:path');
const fs = require('node:fs');
const { getJson, withRetry } = require('./http');

const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const YAHOO_SEARCH_URL = 'https://query2.finance.yahoo.com/v1/finance/search';
const YAHOO_QUOTE_URL = 'https://query1.finance.yahoo.com/v7/finance/quote';
const YAHOO_SUMMARY_URL = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary';

const SEC_USER_AGENT =
  process.env.SEC_USER_AGENT ||
  'investor-report-generator/1.0 (contact: investor-report@example.com)';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function pickRaw(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.raw === 'number' && Number.isFinite(value.raw)) {
    return value.raw;
  }

  return null;
}

function toSecRows(payload) {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const rows = Array.isArray(payload) ? payload : Object.values(payload);
  return rows
    .map(row => ({
      ticker: String(row && row.ticker ? row.ticker : '').toUpperCase(),
      companyNameEn: String(row && row.title ? row.title : '').trim(),
      cik: row && row.cik_str ? String(row.cik_str).padStart(10, '0') : '',
    }))
    .filter(row => row.ticker);
}

async function fetchSecTickerTable() {
  const payload = await withRetry(
    () => getJson(SEC_TICKERS_URL, { userAgent: SEC_USER_AGENT, timeoutMs: 20000 }),
    { attempts: 3, delayMs: 800 }
  );

  return toSecRows(payload);
}

function readLocalKnownStocks(dataDir) {
  const files = fs
    .readdirSync(dataDir)
    .filter(file => file.endsWith('.json') && file !== 'index.json')
    .sort();

  const results = [];

  files.forEach(file => {
    const fullPath = path.join(dataDir, file);
    try {
      const json = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      results.push({
        ticker: String(json.ticker || '').toUpperCase(),
        companyName: String(json.companyName || '').trim(),
        companyNameEn: String(json.companyNameEn || '').trim(),
      });
    } catch (error) {
      // Ignore malformed files here; validation is handled elsewhere.
    }
  });

  return results.filter(entry => entry.ticker);
}

function findTickerFromLocalName(name, localStocks) {
  const normalizedName = normalizeText(name);
  const matches = localStocks.filter(stock => {
    return [stock.companyName, stock.companyNameEn, stock.ticker]
      .map(normalizeText)
      .includes(normalizedName);
  });

  if (matches.length === 1) {
    return matches[0].ticker;
  }

  return null;
}

function rankYahooSearchQuotes(name, quotes) {
  const normalizedName = normalizeText(name);
  const isUsExchange = exchange => /NMS|NAS|NYQ|ASE|PNK|BTS/iu.test(String(exchange || ''));

  const rows = quotes
    .filter(row => row && row.quoteType === 'EQUITY' && typeof row.symbol === 'string')
    .map(row => {
      const shortname = String(row.shortname || '').trim();
      const longname = String(row.longname || '').trim();
      const symbol = String(row.symbol || '').toUpperCase();
      const exch = String(row.exchange || row.exchDisp || '').trim();
      const normalizedNames = [shortname, longname, symbol].map(normalizeText);
      const exactMatch = normalizedNames.includes(normalizedName);
      const partialMatch = normalizedNames.some(candidate => candidate.includes(normalizedName));
      const usBoost = isUsExchange(exch) ? 1 : 0;

      let score = 0;
      if (exactMatch) score += 100;
      if (partialMatch) score += 40;
      score += usBoost * 10;
      score += symbol.length <= 5 ? 5 : 0;

      return {
        symbol,
        shortname,
        longname,
        exchange: exch,
        score,
      };
    })
    .filter(row => row.symbol);

  return rows.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
}

async function searchYahooTickerByName(name) {
  const url = `${YAHOO_SEARCH_URL}?q=${encodeURIComponent(name)}&quotesCount=10&newsCount=0`;
  const payload = await withRetry(() => getJson(url, { timeoutMs: 15000 }), {
    attempts: 2,
    delayMs: 400,
  });

  const quotes = Array.isArray(payload && payload.quotes) ? payload.quotes : [];
  return rankYahooSearchQuotes(name, quotes);
}

async function fetchYahooQuote(symbols) {
  if (!Array.isArray(symbols) || symbols.length === 0) {
    return [];
  }

  const unique = Array.from(new Set(symbols.map(symbol => String(symbol || '').toUpperCase()).filter(Boolean)));
  if (unique.length === 0) {
    return [];
  }

  const url = `${YAHOO_QUOTE_URL}?symbols=${encodeURIComponent(unique.join(','))}`;
  const payload = await withRetry(() => getJson(url, { timeoutMs: 15000 }), {
    attempts: 2,
    delayMs: 400,
  });

  const results = payload && payload.quoteResponse && Array.isArray(payload.quoteResponse.result)
    ? payload.quoteResponse.result
    : [];

  return results.map(row => ({
    symbol: String(row.symbol || '').toUpperCase(),
    shortName: String(row.shortName || row.shortname || '').trim(),
    longName: String(row.longName || row.longname || '').trim(),
    exchange: String(row.fullExchangeName || row.exchange || '').trim(),
    quoteType: String(row.quoteType || '').trim(),
    currency: String(row.currency || 'USD').trim(),
    marketCap: pickRaw(row.marketCap),
    regularMarketPrice: pickRaw(row.regularMarketPrice),
    fiftyTwoWeekLow: pickRaw(row.fiftyTwoWeekLow),
    fiftyTwoWeekHigh: pickRaw(row.fiftyTwoWeekHigh),
    trailingPE: pickRaw(row.trailingPE),
    forwardPE: pickRaw(row.forwardPE),
    priceToSalesTrailing12Months: pickRaw(row.priceToSalesTrailing12Months),
    priceToBook: pickRaw(row.priceToBook),
    enterpriseToEbitda: pickRaw(row.enterpriseToEbitda),
    beta: pickRaw(row.beta),
  }));
}

async function fetchYahooSummary(ticker) {
  const modules = [
    'assetProfile',
    'price',
    'financialData',
    'defaultKeyStatistics',
    'summaryDetail',
    'calendarEvents',
    'incomeStatementHistory',
    'incomeStatementHistoryQuarterly',
    'earningsTrend',
  ].join(',');

  const url = `${YAHOO_SUMMARY_URL}/${encodeURIComponent(ticker)}?modules=${encodeURIComponent(modules)}`;
  const payload = await withRetry(() => getJson(url, { timeoutMs: 18000 }), {
    attempts: 2,
    delayMs: 500,
  });

  const result = payload && payload.quoteSummary && Array.isArray(payload.quoteSummary.result)
    ? payload.quoteSummary.result[0]
    : null;

  return result || null;
}

function findSecEntryByTicker(ticker, secRows) {
  const upperTicker = String(ticker || '').toUpperCase();
  return secRows.find(row => row.ticker === upperTicker) || null;
}

function findSecEntryByName(name, secRows) {
  const normalizedName = normalizeText(name);
  if (!normalizedName) {
    return [];
  }

  const exact = secRows.filter(row => normalizeText(row.companyNameEn) === normalizedName);
  if (exact.length > 0) {
    return exact;
  }

  return secRows.filter(row => normalizeText(row.companyNameEn).includes(normalizedName));
}

async function resolveTicker(input, options) {
  const tickerArg = String(options.ticker || '').toUpperCase().trim();
  if (tickerArg) {
    return { ticker: tickerArg, resolution: 'ticker_input' };
  }

  const nameArg = String(options.name || '').trim();
  if (!nameArg) {
    throw new Error('Either --ticker or --name is required.');
  }

  const localTicker = findTickerFromLocalName(nameArg, input.localStocks);
  if (localTicker) {
    return { ticker: localTicker, resolution: 'local_data_name_match' };
  }

  const yahooCandidates = await searchYahooTickerByName(nameArg);
  if (yahooCandidates.length === 1) {
    return { ticker: yahooCandidates[0].symbol, resolution: 'yahoo_search_single' };
  }

  if (yahooCandidates.length > 1) {
    const top = yahooCandidates.slice(0, 3);
    const bestScore = top[0].score;
    const best = top.filter(candidate => candidate.score === bestScore);
    if (best.length === 1) {
      return { ticker: best[0].symbol, resolution: 'yahoo_search_ranked' };
    }

    const candidateText = top
      .map(candidate => `${candidate.symbol} (${candidate.shortname || candidate.longname || 'N/A'} / ${candidate.exchange || 'N/A'})`)
      .join(', ');
    throw new Error(`Ambiguous company name '${nameArg}'. Candidates: ${candidateText}`);
  }

  const secCandidates = findSecEntryByName(nameArg, input.secRows);
  if (secCandidates.length === 1) {
    return { ticker: secCandidates[0].ticker, resolution: 'sec_name_single' };
  }

  if (secCandidates.length > 1) {
    const candidateText = secCandidates
      .slice(0, 5)
      .map(candidate => `${candidate.ticker} (${candidate.companyNameEn})`)
      .join(', ');
    throw new Error(`Ambiguous company name '${nameArg}' in SEC list. Candidates: ${candidateText}`);
  }

  throw new Error(`Unable to resolve ticker from name '${nameArg}'.`);
}

module.exports = {
  fetchSecTickerTable,
  fetchYahooQuote,
  fetchYahooSummary,
  findSecEntryByTicker,
  pickRaw,
  readLocalKnownStocks,
  resolveTicker,
};
