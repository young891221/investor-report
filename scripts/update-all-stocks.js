#!/usr/bin/env node

const path = require('node:path');
const { execSync } = require('node:child_process');
const { readLocalKnownStocks } = require('./lib/generator/sources');
const { generateStockReport } = require('./lib/generator');

function printHelp() {
  console.log('Usage: npm run update:all -- [options]');
  console.log('');
  console.log('Options:');
  console.log('  --force           Overwrite existing reports for today');
  console.log('  --build-index     Validate and rebuild index after all updates');
  console.log('  --dry-run         Print what would be updated without writing');
  console.log('  --ticker <T>      Update only specific ticker(s), comma-separated');
  console.log('  -h, --help        Show this help');
}

function parseArgs(argv) {
  const options = {
    force: false,
    buildIndex: false,
    dryRun: false,
    tickers: [],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--force') { options.force = true; continue; }
    if (arg === '--build-index') { options.buildIndex = true; continue; }
    if (arg === '--dry-run') { options.dryRun = true; continue; }
    if (arg === '--ticker') {
      const val = String(argv[++i] || '');
      options.tickers.push(...val.split(',').map(t => t.trim().toUpperCase()).filter(Boolean));
      continue;
    }
    if (arg === '-h' || arg === '--help') { printHelp(); process.exit(0); }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);
  const repoRoot = path.join(__dirname, '..');
  const dataDir = path.join(repoRoot, 'data');

  const allStocks = readLocalKnownStocks(dataDir);
  let targets = allStocks;

  if (options.tickers.length > 0) {
    const tickerSet = new Set(options.tickers);
    targets = allStocks.filter(s => tickerSet.has(s.ticker));
    const found = targets.map(s => s.ticker);
    const missing = options.tickers.filter(t => !found.includes(t));
    if (missing.length > 0) {
      console.warn(`Warning: tickers not found in data/: ${missing.join(', ')}`);
    }
  }

  console.log(`Updating ${targets.length} stock(s): ${targets.map(s => s.ticker).join(', ')}`);

  const results = { success: [], failed: [], skipped: [] };

  for (const stock of targets) {
    try {
      console.log(`\n--- ${stock.ticker} (${stock.companyNameEn || stock.companyName}) ---`);

      if (options.dryRun) {
        console.log('  [dry-run] Would generate report');
        results.skipped.push(stock.ticker);
        continue;
      }

      const result = await generateStockReport({
        ticker: stock.ticker,
        strict: false,
        allowPlaceholders: true,
        force: options.force,
        buildIndex: false,
      });

      console.log(`  Done: ${result.stockPath}`);
      if (result.placeholders.length > 0) {
        console.log(`  Placeholders: ${result.placeholders.length}`);
      }
      results.success.push(stock.ticker);
    } catch (error) {
      console.warn(`  Failed: ${error.message}`);
      results.failed.push(stock.ticker);
    }

    // Rate limit between stocks
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  console.log('\n=== Summary ===');
  console.log(`  Success: ${results.success.length} — ${results.success.join(', ') || 'none'}`);
  console.log(`  Failed: ${results.failed.length} — ${results.failed.join(', ') || 'none'}`);
  if (results.skipped.length > 0) {
    console.log(`  Skipped (dry-run): ${results.skipped.length}`);
  }

  if (options.buildIndex && !options.dryRun && results.success.length > 0) {
    console.log('\nValidating and rebuilding index...');
    execSync('npm run validate:stocks', { cwd: repoRoot, stdio: 'inherit' });
    execSync('npm run build:index', { cwd: repoRoot, stdio: 'inherit' });
  }
}

main().catch(error => {
  console.error(`update-all-stocks failed: ${error.message}`);
  process.exit(1);
});
