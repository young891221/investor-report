#!/usr/bin/env node

const { generateStockReport, parseArgs } = require('./lib/generator');

function printHelp() {
  console.log('Usage: npm run generate:stock -- [options]');
  console.log('');
  console.log('Required (one of):');
  console.log('  --ticker <TICKER>        Example: --ticker RKLB');
  console.log('  --name "<COMPANY NAME>"  Example: --name "Rocket Lab"');
  console.log('');
  console.log('Options:');
  console.log('  --strict | --no-strict');
  console.log('  --allow-placeholders | --no-allow-placeholders');
  console.log('  --force                  Overwrite existing data/{TICKER}/{TICKER}-YYYY-MM-DD.json');
  console.log('  --dry-run');
  console.log('  --build-index');
  console.log('  -h, --help');
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('-h') || argv.includes('--help')) {
    printHelp();
    return;
  }

  const options = parseArgs(argv);

  const result = await generateStockReport(options);

  console.log(`Generated ${result.ticker}`);
  console.log(`- resolution: ${result.resolution}`);
  console.log(`- stock file: ${result.stockPath}`);
  console.log(`- source file: ${result.sourcePath}`);
  console.log(`- placeholders: ${result.placeholders.length}`);

  if (result.placeholders.length > 0) {
    result.placeholders.forEach(item => {
      console.log(`  * ${item.field}: ${item.reason}`);
    });
  }

  if (result.dryRun) {
    console.log('Dry-run mode enabled: no files were written.');
  }
}

main().catch(error => {
  console.error(`generate-stock failed: ${error.message}`);
  process.exit(1);
});
