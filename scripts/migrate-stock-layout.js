#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.join(__dirname, '..', 'data');
const sourceRootDir = path.join(dataDir, 'sources');

const DOT_DATE_RE = /^\d{4}\.\d{2}\.\d{2}$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TICKER_RE = /^[A-Z0-9._-]{1,15}$/;

function isValidIsoDate(value) {
  if (!ISO_DATE_RE.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() + 1 === month
    && date.getUTCDate() === day
  );
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (DOT_DATE_RE.test(text)) {
    const normalized = text.replaceAll('.', '-');
    return isValidIsoDate(normalized) ? normalized : null;
  }

  if (ISO_DATE_RE.test(text)) {
    return isValidIsoDate(text) ? text : null;
  }

  return null;
}

function readLegacyFiles() {
  return fs.readdirSync(dataDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.json') && entry.name !== 'index.json')
    .map(entry => entry.name)
    .sort();
}

function buildOperations(files) {
  const operations = [];
  const targetPaths = new Set();

  files.forEach(fileName => {
    const filePath = path.join(dataDir, fileName);
    const raw = fs.readFileSync(filePath, 'utf8');
    const json = JSON.parse(raw);

    const fallbackTicker = path.basename(fileName, '.json').toUpperCase();
    const ticker = String(json.ticker || fallbackTicker).toUpperCase().trim();
    if (!TICKER_RE.test(ticker)) {
      throw new Error(`Invalid ticker in ${fileName}: ${ticker}`);
    }

    const normalizedDate = normalizeDate(json.analysisDate);
    if (!normalizedDate) {
      throw new Error(`Invalid analysisDate in ${fileName}: ${json.analysisDate}`);
    }

    const targetDir = path.join(dataDir, ticker);
    const targetPath = path.join(targetDir, `${ticker}-${normalizedDate}.json`);
    if (targetPaths.has(targetPath)) {
      throw new Error(`Duplicate target report path detected: ${path.relative(process.cwd(), targetPath)}`);
    }
    targetPaths.add(targetPath);

    if (fs.existsSync(targetPath)) {
      throw new Error(`Target report already exists: ${path.relative(process.cwd(), targetPath)}`);
    }

    const legacySourcePath = path.join(sourceRootDir, `${ticker}.sources.json`);
    const sourceTargetDir = path.join(sourceRootDir, ticker);
    const sourceTargetPath = path.join(sourceTargetDir, `${ticker}-${normalizedDate}.sources.json`);
    const shouldMoveSource = fs.existsSync(legacySourcePath);

    if (shouldMoveSource && fs.existsSync(sourceTargetPath)) {
      throw new Error(`Target source metadata already exists: ${path.relative(process.cwd(), sourceTargetPath)}`);
    }

    operations.push({
      fileName,
      sourcePath: filePath,
      targetDir,
      targetPath,
      ticker,
      normalizedDate,
      json: {
        ...json,
        ticker,
        analysisDate: normalizedDate,
      },
      shouldMoveSource,
      legacySourcePath,
      sourceTargetDir,
      sourceTargetPath,
    });
  });

  return operations;
}

function runMigration(operations) {
  operations.forEach(op => {
    fs.mkdirSync(op.targetDir, { recursive: true });
    fs.writeFileSync(op.targetPath, `${JSON.stringify(op.json, null, 2)}\n`, 'utf8');

    if (op.shouldMoveSource) {
      fs.mkdirSync(op.sourceTargetDir, { recursive: true });
      fs.renameSync(op.legacySourcePath, op.sourceTargetPath);
    }

    fs.unlinkSync(op.sourcePath);
  });
}

function main() {
  const legacyFiles = readLegacyFiles();

  if (legacyFiles.length === 0) {
    console.log('No legacy flat stock files found. Nothing to migrate.');
    return;
  }

  const operations = buildOperations(legacyFiles);
  runMigration(operations);

  console.log(`Migrated ${operations.length} file(s) to data/{TICKER}/{TICKER}-{YYYY-MM-DD}.json layout.`);
  operations.forEach(op => {
    console.log(`- ${op.fileName} -> ${path.relative(process.cwd(), op.targetPath)}`);
  });
}

main();
