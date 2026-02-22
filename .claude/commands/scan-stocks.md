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

For each of the final top 5 stocks, invoke the `generate-stock-report` skill:

```
/generate-stock-report {TICKER}
```

This skill performs the full report generation workflow:
- Loads template, schema, and reference docs
- Collects data from official sources (IR, SEC, Yahoo Finance)
- Drafts comprehensive stock JSON with all required fields and 100x scoring
- Validates schema and rebuilds the dashboard index
- Ensures data quality (no fabricated figures, proper placeholders)

Generate each stock sequentially, waiting for one to complete before starting the next.

### 4. Final Report

After all 5 reports are generated, summarize:
- Total candidates screened from Finviz
- Top 5 selected with adjusted scores and rationale
- Generated file paths
- Any placeholders or data quality warnings
- Index rebuild confirmation

## Notes

- This workflow combines automated quantitative screening with Claude's qualitative research
- The `founder_led` criterion requires manual research (WebSearch) and cannot be fully automated
- Run during earnings season (Jan, Apr, Jul, Oct) for best results
- Existing stocks in data/ are automatically excluded from candidates
