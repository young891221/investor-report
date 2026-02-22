# Stock Analysis Automation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add automated stock discovery (Finviz screening + Claude qualitative evaluation) and batch update of existing stocks via Claude Code workflows.

**Architecture:** Hybrid pipeline — Phase 1 scrapes Finviz for 20-30 candidates matching 100x-book-v1 quantitative criteria, Phase 2 enriches each with Yahoo Finance data and Claude qualitative research (founder_led), then the top 5 flow into the existing `generate-stock.js` pipeline. A separate `update-all-stocks.js` script re-runs generation for every stock in `data/index.json`.

**Tech Stack:** Node.js 20, native `https` module (existing `http.js` helpers), existing `generate-stock.js` pipeline, Finviz HTML parsing, Yahoo Finance API.

---

### Task 1: Create filter presets module

**Files:**
- Create: `scripts/lib/scanner/presets.js`
- Test: `scripts/lib/scanner/presets.test.js`

**Step 1: Write the failing test**

```js
// scripts/lib/scanner/presets.test.js
const { getPreset, listPresets } = require('./presets');

// Test: returns small-cap-growth preset with correct filters
const preset = getPreset('small-cap-growth');
console.assert(preset !== null, 'preset should exist');
console.assert(preset.name === 'small-cap-growth', `expected small-cap-growth, got ${preset.name}`);
console.assert(typeof preset.finvizFilters === 'string', 'finvizFilters should be a string');
console.assert(preset.finvizFilters.includes('cap_'), 'should include cap_ filter');
console.assert(preset.finvizFilters.includes('fa_roe_'), 'should include ROE filter');
console.assert(preset.finvizFilters.includes('fa_pe_'), 'should include PE filter');
console.assert(typeof preset.description === 'string', 'should have description');

// Test: listPresets returns array with at least 1 entry
const presets = listPresets();
console.assert(Array.isArray(presets), 'should return array');
console.assert(presets.length >= 1, 'should have at least 1 preset');

// Test: unknown preset returns null
const unknown = getPreset('nonexistent');
console.assert(unknown === null, 'unknown preset should return null');

console.log('presets.test.js: all passed');
```

**Step 2: Run test to verify it fails**

Run: `node scripts/lib/scanner/presets.test.js`
Expected: FAIL with "Cannot find module './presets'"

**Step 3: Write minimal implementation**

```js
// scripts/lib/scanner/presets.js
const PRESETS = {
  'small-cap-growth': {
    name: 'small-cap-growth',
    description: '소형주 성장주 — 시총 $300M~$10B, ROE>10%, P/E<50, EPS성장>15%',
    finvizFilters: 'cap_smallover,cap_smallunder,fa_roe_o10,fa_pe_u50,fa_epsyoy1_o15,geo_usa',
    finvizUrl: 'https://finviz.com/screener.ashx?v=111&f=cap_smallover,fa_roe_o10,fa_pe_u50,fa_epsyoy1_o15,geo_usa&ft=4',
    criteria: {
      marketCapMin: 300e6,
      marketCapMax: 10e9,
      roeMin: 10,
      peMax: 50,
      epsGrowthMin: 15,
      country: 'USA',
    },
  },
};

function getPreset(name) {
  return PRESETS[name] || null;
}

function listPresets() {
  return Object.values(PRESETS);
}

module.exports = { getPreset, listPresets };
```

**Step 4: Run test to verify it passes**

Run: `node scripts/lib/scanner/presets.test.js`
Expected: "presets.test.js: all passed"

**Step 5: Commit**

```bash
git add scripts/lib/scanner/presets.js scripts/lib/scanner/presets.test.js
git commit -m "feat(scanner): add filter presets module for Finviz screening"
```

---

### Task 2: Create Finviz HTML parser module

**Files:**
- Create: `scripts/lib/scanner/finviz.js`
- Test: `scripts/lib/scanner/finviz.test.js`
- Reference: `scripts/lib/generator/http.js` (reuse `getJson`/`withRetry` pattern but for HTML)

**Step 1: Write the failing test**

