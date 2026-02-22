# Stock Analysis Automation Design

## Overview

현재 7개 종목을 수동으로 분석하고 있으며, 종목 수가 부족한 문제를 해결하기 위해 자동화된 종목 발굴 + 기존 종목 업데이트 시스템을 구축한다.

## 핵심 결정 사항

| 항목 | 결정 |
|------|------|
| 핵심 목표 | 새 종목 발굴 + 기존 종목 주기적 업데이트 |
| 선별 기준 | 100x-book-v1 스코어링 모델 |
| 종목 Pool | Finviz 스크리너 (소형주 성장주 필터) |
| 실행 방식 | Claude Code 워크플로우 |
| 업데이트 주기 | 실적 시즌 기반 (1월, 4월, 7월, 10월) |
| 생성 수량 | 스캔당 상위 5개 |
| 접근 방식 | 하이브리드 (Finviz 정량 필터 + Claude 정성 평가) |

## 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                Claude Code Workflow                      │
│  "종목 스캔 돌려줘" / "전체 업데이트 돌려줘"                │
└──────────────┬──────────────────────┬───────────────────┘
               │                      │
     ┌─────────▼─────────┐  ┌────────▼────────────┐
     │  scan-stocks       │  │  update-all-stocks   │
     │  (신규 종목 발굴)    │  │  (기존 종목 업데이트)  │
     └─────────┬─────────┘  └────────┬────────────┘
               │                      │
     ┌─────────▼─────────┐           │
     │ Phase 1: Finviz    │           │
     │ 정량 스크리닝        │           │
     │ → 20~30개 후보      │           │
     └─────────┬─────────┘           │
               │                      │
     ┌─────────▼─────────┐           │
     │ Phase 2: Claude    │           │
     │ 정성 평가           │           │
     │ → 상위 5개 선별     │           │
     └─────────┬─────────┘           │
               │                      │
     ┌─────────▼──────────────────────▼───────────┐
     │          기존 generate-stock.js              │
     │          리포트 생성 + 검증 + 인덱스 빌드       │
     └────────────────────────────────────────────┘
