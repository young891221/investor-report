#!/usr/bin/env node

const path = require('node:path');
const { readStockFiles, validateStock } = require('./lib/stock-validation');

const dataDir = path.join(__dirname, '..', 'data');

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

  let hasErrors = false;

  files.forEach(file => {
    const errors = validateStock(file.json, { expectedTicker: file.expectedTicker });
    if (errors.length === 0) {
      return;
    }

    hasErrors = true;
    console.error(`\n${file.file}`);
    errors.forEach(error => console.error(`  - ${error}`));
  });

  if (hasErrors) {
    console.error('\nStock validation failed.');
    process.exit(1);
  }

  console.log(`Validated ${files.length} stock file(s) successfully.`);
}

main();
