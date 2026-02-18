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
- For `reportScore`, apply `100x-book-v1`:
  - `small_cap` (25): 시총 성장 여력 (`<$20B` 우대)
  - `roe_quality` (20): ROE 15~20%
  - `reinvestment` (20): 성장률·FCF·재무여력 프록시
  - `reasonable_per` (20): PER 8~30 우대
  - `founder_led` (15): Founder CEO + 내부자 지분
- Missing score inputs must use neutral score (중립점수) + reason text in notes.
- Include score payload fields:
  - `reportScoreModel: "100x-book-v1"`
  - `reportScoreBreakdown.total`
  - `reportScoreBreakdown.criteria[]`
  - `reportScoreBreakdown.notes[]`
- Checklist must include both:
  - Existing monitoring rows
  - 5 additional `[100배]` gate rows linked to criteria.

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