```js
// scripts/lib/scanner/finviz.test.js
const { parseFinvizTable, buildScreenerUrl } = require('./finviz');

// Test: buildScreenerUrl constructs correct URL
const url = buildScreenerUrl('cap_smallover,fa_roe_o10', 1);
console.assert(url.includes('finviz.com/screener.ashx'), 'should include finviz base');
console.assert(url.includes('cap_smallover'), 'should include filters');
console.assert(url.includes('r=1'), 'should include page offset');

// Test: parseFinvizTable extracts tickers from sample HTML
const sampleHtml = `
<table>
<tr class="styled-row">
<td class="screener-body-table-nw"><a class="screener-link-primary" href="quote.ashx?t=PLTR">PLTR</a></td>
<td>Palantir Technologies Inc</td>
<td>Technology</td>
<td>$8.2B</td>
</tr>
<tr class="styled-row">
<td class="screener-body-table-nw"><a class="screener-link-primary" href="quote.ashx?t=SNOW">SNOW</a></td>
<td>Snowflake Inc</td>
<td>Technology</td>
<td>$5.1B</td>
</tr>
</table>
`;

const results = parseFinvizTable(sampleHtml);
console.assert(Array.isArray(results), 'should return array');
console.assert(results.length === 2, `expected 2 results, got ${results.length}`);
console.assert(results[0].ticker === 'PLTR', `expected PLTR, got ${results[0].ticker}`);
console.assert(results[1].ticker === 'SNOW', `expected SNOW, got ${results[1].ticker}`);

// Test: empty HTML returns empty array
const empty = parseFinvizTable('<html><body>No results</body></html>');
console.assert(empty.length === 0, 'should return empty for no results');

console.log('finviz.test.js: all passed');
```

**Step 2: Run test to verify it fails**

Run: `node scripts/lib/scanner/finviz.test.js`
Expected: FAIL with "Cannot find module './finviz'"

**Step 3: Write minimal implementation**

```js
// scripts/lib/scanner/finviz.js
const https = require('node:https');

const BASE_URL = 'https://finviz.com/screener.ashx';
const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 investor-report-scanner/1.0';

function buildScreenerUrl(filters, startRow) {
  const row = typeof startRow === 'number' ? startRow : 1;
  return `${BASE_URL}?v=111&f=${encodeURIComponent(filters)}&r=${row}&ft=4`;
}

function parseFinvizTable(html) {
  const results = [];
  // Match ticker links: <a class="screener-link-primary" href="quote.ashx?t=TICKER">TICKER</a>
  const tickerPattern = /href="quote\.ashx\?t=([A-Z]{1,5})"/g;
  const seen = new Set();
  let match;

  while ((match = tickerPattern.exec(html)) !== null) {
    const ticker = match[1];
    if (!seen.has(ticker)) {
      seen.add(ticker);
      results.push({ ticker });
    }
  }

  // Try to enrich with company names from the table rows
  // Pattern: ticker link followed by company name in next <td>
  const rowPattern = /quote\.ashx\?t=([A-Z]{1,5})">[^<]+<\/a>\s*<\/td>\s*<td[^>]*>([^<]+)<\/td>/g;
  const nameMap = new Map();

  while ((match = rowPattern.exec(html)) !== null) {
    nameMap.set(match[1], match[2].trim());
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
  const maxPages = 3; // Max 60 results (20 per page)

  for (let i = 0; i < maxPages; i++) {
    const url = buildScreenerUrl(filters, page);
    let html;
    try {
      html = await fetchHtml(url);
    } catch (error) {
      if (i === 0) throw error; // First page must succeed
      break;
    }

    const pageResults = parseFinvizTable(html);
    if (pageResults.length === 0) break;

    allResults.push(...pageResults);
    page += 20;

    // Rate limit: wait 1s between pages
    if (i < maxPages - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // Deduplicate
  const seen = new Set();
  return allResults.filter(item => {
    if (seen.has(item.ticker)) return false;
    seen.add(item.ticker);
    return true;
  });
}

module.exports = { buildScreenerUrl, parseFinvizTable, fetchScreenerResults, fetchHtml };
```

**Step 4: Run test to verify it passes**

Run: `node scripts/lib/scanner/finviz.test.js`
Expected: "finviz.test.js: all passed"

