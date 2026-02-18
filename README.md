# investor-report

Option C (Hybrid) structure for managing stock analysis reports on GitHub Pages.

## Site Structure

```
.
├── index.html                 # Portfolio home
├── stock.html                 # Single stock dashboard template (?ticker=IREN)
├── css/
│   └── dashboard.css          # Shared design system
├── js/
│   ├── home.js                # Home card rendering + sector filters
│   └── render.js              # Dashboard rendering engine
├── data/
│   ├── IREN.json              # Per-stock dashboard data
│   └── index.json             # Auto-generated stock card index
├── schema/
│   └── stock.schema.json      # Stock data schema reference
└── scripts/
    ├── validate-stocks.js     # Data validation
    └── build-index.js         # data/index.json generation
```

## URL Routes

- Home: `index.html`
- Stock dashboard: `stock.html?ticker=IREN`
- Backward compatible query: `stock.html?stock=IREN`

## Data Operations

1. Add a new file in `data/` (for example `data/RKLB.json`).
2. Validate stock JSON files:

```bash
npm run validate:stocks
```

3. Build stock card index:

```bash
npm run build:index
```

4. Or run both:

```bash
npm run build:data
```

## GitHub Pages Deployment

1. Push repository to GitHub.
2. In repository settings, enable Pages with branch source (for example `main` / root).
3. Access:
    - `https://<username>.github.io/investor-report/`
    - `https://<username>.github.io/investor-report/stock.html?ticker=IREN`

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
