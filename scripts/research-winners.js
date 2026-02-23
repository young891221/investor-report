#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { fetchScreenerResults } = require('./lib/scanner/finviz');
const { fetchYahooSummary } = require('./lib/generator/sources');
const { toQuarterlySeries } = require('./lib/financials');

function parseArgs(argv) {
  const options = {
    minPerf: 100,
    top: 50,
    controlPerf: [-10, 10],
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--min-perf') { options.minPerf = parseInt(argv[++i], 10) || 100; continue; }
    if (arg === '--top') { options.top = parseInt(argv[++i], 10) || 50; continue; }
    if (arg === '--control-perf') {
      const parts = String(argv[++i] || '').split(',').map(Number);
      if (parts.length === 2 && parts.every(Number.isFinite)) options.controlPerf = parts;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      console.log('Usage: node scripts/research-winners.js [options]');
      console.log('  --min-perf <n>       Minimum 52-week performance % for winners (default: 100)');
      console.log('  --top <n>            Max number of winners to analyze (default: 50)');
      console.log('  --control-perf <a,b> 52-week perf range for control group (default: -10,10)');
      process.exit(0);
    }
  }

  return options;
}

function linearSlope(values) {
  const n = values.length;
  if (n < 2) return 0;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function computeSignals(quarters) {
  const signals = {
    revenueAcceleration: false,
    marginImproving: false,
    fcfPositive: false,
    netIncomeImproving: false,
    grossMarginExpanding: false,
  };

  if (!Array.isArray(quarters) || quarters.length < 4) return signals;

  // Revenue YoY acceleration
  const yoyRates = [];
  for (let i = 4; i < quarters.length; i++) {
    const cur = quarters[i].totalRevenue;
    const prev = quarters[i - 4].totalRevenue;
    if (Number.isFinite(cur) && Number.isFinite(prev) && prev !== 0) {
      yoyRates.push(((cur - prev) / Math.abs(prev)) * 100);
    }
  }
  if (yoyRates.length >= 2) {
    signals.revenueAcceleration = yoyRates[yoyRates.length - 1] > yoyRates[0];
  }

  // Operating margin trend
  const opMargins = quarters
    .filter(q => Number.isFinite(q.operatingIncome) && Number.isFinite(q.totalRevenue) && q.totalRevenue !== 0)
    .map(q => (q.operatingIncome / q.totalRevenue) * 100);
  if (opMargins.length >= 3) {
    signals.marginImproving = linearSlope(opMargins) > 0;
  }

  // Net income improving
  const netIncomes = quarters.map(q => q.netIncome).filter(Number.isFinite);
  if (netIncomes.length >= 3) {
    const mid = Math.floor(netIncomes.length / 2);
    const firstAvg = netIncomes.slice(0, mid).reduce((s, v) => s + v, 0) / mid;
    const secondAvg = netIncomes.slice(mid).reduce((s, v) => s + v, 0) / (netIncomes.length - mid);
    signals.netIncomeImproving = secondAvg > firstAvg;
  }

  // Gross margin expanding
  const grossMargins = quarters
    .filter(q => Number.isFinite(q.grossProfit) && Number.isFinite(q.totalRevenue) && q.totalRevenue !== 0)
    .map(q => (q.grossProfit / q.totalRevenue) * 100);
  if (grossMargins.length >= 3) {
    signals.grossMarginExpanding = linearSlope(grossMargins) > 0;
  }

  return signals;
}

async function fetchGroupData(tickers, label) {
  const results = [];
  for (const ticker of tickers) {
    try {
      process.stdout.write(`  ${label}: ${ticker}...`);
      const summary = await fetchYahooSummary(ticker);
      const quarters = toQuarterlySeries(summary);
      const signals = computeSignals(quarters);
      results.push({ ticker, quarters: quarters.length, signals });
      console.log(` ${quarters.length} quarters`);
    } catch (error) {
      console.log(` skipped (${error.message})`);
    }
    await new Promise(resolve => setTimeout(resolve, 800));
  }
  return results;
}

function prevalence(group, signalKey) {
  if (group.length === 0) return 0;
  const count = group.filter(item => item.signals[signalKey]).length;
  return Math.round((count / group.length) * 100);
}

async function main() {
  const argv = process.argv.slice(2);
  const options = parseArgs(argv);

  console.log(`Research Winners Analysis`);
  console.log(`  Min 52w perf: +${options.minPerf}%`);
  console.log(`  Control perf: ${options.controlPerf[0]}% to ${options.controlPerf[1]}%`);

  // Phase 1: Fetch winner tickers
  console.log('\nPhase 1: Fetching winner tickers from Finviz...');
  const winnerFilter = `ta_perf_52w_o${options.minPerf},cap_smallover`;
  let winnerCandidates;
  try {
    winnerCandidates = await fetchScreenerResults(winnerFilter);
  } catch (error) {
    console.error(`Winner screening failed: ${error.message}`);
    process.exit(1);
  }
  const winnerTickers = winnerCandidates.slice(0, options.top).map(c => c.ticker);
  console.log(`  Found ${winnerCandidates.length} winners, analyzing top ${winnerTickers.length}`);

  // Phase 2: Fetch control tickers
  console.log('\nPhase 2: Fetching control group from Finviz...');
  const [lo, hi] = options.controlPerf;
  const controlFilter = `ta_perf_52w_${lo < 0 ? 'd' : 'o'}${Math.abs(lo)}to${hi < 0 ? 'd' : 'o'}${Math.abs(hi)},cap_smallover`;
  let controlCandidates = [];
  try {
    controlCandidates = await fetchScreenerResults(controlFilter);
  } catch (error) {
    console.warn(`Control screening failed: ${error.message} — using empty control group`);
  }
  const controlTickers = controlCandidates.slice(0, options.top).map(c => c.ticker);
  console.log(`  Found ${controlCandidates.length} control stocks, analyzing top ${controlTickers.length}`);

  // Phase 3: Fetch Yahoo quarterly data
  console.log('\nPhase 3: Fetching Yahoo quarterly data for winners...');
  const winnersData = await fetchGroupData(winnerTickers, 'winner');

  console.log('\nPhase 4: Fetching Yahoo quarterly data for control...');
  const controlData = await fetchGroupData(controlTickers, 'control');

  // Phase 5: Compare signals
  const signalKeys = ['revenueAcceleration', 'marginImproving', 'fcfPositive', 'netIncomeImproving', 'grossMarginExpanding'];
  const signalComparison = {};
  for (const key of signalKeys) {
    signalComparison[key] = {
      winnersPrevalence: prevalence(winnersData, key),
      controlPrevalence: prevalence(controlData, key),
    };
  }

  const result = {
    researchDate: new Date().toISOString().slice(0, 10),
    parameters: {
      minPerf: options.minPerf,
      controlPerf: options.controlPerf,
    },
    sampleSize: {
      winners: winnersData.length,
      control: controlData.length,
    },
    signalComparison,
    winnerTickers: winnersData.map(w => w.ticker),
    controlTickers: controlData.map(c => c.ticker),
  };

  // Save results
  const repoRoot = path.join(__dirname, '..');
  const researchDir = path.join(repoRoot, 'data', 'research');
  fs.mkdirSync(researchDir, { recursive: true });
  const outPath = path.join(researchDir, 'winner-analysis.json');
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');

  console.log(`\n=== Signal Comparison ===`);
  for (const [key, values] of Object.entries(signalComparison)) {
    const diff = values.winnersPrevalence - values.controlPrevalence;
    console.log(`  ${key}: winners ${values.winnersPrevalence}% vs control ${values.controlPrevalence}% (diff: ${diff >= 0 ? '+' : ''}${diff}pp)`);
  }
  console.log(`\nResults saved to ${path.relative(repoRoot, outPath)}`);
}

main().catch(error => {
  console.error(`research-winners failed: ${error.message}`);
  process.exit(1);
});
