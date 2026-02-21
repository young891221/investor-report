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

function toChangeMeta(stock) {
  const rawChange = stock.marketCapChange || stock.priceChange || '-';
  const cleanChange = String(rawChange).replace(/\s*\([^)]*\)\s*$/u, '').trim();
  const changeDir = /▲|\+/u.test(cleanChange)
    ? 'up'
    : /▼|-/u.test(cleanChange)
      ? 'down'
      : stock.priceChangeDir;

  return {
    change: cleanChange,
    changeDir,
    changeBasis: stock.marketCapChange ? '52주' : '주가',
  };
}

function toReportIndex(stock, date) {
  const changeMeta = toChangeMeta(stock);

  return {
    date,
    price: stock.price,
    change: changeMeta.change,
    changeDir: changeMeta.changeDir,
    changeBasis: changeMeta.changeBasis,
    rating: stock.analystRating,
    href: `stock.html?ticker=${encodeURIComponent(stock.ticker)}&date=${encodeURIComponent(date)}`,
  };
}

function byDateDesc(left, right) {
  return String(right.date).localeCompare(String(left.date));
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
    const errors = validateStock(file.json, {
      expectedTicker: file.expectedTicker,
      expectedDate: file.expectedDate,
    });
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

  const grouped = new Map();

  files.forEach(file => {
    const stock = file.json;
    const ticker = String(stock.ticker || '').toUpperCase();
    const reportDate = file.expectedDate || stock.analysisDate;
    const snapshot = {
      stock,
      report: toReportIndex(stock, reportDate),
    };

    if (!grouped.has(ticker)) {
      grouped.set(ticker, []);
    }
    grouped.get(ticker).push(snapshot);
  });

  const index = Array.from(grouped.entries())
    .map(([ticker, snapshots]) => {
      snapshots.sort((a, b) => byDateDesc(a.report, b.report));

      const latestSnapshot = snapshots[0];
      const latestStock = latestSnapshot.stock;
      const reports = snapshots.map(snapshot => snapshot.report);

      return {
        ticker,
        name: latestStock.companyNameEn,
        nameKr: latestStock.companyName,
        sector: latestStock.sector,
        description: latestStock.description,
        tags: toCardTags(latestStock),
        latest: reports[0],
        reports,
      };
    })
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  fs.writeFileSync(indexPath, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  const reportCount = index.reduce((sum, item) => sum + item.reports.length, 0);
  console.log(
    `Updated ${path.relative(process.cwd(), indexPath)} `
    + `(${index.length} stock card(s), ${reportCount} report(s)).`
  );
}

main();
