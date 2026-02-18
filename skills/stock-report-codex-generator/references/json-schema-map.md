# JSON Schema Map

Use this map before writing `data/{TICKER}.json`.

## Required top-level keys

`ticker`, `companyName`, `companyNameEn`, `exchange`, `sector`, `description`, `analysisDate`, `price`, `priceChange`, `priceChangeDir`, `marketCap`, `marketCapChange`, `weekRange`, `analystRating`, `analystTarget`, `keyPoints`, `navSections`, `segments`, `revenueBreakdown`, `annualRevenue`, `quarterlyRevenue`, `marginTrend`, `financialTable`, `valuation`, `financialHealth`, `healthMetrics`, `timeline`, `competitorChart`, `competitorTable`, `risks`, `radar`, `bullCase`, `bearCase`, `checklist`, `moats`.

## High-risk constraints

- `priceChangeDir`: must be `up` or `down`.
- `keyPoints`: at least 5 string items.
- `annualRevenue.estimateStartIndex`: integer within label range.
- `financialTable`: each row needs at least 6 string cells.
- `timeline[].status`: `done` or `pending`.
- `competitorTable.rows[]`: each row length must match headers length.
- `checklist`: each row needs at least 3 string cells.
- Numeric arrays must stay numeric:
  - `revenueBreakdown.data`
  - `annualRevenue.data`
  - `quarterlyRevenue.data`
  - `marginTrend.gaap`, `marginTrend.nonGaap`
  - `valuation.company`, `valuation.industry`
  - `competitorChart.data`
  - `radar.data`

## Date and locale conventions

- `analysisDate`: `YYYY.MM.DD`
- Timeline/checklist dates: use explicit formats (`2026.02.26`, `2026.H1`, `분기별`)
- Korean narrative is preferred for user-facing text.

## Renderer compatibility notes

- `segments[].color` should match existing CSS tags (e.g., `accent`, `orange`, `purple`).
- HTML tags in text fields are allowed (existing dashboards use `<strong>` and `<span>`).
