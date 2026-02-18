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
- Mark unknown narrative or estimates as placeholders with explicit wording.
- Keep final JSON compatible with current dashboard renderer.

## References

- Schema mapping: `references/json-schema-map.md`
- Sourcing policy: `references/data-sourcing-policy.md`
- Execution checklist: `references/generation-checklist.md`
