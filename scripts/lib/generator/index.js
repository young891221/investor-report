const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { validateStock } = require('../stock-validation');
const {
  fetchSecTickerTable,
  fetchYahooQuote,
  fetchYahooSummary,
  findSecEntryByTicker,
  readLocalKnownStocks,
  resolveTicker,
} = require('./sources');
const { buildStockJson, choosePeers, formatDateDots } = require('./builder');

function writeJsonAtomic(filePath, json) {
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, filePath);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function normalizeBoolean(value, defaultValue) {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (['true', '1', 'yes', 'y'].includes(value.toLowerCase())) return true;
    if (['false', '0', 'no', 'n'].includes(value.toLowerCase())) return false;
  }
  return defaultValue;
}

function parseArgs(argv) {
  const options = {
    ticker: '',
    name: '',
    strict: true,
    allowPlaceholders: true,
    force: false,
    dryRun: false,
    buildIndex: false,
  };
  let strictExplicit = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--ticker') {
      options.ticker = String(argv[i + 1] || '').trim().toUpperCase();
      i += 1;
      continue;
    }

    if (arg === '--name') {
      options.name = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }

    if (arg === '--strict') {
      options.strict = true;
      strictExplicit = true;
      continue;
    }

    if (arg === '--no-strict') {
      options.strict = false;
      strictExplicit = true;
      continue;
    }

    if (arg === '--allow-placeholders') {
      options.allowPlaceholders = true;
      continue;
    }

    if (arg === '--no-allow-placeholders') {
      options.allowPlaceholders = false;
      continue;
    }

    if (arg === '--force') {
      options.force = true;
      continue;
    }

    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }

    if (arg === '--build-index') {
      options.buildIndex = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!strictExplicit && process.env.GENERATOR_STRICT_MODE != null) {
    options.strict = normalizeBoolean(process.env.GENERATOR_STRICT_MODE, options.strict);
  }

  if (!options.ticker && !options.name) {
    throw new Error('Either --ticker or --name is required.');
  }

  return options;
}

