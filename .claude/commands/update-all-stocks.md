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

For each stock in the portfolio (or the specific tickers from `$ARGUMENTS`), invoke the `generate-stock-report` skill:

```
/generate-stock-report {TICKER}
```

This skill performs the full report generation workflow:
- Loads template, schema, and reference docs
- Collects latest data from official sources (IR, SEC, Yahoo Finance)
- Drafts comprehensive stock JSON with all required fields and turnaround-v1 scoring
- Validates schema and rebuilds the dashboard index
- Ensures data quality (no fabricated figures, proper placeholders)

Generate each stock sequentially, waiting for one to complete before starting the next.

### 3. Final Report

After all stocks are updated, summarize:
- Number of stocks updated successfully
- Any failures (with reasons)
- Placeholder warnings
- Index rebuild confirmation

## Notes

- Use `--force` to overwrite today's existing reports
- Best run during earnings season (Jan, Apr, Jul, Oct)
- Each stock update requires Yahoo Finance API calls; expect ~2 seconds per stock
- Failed stocks are skipped; remaining stocks continue
