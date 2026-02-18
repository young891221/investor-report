## Skills

A skill is a set of local instructions stored in a `SKILL.md` file.

### Available skills

- stock-report-codex-generator: Generate new stock report JSON files from natural-language company/ticker requests for this repository, then validate and rebuild index data. (file: skills/stock-report-codex-generator/SKILL.md)

### How to use skills

- Discovery: Read the list above and open only the relevant `SKILL.md`.
- Trigger rules: If the user asks to add/create/generate a stock report by company name or ticker, use `stock-report-codex-generator`.
- Scope default: 신규 종목 생성이 기본이며 기존 티커 overwrite는 사용자가 명시적으로 요청한 경우만 허용.
- Execution expectation: Handle generation through Codex workflow without requiring the user to run npm commands.
- Context hygiene: Load only files needed for the task (`template/`, `schema/`, relevant `data/*.json`).
- Validation: After generation, run `node scripts/validate-stocks.js` and `node scripts/build-index.js`.
- Fallback: If critical data is missing or ticker resolution is ambiguous, stop and ask a precise follow-up question.