function buildSourceManifest(input) {
  const {
    ticker,
    resolvedBy,
    requestedName,
    options,
    metadata,
    secEntry,
  } = input;

  const generatedAt = new Date().toISOString();

  return {
    ticker,
    requestedName: requestedName || null,
    resolvedBy,
    generatedAt,
    asOfDate: formatDateDots(new Date()),
    policy: {
      strict: options.strict,
      allowPlaceholders: options.allowPlaceholders,
      sourcePriority: 'official_first',
    },
    sources: [
      {
        id: 'sec_company_tickers',
        type: 'official',
        url: 'https://www.sec.gov/files/company_tickers.json',
        retrievedAt: generatedAt,
      },
      {
        id: 'yahoo_quote',
        type: 'market_data',
        url: `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${ticker}`,
        retrievedAt: generatedAt,
      },
      {
        id: 'yahoo_quote_summary',
        type: 'market_data',
        url: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${ticker}`,
        retrievedAt: generatedAt,
      },
    ],
    sec: secEntry
      ? {
          cik: secEntry.cik,
          companyNameEn: secEntry.companyNameEn,
        }
      : null,
    placeholders: metadata.placeholders,
    checks: {
      criticalIssues: metadata.criticalChecks,
      annualPoints: metadata.summary.annualPoints,
      quarterPoints: metadata.summary.quarterPoints,
    },
    fieldSources: {
      companyNameEn: ['sec_company_tickers'],
      price: ['yahoo_quote'],
      marketCap: ['yahoo_quote'],
      weekRange: ['yahoo_quote'],
      analystTarget: ['yahoo_quote_summary'],
      annualRevenue: ['yahoo_quote_summary'],
      quarterlyRevenue: ['yahoo_quote_summary'],
      valuation: ['yahoo_quote', 'yahoo_quote_summary'],
      timeline: ['yahoo_quote_summary'],
    },
  };
}

function runBuildIndex(repoRoot) {
  execSync('npm run validate:stocks', { cwd: repoRoot, stdio: 'inherit' });
  execSync('npm run build:index', { cwd: repoRoot, stdio: 'inherit' });
}

async function generateStockReport(optionsInput = {}) {
  const options = {
    ticker: optionsInput.ticker || '',
    name: optionsInput.name || '',
    strict: optionsInput.strict !== false,
    allowPlaceholders: optionsInput.allowPlaceholders !== false,
    force: optionsInput.force === true,
    dryRun: optionsInput.dryRun === true,
    buildIndex: optionsInput.buildIndex === true,
  };

  const repoRoot = path.join(__dirname, '..', '..', '..');
  const dataDir = path.join(repoRoot, 'data');
  const sourceDir = path.join(dataDir, 'sources');

  ensureDir(sourceDir);

  const localStocks = readLocalKnownStocks(dataDir);
  let secRows = [];
  try {
    secRows = await fetchSecTickerTable();
  } catch (error) {
    if (options.strict) {
      throw new Error(`Failed to load SEC company list in strict mode: ${error.message}`);
    }
  }

  const resolution = await resolveTicker(
    {
      secRows,
      localStocks,
    },
    {
      ticker: options.ticker,
      name: options.name,
    }
  );

  const ticker = resolution.ticker;
  const secEntry = findSecEntryByTicker(ticker, secRows);
  if (options.strict && !secEntry) {
    throw new Error(`SEC primary source did not return company metadata for ticker ${ticker}.`);
  }

  let primaryQuotes;
  try {
    primaryQuotes = await fetchYahooQuote([ticker]);
  } catch (error) {
    throw new Error(`Failed to load quote data for ${ticker}: ${error.message}`);
  }
  const quote = primaryQuotes.find(item => item.symbol === ticker);

  if (!quote) {
    throw new Error(`Ticker ${ticker} quote lookup failed.`);
  }

  let summary = null;
  try {
    summary = await fetchYahooSummary(ticker);
  } catch (error) {
    if (options.strict) {
      throw new Error(`Failed to load summary data for ${ticker} in strict mode: ${error.message}`);
    }
  }
  if (!summary && options.strict) {
    throw new Error(`Ticker ${ticker} summary data is unavailable in strict mode.`);
  }

  const sectorText = `${summary && summary.assetProfile ? summary.assetProfile.sector || '' : ''} ${
    summary && summary.assetProfile ? summary.assetProfile.industry || '' : ''
  }`;

  const peers = choosePeers(ticker, sectorText);
  const peerQuotes = await fetchYahooQuote(peers);

  const { stock, metadata } = buildStockJson({
    ticker,
    secEntry,
    quote,
    summary,
    peerQuotes,
    options,
  });

  const validationErrors = validateStock(stock, { expectedTicker: ticker });
  if (validationErrors.length > 0) {
    throw new Error(`Generated JSON validation failed: ${validationErrors.join('; ')}`);
  }

  const stockPath = path.join(dataDir, `${ticker}.json`);
  const sourcePath = path.join(sourceDir, `${ticker}.sources.json`);

  if (!options.force && !options.dryRun && fs.existsSync(stockPath)) {
    throw new Error(`File already exists: ${path.relative(repoRoot, stockPath)} (use --force to overwrite)`);
  }

  const sourceManifest = buildSourceManifest({
    ticker,
    resolvedBy: resolution.resolution,
    requestedName: options.name,
    options,
    metadata,
    secEntry,
  });

  if (!options.dryRun) {
    writeJsonAtomic(stockPath, stock);
    writeJsonAtomic(sourcePath, sourceManifest);

    if (options.buildIndex) {
      runBuildIndex(repoRoot);
    }
  }

  return {
    ticker,
    stockPath,
    sourcePath,
    resolution: resolution.resolution,
    options,
    placeholders: metadata.placeholders,
    criticalIssues: metadata.criticalChecks,
    dryRun: options.dryRun,
  };
}

module.exports = {
  generateStockReport,
  parseArgs,
};