**Step 5: Commit**

```bash
git add scripts/lib/scanner/finviz.js scripts/lib/scanner/finviz.test.js
git commit -m "feat(scanner): add Finviz HTML parser and screener URL builder"
```

---

### Task 3: Create 100x-book-v1 automatic scorer module

**Files:**
- Create: `scripts/lib/scanner/scorer.js`
- Test: `scripts/lib/scanner/scorer.test.js`
- Reference: `scripts/lib/generator/builder.js:351-648` (existing `buildHundredBaggerScore` and criterion functions)

This module reuses the scoring logic from `builder.js` but operates on raw Yahoo Finance data instead of the full stock JSON context. The key insight: `builder.js` already has `scoreSmallCapCriterion`, `scoreRoeCriterion`, `scoreReinvestmentCriterion`, `scorePerCriterion`, and `scoreFounderCriterion`. The scorer wraps these for the scanner pipeline.

**Step 1: Write the failing test**

```js
// scripts/lib/scanner/scorer.test.js
const { scoreCandidate } = require('./scorer');

// Test: scores a strong candidate correctly
const strong = scoreCandidate({
  marketCap: 5e9,          // $5B — good for small_cap
  roePct: 17,              // 17% — ideal range for roe_quality
  revenueGrowthPct: 30,    // 30% — strong reinvestment
  freeCashflow: 200e6,     // $200M positive
  netCash: 500e6,          // positive
  currentRatio: 2.0,       // healthy
  trailingPE: 25,          // in 8-30 range
  forwardPE: 20,           // in 8-30 range
  companyOfficers: [{ title: 'Founder, CEO & Chairman' }],
  insiderOwnershipPct: 12,
});

console.assert(strong.total >= 70, `strong candidate should score >=70, got ${strong.total}`);
console.assert(strong.criteria.length === 5, 'should have 5 criteria');
console.assert(strong.criteria[0].id === 'small_cap', 'first criterion should be small_cap');

// Test: scores a weak candidate correctly
const weak = scoreCandidate({
  marketCap: 200e9,        // too large
  roePct: -5,              // negative
  revenueGrowthPct: -10,   // declining
  freeCashflow: -100e6,    // negative
  netCash: -500e6,         // net debt
  currentRatio: 0.5,       // low
  trailingPE: 100,         // very high
  forwardPE: 80,           // very high
  companyOfficers: [],
  insiderOwnershipPct: null,
});

console.assert(weak.total <= 40, `weak candidate should score <=40, got ${weak.total}`);

// Test: handles missing data gracefully (neutral scores)
const missing = scoreCandidate({});
console.assert(missing.total >= 30 && missing.total <= 60, `missing data should get neutral score, got ${missing.total}`);
console.assert(missing.criteria.every(c => c.status === 'unknown' || typeof c.status === 'string'), 'should have valid statuses');

console.log('scorer.test.js: all passed');
```

**Step 2: Run test to verify it fails**

Run: `node scripts/lib/scanner/scorer.test.js`
Expected: FAIL with "Cannot find module './scorer'"

**Step 3: Write minimal implementation**

The scorer module re-exports the scoring functions from `builder.js` and wraps them in a `scoreCandidate` function.

```js
// scripts/lib/scanner/scorer.js
const path = require('node:path');

// Reuse the existing scoring functions from builder.js
// builder.js exports buildStockJson, choosePeers, formatDateIsoKst
// but the individual score functions are not exported.
// We need to either: (a) extract them into a shared module, or (b) duplicate.
// Option (a) is cleaner but requires modifying builder.js exports.
// For now, we import builder and access the scoring via buildHundredBaggerScore
// pattern — but that function is internal. So we extract the scoring logic.

// The scoring functions from builder.js are not exported individually.
// We replicate the scoring logic here, using the same algorithm.
// This is acceptable because the scorer needs to work on raw API data
// without the full buildStockJson pipeline.

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function formatCompactDollar(value) {
  if (!Number.isFinite(value)) return '-';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${round(value / 1e12, 1)}T`;
  if (abs >= 1e9) return `$${round(value / 1e9, 1)}B`;
  if (abs >= 1e6) return `$${round(value / 1e6, 1)}M`;
  return `$${round(value, 0)}`;
}

