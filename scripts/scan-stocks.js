#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { getPreset, listPresets } = require('./lib/scanner/presets');
const { fetchScreenerResults } = require('./lib/scanner/finviz');
const { scoreCandidate } = require('./lib/scanner/scorer');
const { fetchYahooQuote, fetchYahooSummary, readLocalKnownStocks, pickRaw } = require('./lib/generator/sources');
const { toQuarterlySeries } = require('./lib/financials');

function printHelp() {
  console.log('Usage: npm run scan:stocks -- [options]');
  console.log('');
  console.log('Options:');
  console.log('  --preset <name>     Filter preset (default: turnaround-growth)');
  console.log('  --top <n>           Number of top candidates to output (default: 5)');
  console.log('  --generate          Auto-generate reports for top candidates');
  console.log('  --build-index       Rebuild index after generation');
  console.log('  --dry-run           Print results without writing files');
  console.log('  --list-presets      Show available presets');
  console.log('  -h, --help          Show this help');
}

function parseArgs(argv) {
  const options = {
    preset: 'turnaround-growth',
    top: 5,
    generate: false,
    buildIndex: false,
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--preset') { options.preset = String(argv[++i] || '').trim(); continue; }
    if (arg === '--top') { options.top = parseInt(argv[++i], 10) || 5; continue; }
    if (arg === '--generate') { options.generate = true; continue; }
    if (arg === '--build-index') { options.buildIndex = true; continue; }
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--list-presets') {
      listPresets().forEach(p => console.log(`  ${p.name}: ${p.description}`));
      process.exit(0);
    }
    if (arg === '-h' || arg === '--help') { printHelp(); process.exit(0); }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function enrichWithYahooData(ticker) {
  const quotes = await fetchYahooQuote([ticker]);
  const quote = quotes.find(q => q.symbol === ticker) || null;

  let summary = null;
  try {
    summary = await fetchYahooSummary(ticker);
  } catch (_) {
    // summary is optional for scoring
  }

  const financialData = summary && summary.financialData || {};
  const quarters = toQuarterlySeries(summary);

  return {
    ticker,
    companyName: quote ? (quote.longName || quote.shortName || ticker) : ticker,
    quarters,
    financialData: {
      freeCashflow: Number.isFinite(pickRaw(financialData.freeCashflow)) ? pickRaw(financialData.freeCashflow) : null,
      totalCash: Number.isFinite(pickRaw(financialData.totalCash)) ? pickRaw(financialData.totalCash) : null,
      totalDebt: Number.isFinite(pickRaw(financialData.totalDebt)) ? pickRaw(financialData.totalDebt) : null,
    },
    quote: {
      trailingPE: quote ? quote.trailingPE : null,
      forwardPE: quote ? quote.forwardPE : null,
      priceToSalesTrailing12Months: quote ? quote.priceToSalesTrailing12Months : null,
      regularMarketPrice: quote ? quote.regularMarketPrice : null,
      fiftyTwoWeekHigh: quote ? quote.fiftyTwoWeekHigh : null,
      marketCap: quote ? quote.marketCap : null,
    },
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  const preset = getPreset(options.preset);

  if (!preset) {
    console.error(`Unknown preset: ${options.preset}. Available: ${listPresets().map(p => p.name).join(', ')}`);
    process.exit(1);
  }

  console.log(`Scanning with preset: ${preset.name} — ${preset.description}`);

  // Phase 1: Finviz screening
  console.log('Phase 1: Fetching Finviz screener results...');
  let candidates;
  try {
    candidates = await fetchScreenerResults(preset.finvizFilters);
  } catch (error) {
    console.error(`Finviz screening failed: ${error.message}`);
    process.exit(1);
  }
  console.log(`  Found ${candidates.length} candidates from Finviz`);

  // Exclude existing stocks
  const repoRoot = path.join(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');
  const existingStocks = readLocalKnownStocks(dataDir);
  const existingTickers = new Set(existingStocks.map(s => s.ticker));

  const excluded = candidates.filter(c => existingTickers.has(c.ticker));
  const newCandidates = candidates.filter(c => !existingTickers.has(c.ticker));
  console.log(`  Excluded ${excluded.length} existing stocks: ${excluded.map(c => c.ticker).join(', ') || 'none'}`);
  console.log(`  New candidates: ${newCandidates.length}`);

  if (newCandidates.length === 0) {
    console.log('No new candidates found. Try adjusting the preset filters.');
    process.exit(0);
  }

  // Phase 2: Enrich with Yahoo Finance data + score
  console.log('Phase 2: Enriching candidates with Yahoo Finance data...');
  const scored = [];

  for (const candidate of newCandidates) {
    try {
      console.log(`  Scoring ${candidate.ticker}...`);
      const data = await enrichWithYahooData(candidate.ticker);
      const score = scoreCandidate(data);
      scored.push({
        ticker: candidate.ticker,
        company: data.companyName || candidate.company,
        marketCap: data.quote.marketCap,
        trailingPE: data.quote.trailingPE,
        quantScore: score.total,
        criteria: score.criteria,
      });
    } catch (error) {
      console.warn(`  Skipping ${candidate.ticker}: ${error.message}`);
    }

    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Sort by score descending
  scored.sort((a, b) => b.quantScore - a.quantScore);
  const topCandidates = scored.slice(0, options.top);

  // Save scan results
  const today = new Date().toISOString().slice(0, 10);
  const scanResult = {
    scanDate: today,
    preset: preset.name,
    filters: preset.criteria,
    totalFound: candidates.length,
    excludedExisting: excluded.map(c => c.ticker),
    candidates: scored.map(c => ({
      ticker: c.ticker,
      company: c.company,
      marketCap: c.marketCap,
      trailingPE: c.trailingPE,
      quantScore: c.quantScore,
    })),
    topPicks: topCandidates.map(c => c.ticker),
  };

  const scanDir = path.join(dataDir, 'scan-results');
  const scanPath = path.join(scanDir, `${today}-scan.json`);

  if (!options.dryRun) {
    fs.mkdirSync(scanDir, { recursive: true });
    fs.writeFileSync(scanPath, JSON.stringify(scanResult, null, 2) + '\n', 'utf8');
    console.log(`\nScan results saved to ${path.relative(repoRoot, scanPath)}`);
  }

  // Print results
  console.log(`\n=== Top ${topCandidates.length} Candidates ===`);
  topCandidates.forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.ticker} (${c.company}) — Score: ${c.quantScore}/100`);
    c.criteria.forEach(cr => {
      console.log(`     ${cr.id}: ${cr.score}/${cr.weight} [${cr.status}]`);
    });
  });

  // Auto-generate reports if --generate flag
  if (options.generate && !options.dryRun) {
    const { generateStockReport } = require('./lib/generator');
    console.log('\nGenerating reports for top candidates...');

    for (const candidate of topCandidates) {
      try {
        console.log(`  Generating report for ${candidate.ticker}...`);
        const result = await generateStockReport({
          ticker: candidate.ticker,
          strict: false,
          allowPlaceholders: true,
          force: false,
          buildIndex: false,
        });
        console.log(`  Done: ${result.ticker} -> ${result.stockPath}`);
      } catch (error) {
        console.warn(`  Failed ${candidate.ticker}: ${error.message}`);
      }
    }

    if (options.buildIndex) {
      const { execSync } = require('node:child_process');
      console.log('\nValidating and rebuilding index...');
      execSync('npm run validate:stocks', { cwd: repoRoot, stdio: 'inherit' });
      execSync('npm run build:index', { cwd: repoRoot, stdio: 'inherit' });
    }
  }

  return scanResult;
}

main().catch(error => {
  console.error(`scan-stocks failed: ${error.message}`);
  process.exit(1);
});
