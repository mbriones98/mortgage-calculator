# Mortgage Calculator

A static mortgage calculator written in TypeScript, hosted on GitHub Pages. No frameworks, no runtime dependencies.

- Monthly payment broken into principal & interest, property tax, insurance, PMI and HOA
- Property tax estimate from a ZIP code (statewide average effective rate; can be overridden)
- PMI that drops off automatically at 78% loan-to-value
- Extra monthly principal, with interest and time saved
- Balance-over-time chart and a yearly/monthly amortization schedule
- Inputs are saved in `localStorage`; "Copy share link" puts them in the URL

## Develop

```bash
npm install
npm run build     # compiles src/*.ts -> dist/js and copies index.html + styles.css into dist/
npm run serve     # http://localhost:8000 (ES modules need a server, not file://)
npm run watch     # recompile on save (re-run build if you edit index.html or styles.css)
```

## Deploy

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds and publishes `dist/` to GitHub Pages.
One-time setup: in the repo, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

## Layout

| File | Purpose |
| --- | --- |
| `src/mortgage.ts` | Amortization math (pure functions) |
| `src/tax.ts` | ZIP prefix → state → property tax rate data |
| `src/storage.ts` | Defaults, localStorage persistence, share URLs |
| `src/charts.ts` | Hand-rolled SVG charts |
| `src/main.ts` | Wires the form to the math and rendering |

Estimates only. Not financial advice.
