---
name: generate-stock-report
description: Use when the user wants to add a new stock analysis report JSON from a company name or ticker (e.g. "PLTR 분석 추가해줘"), validate schema, and rebuild the dashboard index.
---

# Stock Report Generator

Generate production-ready stock analysis JSON for the investor-report dashboard.

**Input:** `$ARGUMENTS` (company name or ticker, e.g. "팔란티어" or "PLTR")

## Workflow

### 1. Parse Input & Lock Ticker

- Extract company name or ticker from `$ARGUMENTS`.
- If company name given, resolve to a single ticker. If ambiguous, ask the user.
- Check if `data/{TICKER}/` already exists. If so, confirm with user before overwriting.

### 2. Load Repository Context

Read these files to understand the expected format:

```
template/stock_analysis_template.md    # Report structure template
schema/stock.schema.json               # JSON validation schema
data/IREN/IREN-2026-02-17.json         # Baseline sample (recommended)
scripts/lib/stock-validation.js        # Validation rules
```

Also read the reference docs for policies:

```
.codex/skills/stock-report-codex-generator/references/json-schema-map.md
.codex/skills/stock-report-codex-generator/references/data-sourcing-policy.md
.codex/skills/stock-report-codex-generator/references/generation-checklist.md
```

### 3. Collect Data (Official-First Policy)

**Source priority:**
1. Official company IR / SEC / exchange disclosures
2. Primary market data endpoints (Yahoo Finance, SEC EDGAR)
3. Secondary aggregators only when primary unavailable

**Critical fields (MUST NOT be fabricated):**
- Price / market cap / 52-week range
- Core revenue trend values
- Major contract amounts and key milestone dates
- PEG / ROE related inputs
- 100x score inputs (marketCap, ROE, PER, founder/insider ownership)

Use web search and fetch tools to gather real-time data. Use concrete dates (YYYY-MM-DD).

### 4. Draft Stock JSON

Write to `data/{TICKER}/{TICKER}-{YYYY-MM-DD}.json` with ALL required top-level keys:

`ticker`, `companyName`, `companyNameEn`, `exchange`, `sector`, `description`, `analysisDate`, `price`, `priceChange`, `priceChangeDir`, `marketCap`, `marketCapChange`, `weekRange`, `analystRating`, `analystTarget`, `reportScore`, `reportVerdict`, `keyPoints`, `navSections`, `segments`, `revenueBreakdown`, `annualRevenue`, `quarterlyRevenue`, `marginTrend`, `financialTable`, `valuation`, `financialHealth`, `healthMetrics`, `timeline`, `competitorChart`, `competitorTable`, `risks`, `radar`, `bullCase`, `bearCase`, `checklist`, `moats`

**Scoring model** (`100x-book-v1`):

| Criterion | Weight | Description |
|-----------|--------|-------------|
| `small_cap` | 25 | Market cap growth potential (<$20B preferred) |
| `roe_quality` | 20 | ROE 15-20% sustained high returns |
| `reinvestment` | 20 | Growth rate, FCF, balance sheet efficiency |
| `reasonable_per` | 20 | P/E ratio 8-30x safety margin |
| `founder_led` | 15 | Founder CEO + insider ownership |

Include: `reportScoreModel`, `reportScoreBreakdown.total`, `reportScoreBreakdown.criteria[]`, `reportScoreBreakdown.notes[]`

**Verdict mapping:** 80+ STRONG BUY, 65+ BUY, 50+ HOLD, 35+ REDUCE, <35 SELL

**PEG policy:**
- Include `ROE (최근 1년)` and `PEG (최근 1년)` in `healthMetrics`
- If PEG unavailable: keep `N/A` reason text, add `pegInputs` if forward data exists
- Never fabricate PEG values

**Analyst reports** (`analystReports`):
- Target: 2 domestic + 2 international items
- Each: `title`, `source`, `link`, `publishedDate`, `summary`, `keyPoints`
- Never use generic portal/search URLs as report links
- Never fabricate `publishedDate`

**Checklist:** Include legacy operational rows + 5 `[100배]` gate rows

### 5. Validate & Rebuild Index

Run these commands automatically:

```bash
node scripts/validate-stocks.js
node scripts/build-index.js
```

Fix any validation errors before proceeding.

### 6. Report Result

- Confirm created file path
- Summarize validation outcome
- List placeholder fields and data-quality risks

## Non-Negotiable Rules

- Default to new stock creation only; never overwrite without explicit request
- Never fabricate critical financial figures, analyst report links, or dates
- Never use ticker portal/search URLs as analyst report links
- Never invent PEG, ROE, PER, or founder/insider ownership values
- Missing score inputs: use neutral score + explicit note in breakdown
- Mark unknown data as explicit placeholder with reason
- Keep JSON compatible with current dashboard renderer (`js/render.js`)
- All numeric arrays must contain numbers, not strings
- `priceChangeDir`: must be "up" or "down"
- `keyPoints`: minimum 5 items
- Korean narrative preferred for user-facing text

## Constraints

| Field | Constraint |
|-------|-----------|
| `priceChangeDir` | "up" or "down" |
| `reportScore` | 0-100 |
| `reportVerdict` | STRONG BUY / BUY / HOLD / REDUCE / SELL |
| `keyPoints` | min 5 items |
| `financialTable` rows | min 6 cells each |
| `timeline[].status` | "done" or "pending" |
| `checklist` rows | min 3 cells each |
| `segments[].color` | accent / orange / purple / green / red |
| `analysisDate` | YYYY-MM-DD |
