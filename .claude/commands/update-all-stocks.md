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