const WEIGHTS = { small_cap: 25, roe_quality: 20, reinvestment: 20, reasonable_per: 20, founder_led: 15 };

function neutralScore(weight) { return Math.round(weight / 2); }

function statusFromScore(score, weight) {
  if (!Number.isFinite(score) || !Number.isFinite(weight) || weight <= 0) return 'unknown';
  if (score >= Math.round(weight * 0.75)) return 'pass';
  if (score >= Math.round(weight * 0.45)) return 'watch';
  return 'fail';
}

function scoreSmallCap(marketCap) {
  const w = WEIGHTS.small_cap;
  if (!Number.isFinite(marketCap)) return { id: 'small_cap', label: '시가총액이 작고 성장 여력이 큼', weight: w, score: neutralScore(w), status: 'unknown', evidence: '시가총액 데이터 미확보' };
  let s = 4;
  if (marketCap < 2e10) s = w;
  else if (marketCap < 3e10) s = 18;
  else if (marketCap < 5e10) s = 12;
  else if (marketCap < 1e11) s = 7;
  return { id: 'small_cap', label: '시가총액이 작고 성장 여력이 큼', weight: w, score: s, status: statusFromScore(s, w), evidence: `시가총액 ${formatCompactDollar(marketCap)}` };
}

function scoreRoe(roePct) {
  const w = WEIGHTS.roe_quality;
  if (!Number.isFinite(roePct)) return { id: 'roe_quality', label: 'ROE 15~20% 고수익 구조', weight: w, score: neutralScore(w), status: 'unknown', evidence: 'ROE 데이터 미확보' };
  let s = 6;
  if (roePct >= 15 && roePct <= 20) s = w;
  else if ((roePct >= 12 && roePct < 15) || (roePct > 20 && roePct <= 25)) s = 16;
  else if ((roePct >= 8 && roePct < 12) || (roePct > 25 && roePct <= 30)) s = 12;
  else if ((roePct >= 0 && roePct < 8) || (roePct > 30 && roePct <= 40)) s = 7;
  else if (roePct < 0) s = 2;
  return { id: 'roe_quality', label: 'ROE 15~20% 고수익 구조', weight: w, score: s, status: statusFromScore(s, w), evidence: `ROE ${round(roePct, 2)}%` };
}

function scoreReinvestment(input) {
  const w = WEIGHTS.reinvestment;
  const growthPct = Number.isFinite(input.revenueGrowthPct) ? input.revenueGrowthPct : null;
  const fcf = input.freeCashflow;
  const nc = input.netCash;
  const cr = input.currentRatio;
  let total = 0, count = 0;
  const parts = [];

  if (Number.isFinite(growthPct)) {
    if (growthPct >= 25) total += 10; else if (growthPct >= 15) total += 8; else if (growthPct >= 5) total += 6; else if (growthPct >= 0) total += 5; else total += 3;
    count++; parts.push(`성장률 ${round(growthPct, 1)}%`);
  }
  if (Number.isFinite(fcf)) {
    total += fcf > 0 ? 8 : fcf === 0 ? 6 : 4;
    count++; parts.push(`FCF ${formatCompactDollar(fcf)}`);
  }
  if (Number.isFinite(nc) || Number.isFinite(cr)) {
    let bs = 3;
    if (Number.isFinite(nc) && nc > 0 && Number.isFinite(cr) && cr >= 1.5) bs = 8;
    else if ((Number.isFinite(nc) && nc > 0) || (Number.isFinite(cr) && cr >= 1.5)) bs = 6;
    else if (Number.isFinite(cr) && cr >= 1) bs = 5;
    total += bs; count++;
  }

  if (count === 0) return { id: 'reinvestment', label: '이익의 효율적 재투자(복리)', weight: w, score: neutralScore(w), status: 'unknown', evidence: '데이터 미확보' };
  const s = clamp(Math.round((total / count / 10) * w), 0, w);
  return { id: 'reinvestment', label: '이익의 효율적 재투자(복리)', weight: w, score: s, status: statusFromScore(s, w), evidence: parts.join(' · ') };
}

