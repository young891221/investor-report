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
- For `reportScore`, apply `turnaround-v1`:
  - `margin_recovery` (30): 분기별 영업이익률 V자 회복 패턴
  - `revenue_reaccel` (30): YoY 매출 성장률 가속도
  - `cash_flow_turn` (25): 순이익 추이 + FCF 양전환 + 순현금 여력
  - `valuation_setup` (15): P/E·P/S 저평가 + 펀더멘털 개선 비대칭 셋업
- Missing score inputs must use neutral score (중립점수).
- Include score payload fields:
  - `reportScoreModel: "turnaround-v1"`
  - `reportScoreBreakdown.total`
  - `reportScoreBreakdown.criteria[]`
- Checklist must include both:
  - Existing monitoring rows
  - 4 additional `[턴어라운드]` gate rows linked to criteria.

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
