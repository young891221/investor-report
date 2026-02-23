## Skills

A skill is a set of local instructions stored in a `SKILL.md` file.

### Available skills

- stock-report-codex-generator: Generate new stock report JSON files from natural-language company/ticker requests for this repository, then validate and rebuild index data. (file: skills/stock-report-codex-generator/SKILL.md)
- scan-stocks: Discover new investment-worthy stocks via Finviz screening + turnaround-v1 scoring. Trigger: "종목 스캔 돌려줘", "유망 종목 찾아줘", "새 종목 발굴해줘" (file: .claude/commands/scan-stocks.md)
- update-all-stocks: Refresh all existing stock reports with latest market data. Trigger: "전체 업데이트 돌려줘", "리포트 갱신해줘", "실적 시즌 업데이트" (file: .claude/commands/update-all-stocks.md)

### How to use skills

- Discovery: Read the list above and open only the relevant `SKILL.md`.
- Trigger rules: If the user asks to add/create/generate a stock report by company name or ticker, use `stock-report-codex-generator`.
- Scope default: 신규 종목 생성이 기본이며 기존 티커 overwrite는 사용자가 명시적으로 요청한 경우만 허용.
- Execution expectation: Handle generation through Codex workflow without requiring the user to run npm commands.
- Context hygiene: Load only files needed for the task (`template/`, `schema/`, relevant `data/*.json`).
- Validation: After generation, run `node scripts/validate-stocks.js` and `node scripts/build-index.js`.
- Fallback: If critical data is missing or ticker resolution is ambiguous, stop and ask a precise follow-up question.
