# Data Sourcing Policy

## Source priority

1. Official company IR / SEC / exchange disclosures
2. Primary market data endpoints used by this repo workflow
3. Secondary aggregators only when primary data is unavailable

Prefer recent, dated facts and keep the event date separate from publish date.

## Critical fields that must not be fabricated

- Price / market cap / 52-week range
- Core revenue trend values
- Major contract amounts and key milestone dates
- PEG / ROE related inputs (`PEG`, `forwardPE`, `epsGrowthPct`)
- 100x score inputs (`marketCap`, `ROE`, `PER`, founder/insider ownership signals)

If a critical value is missing:

- Stop in strict interpretation, or
- Mark as explicit placeholder with reason in narrative fields.

## PEG / ROE metric policy

- `ROE (최근 1년)` should come from a dated primary market-data source snapshot.
- `PEG (최근 1년)` should be source-backed. If unavailable, keep explicit `N/A` reason text.
- If available, keep forward inputs in optional `pegInputs`:
  - `forwardPE`
  - `epsGrowthPct`
  - `basis` (source + date memo)
- Dashboard renderer uses this fallback order when PEG is `N/A`:
  1. `Forward PEG = forwardPE / epsGrowthPct`
  2. `PSG = P/S / next-year revenue growth(%)`
- Do not invent PEG, forward P/E, or EPS growth figures.

## 100x score sourcing policy (`100x-book-v1`)

- Score criteria use these inputs:
  - `small_cap`: market cap
  - `roe_quality`: ROE (recent snapshot)
  - `reinvestment`: growth + FCF + balance-sheet proxies
  - `reasonable_per`: trailing P/E first, forward P/E fallback
  - `founder_led`: founder-CEO signal + insider ownership
- Founder-led signal priority:
  1. `assetProfile.companyOfficers[].title` founder/CEO text
  2. `defaultKeyStatistics.heldPercentInsiders`
- Missing score inputs:
  - Do **not** fabricate values.
  - Apply neutral score and record explicit note in `reportScoreBreakdown.notes`.

## Placeholder policy

- Use placeholders only for non-critical narrative fields.
- Add reason text (e.g., "공식 데이터 미확보, 추후 IR 확인 필요").
- Do not hide uncertainty.

## Date policy

- Write analysis date in `YYYY.MM.DD`.
- Use absolute dates in timeline/checklist when known.
- Avoid vague relative terms unless event is recurring (`분기별`, `상시`).

## Reproducibility notes

When possible, preserve key source links or short source notes in the final report summary so later updates can trace the same facts quickly.