```

## Phase 1: Finviz 스크리닝

### 스크리닝 조건 (소형주 성장주 프리셋)

| 필터 | 조건 | 100x-book-v1 매핑 |
|-------|------|-------------------|
| Market Cap | $300M ~ $10B | small_cap (25%) |
| EPS Growth next 5Y | > 15% | reinvestment (20%) |
| ROE | > 10% | roe_quality (20%) |
| P/E | < 50 | reasonable_per (20%) |
| Country | USA | SEC 데이터 접근성 |
| Exchange | NYSE, NASDAQ | 유동성 확보 |

### 구현

- `scripts/scan-stocks.js` — 엔트리 포인트
- `scripts/lib/scanner/finviz.js` — Finviz 스크리너 URL 구성 + HTML 파싱하여 티커 리스트 추출
- `scripts/lib/scanner/presets.js` — 필터 프리셋 정의 (소형주 성장주 등)
- 이미 `data/`에 리포트가 있는 종목은 제외 (중복 방지)
- 결과를 `data/scan-results/YYYY-MM-DD-scan.json`에 저장

### 스캔 결과 포맷

```json
{
  "scanDate": "2026-02-22",
  "preset": "small-cap-growth",
  "filters": { "marketCap": "300M~10B", "roe": ">10%", "pe": "<50", "epsGrowth5Y": ">15%" },
  "candidates": [
    {
      "ticker": "PLTR",
      "company": "Palantir Technologies",
      "marketCap": "$8.2B",
      "roe": "18.5%",
      "pe": "32.1",
      "epsGrowth5Y": "25%",
      "quantScore": 72,
      "qualScore": null,
      "totalScore": null
    }
  ],
  "totalFound": 28,
  "excludedExisting": ["CRWD", "PANW"]
}
```

## Phase 2: Claude 정성 평가

### 자동 수집 항목 (Yahoo Finance API → 정량 점수)

| 100x-book-v1 항목 | 자동 수집 데이터 | 배점 |
|---|---|---|
| small_cap (25%) | marketCap, 매출 성장률, TAM | 0~25 |
| roe_quality (20%) | ROE, ROA, 영업이익률 | 0~20 |
| reinvestment (20%) | R&D 비율, capex/revenue, 매출 성장률 | 0~20 |
| reasonable_per (20%) | P/E, Forward P/E, PEG, P/S | 0~20 |

### Claude 리서치 항목 (WebSearch → 정성 점수)

| 100x-book-v1 항목 | Claude 리서치 내용 | 배점 |
|---|---|---|
| founder_led (15%) | 창업자 경영 여부, 내부자 지분율, 경영진 평판 | 0~15 |

### 스코어링 엔진

- `scripts/lib/scanner/scorer.js` — 100x-book-v1 자동 스코어링
- 정량 점수 (85점 만점): Yahoo Finance 데이터로 자동 계산
  - small_cap: 시가총액 $1B~$5B 최적 (25점), $300M~$1B or $5B~$10B (15점)
  - roe_quality: ROE 15~20% 최적 (20점), 10~15% or 20~30% (12점)
  - reinvestment: 매출 성장률 > 30% + R&D > 10% 최적 (20점)
  - reasonable_per: P/E 8~30x 최적 (20점), 30~50x (10점)
- 정성 점수 (15점 만점): Claude WebSearch 리서치 후 판단
  - founder_led: 창업자 CEO + 내부자 지분 > 10% (15점)
- 종합 점수 = 정량 + 정성 (100점 만점)
- 상위 5개 선별 후 `generate-stock.js`로 전달

## 기존 종목 업데이트

- `scripts/update-all-stocks.js` — `data/index.json`에서 등록된 전체 티커 추출
- 각 종목에 대해 `generate-stock.js --ticker {TICKER} --build-index --force` 실행
- 최신 가격, 실적, 밸류에이션 데이터로 리포트 갱신
- 실적 시즌(1월, 4월, 7월, 10월)에 수동 트리거

## Claude Code 워크플로우

### 1. `.claude/commands/scan-stocks.md` — 신규 종목 발굴

```
트리거: "종목 스캔 돌려줘"
→ scripts/scan-stocks.js 실행 (Finviz 스크리닝)
→ 후보 20~30개 추출
→ Yahoo Finance로 정량 데이터 수집 + 자동 스코어링
→ Claude가 각 후보 정성 평가 (founder_led: WebSearch)
→ 100x-book-v1 종합 스코어 계산
→ 상위 5개 리포트 자동 생성 (generate-stock.js)
→ 검증 + 인덱스 리빌드
```

### 2. `.claude/commands/update-all-stocks.md` — 기존 종목 업데이트

```
트리거: "전체 업데이트 돌려줘"
→ data/index.json에서 전체 티커 추출
→ 각 티커별 generate-stock.js --force 실행
→ 검증 + 인덱스 리빌드
```

## 파일 구조 변경

```
scripts/
├── scan-stocks.js          ← NEW: Finviz 스크리닝 + 스코어링 엔진 엔트리
├── update-all-stocks.js    ← NEW: 기존 종목 일괄 업데이트 엔트리
├── lib/
│   ├── scanner/            ← NEW
│   │   ├── finviz.js       ← Finviz HTML 파싱
│   │   ├── scorer.js       ← 100x-book-v1 자동 스코어링 로직
│   │   └── presets.js      ← 필터 프리셋 정의
│   └── generator/          ← 기존 유지
data/
├── scan-results/           ← NEW: 스캔 결과 히스토리
│   └── 2026-02-22-scan.json
.claude/commands/
├── scan-stocks.md          ← NEW: 종목 발굴 워크플로우
├── update-all-stocks.md    ← NEW: 일괄 업데이트 워크플로우
└── generate-stock-report.md ← 기존 유지
package.json                ← npm scripts 추가
```

## package.json 추가 스크립트

```json
{
  "scan:stocks": "node scripts/scan-stocks.js",
  "scan:stocks:generate": "node scripts/scan-stocks.js --generate --build-index",
  "update:all": "node scripts/update-all-stocks.js",
  "update:all:force": "node scripts/update-all-stocks.js --force --build-index"
}
```

## 에러 처리

- Finviz 스크래핑 실패 시: 에러 메시지 출력 + 빈 결과 반환 (리포트 생성 안 함)
- Yahoo Finance API 실패 시: 해당 종목 스킵 + 경고 로그
- 리포트 생성 실패 시: 해당 종목 스킵 + 나머지 계속 진행
- 스캔 결과 0건 시: 필터 조건 완화 제안 메시지

## 제약 사항

- Finviz HTML 구조 변경 시 파싱 로직 업데이트 필요
- 100x-book-v1 자동 스코어링은 정량 데이터 기반이므로 founder_led 외 정성적 판단은 Claude 리서치에 의존
- Yahoo Finance API rate limit 주의 (종목당 1초 딜레이 권장)
- 한 번에 5개 이상 리포트 생성 시 시간 소요 증가
