# investor-report

Option C (Hybrid) structure for managing stock analysis reports on GitHub Pages.

## Site Structure

```
.
├── index.html                        # Portfolio home
├── stock.html                        # Stock dashboard (?ticker=RKLB&date=2026-02-18)
├── css/
│   └── dashboard.css                 # Shared design system
├── js/
│   ├── home.js                       # Home card rendering + sector filters + report dates
│   └── render.js                     # Dashboard rendering engine
  ├── data/
  │   ├── RKLB/
  │   │   ├── RKLB-2026-02-17.json     # Per-date stock report
  │   │   └── RKLB-2026-02-18.json
│   ├── index.json                    # Auto-generated stock card/report index
│   └── sources/
│       └── RKLB/
│           └── 2026-02-18.sources.json
├── schema/
│   └── stock.schema.json             # Stock data schema reference
└── scripts/
    ├── migrate-stock-layout.js       # Legacy flat data/* migration script
    ├── generate-stock.js             # Company name/ticker -> JSON generation pipeline
    ├── validate-stocks.js            # Data validation
    └── build-index.js                # data/index.json generation
```

## URL Routes

- Home: `index.html`
- Stock dashboard (specific report): `stock.html?ticker=RKLB&date=2026-02-18`
- Stock dashboard (latest report auto-resolve): `stock.html?ticker=RKLB`
- Backward compatible ticker query: `stock.html?stock=RKLB`

## Data Rules

- Report file path: `data/{TICKER}/{TICKER}-{YYYY-MM-DD}.json` (기존 `YYYY-MM-DD.json`도 호환)
- `analysisDate` must use `YYYY-MM-DD`
- `analysisDate` must match report file name
- `index.json` is generated; do not edit manually

## Data Operations

1. (If needed) migrate legacy flat files once:

```bash
npm run migrate:layout
```

2. Validate stock JSON files:

```bash
npm run validate:stocks
```

3. Build stock card/report index:

```bash
npm run build:index
```

4. Or run both:

```bash
npm run build:data
```

## Automated Stock Generation

Generate a new stock report by ticker:

```bash
npm run generate:stock -- --ticker RKLB --build-index
```

Generate by company name:

```bash
npm run generate:stock -- --name "Rocket Lab" --build-index
```

Options:

- `--strict` / `--no-strict`: strict mode fails when critical source fields are missing
- `--allow-placeholders` / `--no-allow-placeholders`: allow or disallow placeholder narrative text
- `--force`: overwrite existing `data/{TICKER}/{TICKER}-{YYYY-MM-DD}.json`
- `--dry-run`: run generation without writing files
- `--build-index`: run `validate:stocks` and `build:index` after generation

The generator also writes source metadata to:

- `data/sources/{TICKER}/{TICKER}-{YYYY-MM-DD}.sources.json`

This file records source URLs, generation timestamp, placeholder usage, and field-level source mapping.

Note: strict mode requires network access to SEC/Yahoo endpoints. If SEC access is blocked, use `--no-strict` or set `SEC_USER_AGENT`.

## GitHub Actions (Manual Run)

Workflow: `.github/workflows/generate-stock.yml`

In GitHub Actions, run **Generate Stock Report** with either:

- `ticker` (e.g. `RKLB`)
- `name` (e.g. `Rocket Lab`)

Optional flags:

- `strict`
- `allow_placeholders`
- `create_pr`

## GitHub Pages Deployment

1. Push repository to GitHub.
2. In repository settings, enable Pages with branch source (for example `main` / root).
3. Access:
    - `https://<username>.github.io/investor-report/`
    - `https://<username>.github.io/investor-report/stock.html?ticker=RKLB&date=2026-02-18`

## Local Preview

Because pages fetch JSON files, run with a local web server instead of opening files directly:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080/`.

## Notes

- Charts are rendered with Chart.js CDN.
- Keep `data/index.json` generated from scripts instead of manual edits.
- Existing `stock/iren` folder is retained as reference/example assets.