function scorePer(trailingPE, forwardPE) {
  const w = WEIGHTS.reasonable_per;
  const pe = Number.isFinite(trailingPE) && trailingPE > 0 ? trailingPE : Number.isFinite(forwardPE) && forwardPE > 0 ? forwardPE : null;
  if (!Number.isFinite(pe)) return { id: 'reasonable_per', label: 'PER이 과열되지 않은 안전마진', weight: w, score: neutralScore(w), status: 'unknown', evidence: 'PER 데이터 미확보' };
  let s = 4;
  if (pe <= 0) s = 4;
  else if (pe >= 8 && pe <= 30) s = w;
  else if ((pe >= 5 && pe < 8) || (pe > 30 && pe <= 40)) s = 14;
  else if ((pe >= 2 && pe < 5) || (pe > 40 && pe <= 60)) s = 8;
  return { id: 'reasonable_per', label: 'PER이 과열되지 않은 안전마진', weight: w, score: s, status: statusFromScore(s, w), evidence: `P/E ${round(pe, 2)}x` };
}

function scoreFounder(companyOfficers, insiderOwnershipPct) {
  const w = WEIGHTS.founder_led;
  const officers = Array.isArray(companyOfficers) ? companyOfficers : [];
  const ceoPattern = /(chief executive officer|ceo)/i;
  const founderPattern = /(founder|co-founder|cofounder|founding)/i;
  let isFounderCeo = null;

  for (const o of officers) {
    const title = String(o && o.title || '');
    if (ceoPattern.test(title)) {
      isFounderCeo = founderPattern.test(title);
      break;
    }
  }

  const hasInsider = Number.isFinite(insiderOwnershipPct);
  if (isFounderCeo === null && !hasInsider) return { id: 'founder_led', label: '창업자 주도 운영', weight: w, score: neutralScore(w), status: 'unknown', evidence: '데이터 미확보' };

  let s = 5;
  if (isFounderCeo && hasInsider && insiderOwnershipPct >= 5) s = w;
  else if (isFounderCeo) s = 13;
  else if (hasInsider && insiderOwnershipPct >= 8) s = 10;
  else if (hasInsider && insiderOwnershipPct >= 3) s = 8;
  else if (isFounderCeo === false && !hasInsider) s = 6;

  return { id: 'founder_led', label: '창업자 주도 운영', weight: w, score: s, status: statusFromScore(s, w), evidence: `Founder CEO: ${isFounderCeo === true ? '예' : isFounderCeo === false ? '아니오' : '미확인'}, 내부자 지분: ${hasInsider ? `${round(insiderOwnershipPct, 2)}%` : '미확인'}` };
}

function scoreCandidate(data) {
  const criteria = [
    scoreSmallCap(data.marketCap),
    scoreRoe(data.roePct),
    scoreReinvestment({
      revenueGrowthPct: data.revenueGrowthPct,
      freeCashflow: data.freeCashflow,
      netCash: data.netCash,
      currentRatio: data.currentRatio,
    }),
    scorePer(data.trailingPE, data.forwardPE),
    scoreFounder(data.companyOfficers, data.insiderOwnershipPct),
  ];

  const total = clamp(criteria.reduce((sum, c) => sum + c.score, 0), 0, 100);
  return { model: '100x-book-v1', total, criteria };
}

module.exports = { scoreCandidate };
```

**Step 4: Run test to verify it passes**

Run: `node scripts/lib/scanner/scorer.test.js`
Expected: "scorer.test.js: all passed"

**Step 5: Commit**

```bash
git add scripts/lib/scanner/scorer.js scripts/lib/scanner/scorer.test.js
git commit -m "feat(scanner): add 100x-book-v1 automatic scorer for candidate ranking"
```

---

### Task 4: Create scan-stocks.js entry point script

**Files:**
- Create: `scripts/scan-stocks.js`
- Modify: `package.json` (add npm scripts)
- Reference: `scripts/generate-stock.js` (pattern for CLI entry), `scripts/lib/generator/sources.js:194-254` (fetchYahooQuote), `scripts/lib/generator/sources.js:256-280` (fetchYahooSummary), `scripts/lib/generator/index.js:42-118` (parseArgs pattern)

**Step 1: Write the scan-stocks entry point**

```js
#!/usr/bin/env node
// scripts/scan-stocks.js

