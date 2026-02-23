---
name: scan-stocks
description: Use when the user wants to discover new investment-worthy stocks by screening Finviz and scoring with turnaround-v1 model (e.g. "종목 스캔 돌려줘", "유망 종목 찾아줘").
---

# Stock Scanner Workflow

Discover new investment-worthy stocks via Finviz screening + turnaround-v1 scoring + Claude qualitative evaluation.

**Input:** `$ARGUMENTS` (optional: preset name, e.g. "turnaround-growth")

## Workflow

### 1. Run Finviz Screening + Quantitative Scoring

Run the scanner script to get initial candidates:

```bash
node scripts/scan-stocks.js --preset turnaround-growth --top 10 --dry-run
```

Available presets:
- `turnaround-value`: 52주 저점 근처 + P/E<30 (바닥 매수 후보)
- `turnaround-growth` (기본): 52주 하락 + 최근 26주 반등 + QoQ 매출성장 (변곡점)
- `turnaround-profitability`: 아직 적자이지만 EPS 성장 25%+ (흑자 전환 임박)

Review the output: check how many candidates were found and their turnaround-v1 scores.

### 2. Qualitative Evaluation (Claude Research)

For each of the top 10 candidates from Step 1:

- Use WebSearch to research: **최근 실적 발표, 구조조정/턴어라운드 이벤트, 경영진 변화, 신제품/신규 수주**
- Evaluate turnaround narrative quality:
  - Is there a clear catalyst for the turnaround?
  - Is margin recovery structural or one-time?
  - Does the company have cash runway to sustain operations?
- Adjust total score qualitatively and re-rank, selecting the final top 5

### 3. Generate Reports for Top 5

For each of the final top 5 stocks, invoke the `generate-stock-report` skill:

```
/generate-stock-report {TICKER}
```

This skill performs the full report generation workflow:
- Loads template, schema, and reference docs
- Collects data from official sources (IR, SEC, Yahoo Finance)
- Drafts comprehensive stock JSON with all required fields and turnaround-v1 scoring
- Validates schema and rebuilds the dashboard index

Generate each stock sequentially, waiting for one to complete before starting the next.

### 4. Final Report

After all 5 reports are generated, summarize:
- Total candidates screened from Finviz
- Top 5 selected with turnaround-v1 scores and rationale
- Generated file paths
- Any placeholders or data quality warnings
- Index rebuild confirmation

## Scoring Model: turnaround-v1 (100 points)

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `margin_recovery` | 30 | 분기별 영업이익률 V자 회복 패턴 (선형회귀 기울기 + 저점 대비 회복폭) |
| `revenue_reaccel` | 30 | YoY 매출 성장률 가속도 (둔화→재가속 전환) |
| `cash_flow_turn` | 25 | 순이익 추이 (전반부 vs 후반부), FCF 양전환, 순현금 여력 |
| `valuation_setup` | 15 | P/E·P/S 저평가 + 펀더멘털 개선 비대칭 셋업 |

## Notes

- This workflow combines automated turnaround screening with Claude's qualitative research
- Run during earnings season (Jan, Apr, Jul, Oct) for best results
- Existing stocks in data/ are automatically excluded from candidates
