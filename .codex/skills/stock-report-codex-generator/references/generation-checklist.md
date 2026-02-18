# Generation Checklist

## 1) Intake

- Extract company name or ticker from user request.
- Confirm target ticker is unique.
- Check whether `data/{TICKER}.json` already exists.

## 2) Context loading

- Read `template/stock_analysis_template.md`.
- Read `schema/stock.schema.json`.
- Read baseline sample (`data/IREN.json`).

## 3) JSON drafting

- Create complete object with all required keys.
- Fill quantitative arrays with numbers, not strings.
- Ensure at least 5 `keyPoints`.
- Keep `navSections` aligned with renderer sections.
- In `healthMetrics`, include:
  - `ROE (최근 1년)`
  - `PEG (최근 1년)`
- For PEG:
  - If directly sourced, use numeric string (for example `1.35x`).
  - If unavailable, keep explicit reason text (for example `N/A (적자 구간)`).
  - If forward inputs exist, add optional `pegInputs` with `forwardPE`, `epsGrowthPct`, `basis`.
- Do not synthesize PEG from guesses. Use source-backed values only.

## 4) File output

- Write `data/{TICKER}.json`.
- If existing file and no explicit overwrite request, stop and ask user.

## 5) Validation and index rebuild

Run:

```bash
node scripts/validate-stocks.js
node scripts/build-index.js
```

## 6) Final response checklist

- Mention created/updated files.
- Mention validation/build success or failure details.
- Mention remaining placeholders or data-quality risks.
