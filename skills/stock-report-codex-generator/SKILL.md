---
name: stock-report-codex-generator
description: Generate a new stock analysis report JSON for this investor-report repository from natural-language company or ticker requests (for example "로켓 랩 분석 추가해줘"). Use when the user wants Codex AI to add a new stock in `data/{TICKER}.json`, validate schema compliance, update `data/index.json`, and summarize sources/placeholders without requiring the user to run npm commands.
---

# Stock Report Codex Generator

## Overview

Create new stock report data using repository templates and schema rules.

Use this skill to convert natural-language stock requests into a production-ready JSON file for `stock.html` rendering.

## Workflow

1. Parse input and lock target ticker.
- Accept either company name or ticker from user text.
- Resolve company name to one ticker before writing any file.
- If multiple candidates exist, stop and ask the user to choose.

2. Load repository context.
- Read `template/stock_analysis_template.md`.
- Read `schema/stock.schema.json`.
- Read at least one existing stock sample (`data/IREN.json` recommended).
- Read rendering assumptions if needed (`js/render.js`, `scripts/lib/stock-validation.js`).

3. Collect data with official-first policy.
- Follow `references/data-sourcing-policy.md`.
- Use concrete dates (`YYYY.MM.DD`) and numeric values.
- Keep assumptions explicit.

4. Draft stock JSON with schema fidelity.
- Write `data/{TICKER}.json`.
- Keep all required top-level keys.
- Use numeric arrays where schema requires numbers.
- Keep Korean narrative concise and investor-focused.
- Apply analyst report generation policy (`analystReports`):
  - Populate both `domestic` and `international` arrays when reliable sources exist (default target: 2 items each).
  - Each item should include: `title`, `source`, `link`, `publishedDate`, `summary`, `keyPoints`.
  - `publishedDate` must be the actual source publication date in `YYYY-MM-DD`.
  - Domestic source priority:
    - Tier 1: 증권사/리서치센터 원문 PDF 또는 리포트 상세 페이지
    - Tier 2: 증권사 리서치 목록 페이지(리포트 식별 가능한 경우)
    - Avoid generic ticker portals/search pages as final links.
  - International source priority:
    - Tier 1: 투자은행/브로커 원문 리포트/노트 페이지
    - Tier 2: 원문이 유료/비공개일 때, 기관명·의견·목표가·날짜가 명시된 신뢰 가능한 기사형 원문
  - Summary writing rules:
    - Summaries must be traceable to the linked source only.
    - Include at least one concrete fact when available (for example rating/target change, estimate revision, catalyst date).
    - Do not infer financial claims not present in the source.
    - `keyPoints` should be factual, short, and source-grounded.
- Apply PEG/ROE metric policy:
  - Include `ROE (최근 1년)` and `PEG (최근 1년)` in `healthMetrics`.
  - If PEG is unavailable, keep explicit `N/A` reason text (for example, `N/A (적자 구간)`).
  - When forward inputs are available, add optional `pegInputs`:
    - `forwardPE` (number or `null`)
    - `epsGrowthPct` (number or `null`)
    - `basis` (source + date note)
  - Renderer priority is `Forward PEG > PSG fallback` when `healthMetrics` PEG is `N/A`:
    - Forward PEG = `forwardPE / epsGrowthPct`
    - PSG fallback = `P/S / next-year revenue growth(%)`
- Apply 100x-book score model (`100x-book-v1`) for `reportScore`:
  - Criteria and weights:
    - `small_cap` (25): 시가총액이 작고 성장 여력이 큼 (`<$20B` 우대)
    - `roe_quality` (20): ROE 15~20% 고수익 구조
    - `reinvestment` (20): 성장률·FCF·재무여력 기반 재투자 효율
    - `reasonable_per` (20): PER 8~30 구간 안전마진
    - `founder_led` (15): Founder CEO + 내부자 지분 병행
  - Missing critical inputs must use neutral score (중립점수), not fabricated values.
  - Populate:
    - `reportScoreModel` (string, `100x-book-v1`)
    - `reportScoreBreakdown.total`
    - `reportScoreBreakdown.criteria[]`
    - `reportScoreBreakdown.notes[]`
- Keep checklist in dual mode:
  - Existing operational checklist rows
  - Add 5 `[100배]` gate rows mapped to the criteria above.

5. Validate and rebuild index.
- Run `node scripts/validate-stocks.js`.
- Run `node scripts/build-index.js`.
- Never ask the user to run npm commands for this flow.

6. Report result.
- Confirm created/updated files.
- Summarize validation outcome.
- List placeholder fields and follow-up verification items.

## Non-Negotiable Rules

- Default to 신규 종목 생성 only.
- Do not overwrite an existing ticker unless the user explicitly asks.
- Never fabricate critical financial figures when source is missing.
- Never fabricate analyst report links or summaries.
- Never use unrelated ticker portal/search URLs as analyst report links when report-grade sources are available.
- Never invent analyst `publishedDate`; keep exact date or omit the field.
- Never fabricate PEG values. If unavailable, keep explicit `N/A` and/or verifiable `pegInputs`.
- Never fabricate founder/insider/ROE/PER inputs for score calculation.
- If score inputs are missing, keep neutral score + explicit note in breakdown.
- Mark unknown narrative or estimates as placeholders with explicit wording.
- Keep final JSON compatible with current dashboard renderer.

## References

- Schema mapping: `references/json-schema-map.md`
- Sourcing policy: `references/data-sourcing-policy.md`
- Execution checklist: `references/generation-checklist.md`