const fs = require('node:fs');
const path = require('node:path');
const { getPreset, listPresets } = require('./lib/scanner/presets');
const { fetchScreenerResults } = require('./lib/scanner/finviz');
const { scoreCandidate } = require('./lib/scanner/scorer');
const { fetchYahooQuote, fetchYahooSummary, readLocalKnownStocks } = require('./lib/generator/sources');
const { pickRaw } = require('./lib/generator/sources');

function printHelp() {
  console.log('Usage: npm run scan:stocks -- [options]');
  console.log('');
  console.log('Options:');
  console.log('  --preset <name>     Filter preset (default: small-cap-growth)');
  console.log('  --top <n>           Number of top candidates to output (default: 5)');
  console.log('  --generate          Auto-generate reports for top candidates');
  console.log('  --build-index       Rebuild index after generation');
  console.log('  --dry-run           Print results without writing files');
  console.log('  --list-presets      Show available presets');
  console.log('  -h, --help          Show this help');
}

function parseArgs(argv) {
  const options = {
    preset: 'small-cap-growth',
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

function toPct(value) {
  if (!Number.isFinite(value)) return null;
  return Math.abs(value) <= 1 ? value * 100 : value;
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
  const defaultKeyStats = summary && summary.defaultKeyStatistics || {};
  const assetProfile = summary && summary.assetProfile || {};

  const roePct = toPct(
    Number.isFinite(pickRaw(financialData.returnOnEquity))
      ? pickRaw(financialData.returnOnEquity)
      : pickRaw(defaultKeyStats.returnOnEquity)
  );

  const revenueGrowthRaw = pickRaw(financialData.revenueGrowth);
  const revenueGrowthPct = Number.isFinite(revenueGrowthRaw)
    ? (Math.abs(revenueGrowthRaw) <= 1 ? revenueGrowthRaw * 100 : revenueGrowthRaw)
    : null;

  return {
    ticker,
    marketCap: quote ? quote.marketCap : null,
    trailingPE: quote ? quote.trailingPE : null,
    forwardPE: quote ? quote.forwardPE : null,
    roePct,
    revenueGrowthPct,
    freeCashflow: Number.isFinite(pickRaw(financialData.freeCashflow)) ? pickRaw(financialData.freeCashflow) : null,
    netCash: (() => {
      const cash = pickRaw(financialData.totalCash);
      const debt = pickRaw(financialData.totalDebt);
      return Number.isFinite(cash) && Number.isFinite(debt) ? cash - debt : null;
    })(),
    currentRatio: Number.isFinite(pickRaw(financialData.currentRatio)) ? pickRaw(financialData.currentRatio) : null,
    companyOfficers: Array.isArray(assetProfile.companyOfficers) ? assetProfile.companyOfficers : [],
    insiderOwnershipPct: toPct(pickRaw(defaultKeyStats.heldPercentInsiders)),
    companyName: quote ? (quote.longName || quote.shortName || ticker) : ticker,
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
        marketCap: data.marketCap,
        roePct: data.roePct,
        trailingPE: data.trailingPE,
        revenueGrowthPct: data.revenueGrowthPct,
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
      roePct: c.roePct,
      trailingPE: c.trailingPE,
      revenueGrowthPct: c.revenueGrowthPct,
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
        console.log(`  ✓ ${result.ticker} → ${result.stockPath}`);
      } catch (error) {
        console.warn(`  ✗ ${candidate.ticker}: ${error.message}`);
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
```

**Step 2: Add npm scripts to package.json**

In `package.json`, add to `scripts`:

```json
"scan:stocks": "node scripts/scan-stocks.js",
"scan:stocks:generate": "node scripts/scan-stocks.js --generate --build-index"
```

**Step 3: Run to verify basic parsing works**

Run: `node scripts/scan-stocks.js --help`
Expected: Prints usage help

Run: `node scripts/scan-stocks.js --list-presets`
Expected: Lists "small-cap-growth" preset

**Step 4: Commit**

```bash
git add scripts/scan-stocks.js package.json
git commit -m "feat(scanner): add scan-stocks entry point with Finviz + Yahoo Finance pipeline"
```

---

### Task 5: Create update-all-stocks.js script

**Files:**
- Create: `scripts/update-all-stocks.js`
- Modify: `package.json` (add npm scripts)
- Reference: `scripts/lib/generator/index.js:218-381` (generateStockReport), `scripts/build-index.js:74-155` (index building), `scripts/lib/generator/sources.js:71-131` (readLocalKnownStocks)

**Step 1: Write the update-all-stocks script**

```js
#!/usr/bin/env node
// scripts/update-all-stocks.js

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

      console.log(`  ✓ Generated: ${result.stockPath}`);
      if (result.placeholders.length > 0) {
        console.log(`  ⚠ Placeholders: ${result.placeholders.length}`);
      }
      results.success.push(stock.ticker);
    } catch (error) {
      console.warn(`  ✗ Failed: ${error.message}`);
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
```

**Step 2: Add npm scripts to package.json**

Add to `scripts` in `package.json`:

```json
"update:all": "node scripts/update-all-stocks.js",
"update:all:force": "node scripts/update-all-stocks.js --force --build-index"
```

**Step 3: Verify help works**

Run: `node scripts/update-all-stocks.js --help`
Expected: Prints usage help

Run: `node scripts/update-all-stocks.js --dry-run`
Expected: Lists all 7 stocks with "[dry-run]" messages

**Step 4: Commit**

```bash
git add scripts/update-all-stocks.js package.json
git commit -m "feat(scanner): add update-all-stocks script for batch report refresh"
```

---

### Task 6: Create Claude Code workflow commands

**Files:**
- Create: `.claude/commands/scan-stocks.md`
- Create: `.claude/commands/update-all-stocks.md`
- Modify: `.claude/settings.local.json` (add Bash permissions)

**Step 1: Write the scan-stocks workflow**

```markdown
---
name: scan-stocks
description: Use when the user wants to discover new investment-worthy stocks by screening Finviz and scoring with 100x-book-v1 model (e.g. "종목 스캔 돌려줘", "유망 종목 찾아줘").
---

# Stock Scanner Workflow

Discover new investment-worthy stocks via Finviz screening + Claude qualitative evaluation.

**Input:** `$ARGUMENTS` (optional: preset name, e.g. "small-cap-growth")

## Workflow

### 1. Run Finviz Screening + Quantitative Scoring

Run the scanner script to get initial candidates:

```bash
node scripts/scan-stocks.js --preset small-cap-growth --top 10 --dry-run
```

Review the output: check how many candidates were found and their quantitative scores.

### 2. Qualitative Evaluation (Claude Research)

For each of the top 10 candidates from Step 1:

- Use WebSearch to research: **창업자 경영 여부, 내부자 지분율, 경쟁 우위(moat), 최근 뉴스**
- Evaluate the `founder_led` criterion (15 points):
  - Founder CEO + insider ownership > 10% → 15/15
  - Founder CEO, no insider data → 13/15
  - Non-founder CEO, insider > 8% → 10/15
  - Non-founder CEO, insider > 3% → 8/15
  - No data → 7/15 (neutral)

- Adjust the total score: quantScore + qualitative founder_led adjustment
- Re-rank and select the final top 5

### 3. Generate Reports for Top 5

For each of the final top 5 stocks, run:

```bash
node scripts/generate-stock.js --ticker {TICKER} --no-strict --allow-placeholders --build-index --force
```

Or run all at once:

```bash
node scripts/scan-stocks.js --preset small-cap-growth --top 5 --generate --build-index
```

### 4. Validate & Report

```bash
node scripts/validate-stocks.js
node scripts/build-index.js
```

Report:
- Total candidates screened
- Top 5 selected with scores and rationale
- Generated file paths
- Any placeholders or data quality warnings

## Notes

- This workflow combines automated quantitative screening with Claude's qualitative research
- The `founder_led` criterion requires manual research (WebSearch) and cannot be fully automated
- Run during earnings season (Jan, Apr, Jul, Oct) for best results
- Existing stocks in data/ are automatically excluded from candidates
```

**Step 2: Write the update-all-stocks workflow**

```markdown
---
name: update-all-stocks
description: Use when the user wants to refresh all existing stock reports with latest data (e.g. "전체 업데이트 돌려줘", "리포트 갱신해줘").
---

# Update All Stocks Workflow

Refresh all existing stock reports in the portfolio with the latest market data.

**Input:** `$ARGUMENTS` (optional: specific tickers, e.g. "TSLA,RKLB")

## Workflow

### 1. Check Current Portfolio

Review the current stocks in the portfolio:

```bash
node scripts/update-all-stocks.js --dry-run
```

### 2. Run Updates

If specific tickers were requested in `$ARGUMENTS`:

```bash
node scripts/update-all-stocks.js --ticker {TICKERS} --force --build-index
```

Otherwise, update all stocks:

```bash
node scripts/update-all-stocks.js --force --build-index
```

### 3. Validate & Report

```bash
node scripts/validate-stocks.js
node scripts/build-index.js
```

Report:
- Number of stocks updated successfully
- Any failures (with reasons)
- Placeholder warnings
- Index rebuild confirmation

## Notes

- Use `--force` to overwrite today's existing reports
- Best run during earnings season (Jan, Apr, Jul, Oct)
- Each stock update requires Yahoo Finance API calls; expect ~2 seconds per stock
- Failed stocks are skipped; remaining stocks continue
```

**Step 3: Update settings.local.json permissions**

Add to `.claude/settings.local.json` `allow` array:

```json
"Bash(node scripts/scan-stocks.js:*)",
"Bash(node scripts/update-all-stocks.js:*)"
```

**Step 4: Commit**

```bash
git add .claude/commands/scan-stocks.md .claude/commands/update-all-stocks.md .claude/settings.local.json
git commit -m "feat(workflow): add Claude Code commands for stock scanning and batch updates"
```

---

### Task 7: Integration test — dry run the full pipeline

**Files:**
- No new files
- Test: Run each script in dry-run mode to verify end-to-end wiring

**Step 1: Verify presets module**

Run: `node -e "const p = require('./scripts/lib/scanner/presets'); console.log(JSON.stringify(p.listPresets(), null, 2))"`
Expected: JSON output with `small-cap-growth` preset

**Step 2: Verify scorer module**

Run: `node -e "const s = require('./scripts/lib/scanner/scorer'); console.log(JSON.stringify(s.scoreCandidate({ marketCap: 5e9, roePct: 17, trailingPE: 25 }), null, 2))"`
Expected: JSON output with total score and 5 criteria

**Step 3: Verify scan-stocks dry run**

Run: `node scripts/scan-stocks.js --dry-run --top 3`
Expected: Fetches from Finviz, enriches with Yahoo Finance, prints top 3 candidates with scores (no files written)

**Step 4: Verify update-all-stocks dry run**

Run: `node scripts/update-all-stocks.js --dry-run`
Expected: Lists all 7 existing stocks with "[dry-run]" messages

**Step 5: Run all unit tests**

Run: `node scripts/lib/scanner/presets.test.js && node scripts/lib/scanner/finviz.test.js && node scripts/lib/scanner/scorer.test.js`
Expected: All three test files pass

**Step 6: Commit (if any fixes were needed)**

```bash
git add -A
git commit -m "fix(scanner): integration test fixes"
```

---

### Task 8: Update AGENTS.md with new skills

**Files:**
- Modify: `AGENTS.md`

**Step 1: Read current AGENTS.md**

Read: `AGENTS.md`

**Step 2: Add new skill entries**

Add to the Available Skills section:

```markdown
- scan-stocks: Discover new investment-worthy stocks via Finviz screening + 100x-book-v1 scoring.
  Trigger: "종목 스캔 돌려줘", "유망 종목 찾아줘", "새 종목 발굴해줘"
- update-all-stocks: Refresh all existing stock reports with latest market data.
  Trigger: "전체 업데이트 돌려줘", "리포트 갱신해줘", "실적 시즌 업데이트"
```

**Step 3: Commit**

```bash
git add AGENTS.md
git commit -m "docs: add scan-stocks and update-all-stocks skills to AGENTS.md"
```
