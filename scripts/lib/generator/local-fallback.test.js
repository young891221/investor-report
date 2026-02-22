const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildQuoteFromSnapshot,
  buildSummaryFromSnapshot,
  loadLatestLocalSnapshot,
  parseCompactDollar,
  parseWeekRange,
} = require('./local-fallback');

const repoRoot = path.join(__dirname, '..', '..', '..');

test('parseCompactDollar parses compact unit strings', () => {
  assert.equal(parseCompactDollar('$35.3B'), 35.3e9);
  assert.equal(parseCompactDollar('$1.54T'), 1.54e12);
  assert.equal(parseCompactDollar('$44,059M'), 44059e6);
});

test('parseWeekRange parses low/high values', () => {
  const range = parseWeekRange('$14.71 — $99.58');
  assert.equal(range.low, 14.71);
  assert.equal(range.high, 99.58);
});

test('loadLatestLocalSnapshot returns the newest report for ticker', () => {
  const snapshot = loadLatestLocalSnapshot(path.join(repoRoot, 'data'), 'RKLB');
  assert.ok(snapshot);
  assert.equal(snapshot.ticker, 'RKLB');
  assert.ok(snapshot.relativePath.startsWith('data/RKLB/'));
  assert.ok(snapshot.stock && snapshot.stock.ticker === 'RKLB');
});

test('buildQuoteFromSnapshot extracts quote-compatible payload from stock JSON', () => {
  const filePath = path.join(repoRoot, 'data', 'RKLB', 'RKLB-2026-02-18.json');
  const stock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const quote = buildQuoteFromSnapshot(stock, 'RKLB');

  assert.equal(quote.symbol, 'RKLB');
  assert.ok(Number.isFinite(quote.regularMarketPrice));
  assert.ok(Number.isFinite(quote.marketCap));
  assert.ok(Number.isFinite(quote.fiftyTwoWeekLow));
  assert.ok(Number.isFinite(quote.fiftyTwoWeekHigh));
});

test('buildSummaryFromSnapshot builds minimum summary structure with income rows', () => {
  const filePath = path.join(repoRoot, 'data', 'RKLB', 'RKLB-2026-02-18.json');
  const stock = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const summary = buildSummaryFromSnapshot(stock);

  assert.ok(summary.assetProfile);
  assert.ok(summary.financialData);
  assert.ok(summary.defaultKeyStatistics);
  assert.ok(summary.incomeStatementHistory);
  assert.ok(summary.incomeStatementHistoryQuarterly);
  assert.ok(Array.isArray(summary.incomeStatementHistory.incomeStatementHistory));
  assert.ok(Array.isArray(summary.incomeStatementHistoryQuarterly.incomeStatementHistory));
  assert.ok(summary.incomeStatementHistory.incomeStatementHistory.length >= 2);
});
