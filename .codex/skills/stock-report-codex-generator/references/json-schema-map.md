# JSON Schema Map

Use this map before writing `data/{TICKER}.json`.

## Required top-level keys

`ticker`, `companyName`, `companyNameEn`, `exchange`, `sector`, `description`, `analysisDate`, `price`, `priceChange`, `priceChangeDir`, `marketCap`, `marketCapChange`, `weekRange`, `analystRating`, `analystTarget`, `reportScore`, `reportVerdict`, `keyPoints`, `navSections`, `segments`, `revenueBreakdown`, `annualRevenue`, `quarterlyRevenue`, `marginTrend`, `financialTable`, `valuation`, `financialHealth`, `healthMetrics`, `timeline`, `competitorChart`, `competitorTable`, `risks`, `radar`, `bullCase`, `bearCase`, `checklist`, `moats`.

## Optional extension keys (renderer-supported)

- `pegInputs` (object)
  - `forwardPE`: number or `null`
  - `epsGrowthPct`: number or `null`
  - `basis`: string (source/date note)
- `reportScoreModel` (string)
  - Recommended: `100x-book-v1`
- `reportScoreBreakdown` (object)
  - `total`: number (0~100)
  - `criteria`: array of objects
    - `id`: `small_cap | roe_quality | reinvestment | reasonable_per | founder_led`
    - `label`: string
    - `weight`: number
    - `score`: number
    - `status`: `pass | watch | fail | unknown`
    - `evidence`: string
  - `notes`: string array

## High-risk constraints

- `priceChangeDir`: must be `up` or `down`.
- `reportScore`: number between `0` and `100`.
- If `reportScoreBreakdown.total` exists, keep it consistent with `reportScore`.
- `reportVerdict`: one of `STRONG BUY`, `BUY`, `HOLD`, `REDUCE`, `SELL`.
- `keyPoints`: at least 5 string items.
- `annualRevenue.estimateStartIndex`: integer within label range.
- `financialTable`: each row needs at least 6 string cells.
- `timeline[].status`: `done` or `pending`.
- `competitorTable.rows[]`: each row length must match headers length.
- `checklist`: each row needs at least 3 string cells.
- Checklist should keep legacy 운영 항목 and add 100배 기준 gate rows (`[100배] ...`).
- Numeric arrays must stay numeric:
  - `revenueBreakdown.data`
  - `annualRevenue.data`
  - `quarterlyRevenue.data`
  - `marginTrend.gaap`, `marginTrend.nonGaap`
  - `valuation.company`, `valuation.industry`
  - `competitorChart.data`
  - `radar.data`
- `healthMetrics` PEG field:
  - If unavailable, keep explicit `N/A` reason text.
  - Do not replace missing PEG with guessed numeric strings.
- `pegInputs` safety:
  - If provided, `forwardPE` and `epsGrowthPct` should be positive numbers (or `null` when unavailable).
  - Keep `basis` as a short reproducible source/date memo.

## Date and locale conventions

- `analysisDate`: `YYYY.MM.DD`
- Timeline/checklist dates: use explicit formats (`2026.02.26`, `2026.H1`, `분기별`)
- Korean narrative is preferred for user-facing text.

## Renderer compatibility notes

- `segments[].color` should match existing CSS tags (e.g., `accent`, `orange`, `purple`).
- HTML tags in text fields are allowed (existing dashboards use `<strong>` and `<span>`).
- PEG render priority when `healthMetrics` has PEG = `N/A`:
  1. Use `pegInputs` to derive `PEG (Forward)`.
  2. If unavailable, renderer falls back to PSG (`P/S / next-year revenue growth(%)`).
- Report score render priority:
  1. `reportScoreBreakdown.total`
  2. `reportScore`
  3. Legacy radar-derived fallback
