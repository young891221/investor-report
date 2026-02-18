#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const { readStockFiles, validateStock } = require('./lib/stock-validation');

const dataDir = path.join(__dirname, '..', 'data');
const indexPath = path.join(dataDir, 'index.json');

function toCardTags(stock) {
  const tags = [];

  if (Array.isArray(stock.segments)) {
    stock.segments.forEach(segment => {
      if (tags.length < 3 && segment && typeof segment.name === 'string') {
        tags.push(segment.name);
      }
    });
  }

  if (Array.isArray(stock.moats)) {
    stock.moats.forEach(moat => {
      if (tags.length < 3 && moat && typeof moat.name === 'string' && !tags.includes(moat.name)) {
        tags.push(moat.name);
      }
    });
  }

  if (tags.length === 0) {
    tags.push(stock.exchange, stock.sector);
  }

  return tags.slice(0, 3);
}

function toCardIndex(stock) {
  const rawChange = stock.marketCapChange || stock.priceChange || '-';
  const cleanChange = String(rawChange).replace(/\s*\([^)]*\)\s*$/u, '').trim();
  const changeDir = /▲|\+/u.test(cleanChange)
    ? 'up'
    : /▼|-/u.test(cleanChange)
      ? 'down'
      : stock.priceChangeDir;

  return {
    ticker: stock.ticker,
    name: stock.companyNameEn,
    nameKr: stock.companyName,
    price: stock.price,
    change: cleanChange,
    changeDir,
    changeBasis: stock.marketCapChange ? '52주' : '주가',
    sector: stock.sector,
    description: stock.description,
    tags: toCardTags(stock),
    rating: stock.analystRating,
    analysisDate: stock.analysisDate,
  };
}

function main() {
  let files;

  try {
    files = readStockFiles(dataDir);
  } catch (error) {
    console.error(`Failed to read stock JSON files: ${error.message}`);
    process.exit(1);
  }

  if (files.length === 0) {
    console.error('No stock files found in data/.');
    process.exit(1);
  }

  const allErrors = [];

  files.forEach(file => {
    const errors = validateStock(file.json, { expectedTicker: file.expectedTicker });
    if (errors.length > 0) {
      errors.forEach(error => {
        allErrors.push(`${file.file}: ${error}`);
      });
    }
  });

  if (allErrors.length > 0) {
    console.error('Stock validation failed. Fix the following issues before building index:');
    allErrors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }

  const index = files
    .map(file => file.json)
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
    .map(toCardIndex);

  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`Updated ${path.relative(process.cwd(), indexPath)} (${index.length} stock card(s)).`);
}

main();
