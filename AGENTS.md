# AGENTS.md

Guidance for AI coding agents (and humans) working in this repo.

## Purpose

A mortgage calculator that runs entirely in the browser and is hosted on GitHub Pages:
https://mbriones98.github.io/mortgage-calculator/

It estimates a monthly payment (principal & interest, property tax, insurance, PMI, HOA), shows property tax for the user's ZIP code, and charts how the loan balance, interest, and equity change over time. Defaults and local tax data are **tuned for the Portland, OR metro**, but it works for any U.S. ZIP.

There is no backend, no database, no API keys, and no live data feeds. All data is embedded in the source and was researched by hand (see [Research](#research)).

## Stack

- **TypeScript** (strict, `noUncheckedIndexedAccess`) compiled with plain `tsc`. No bundler and no framework.
- **Native ES modules** in the browser (`<script type="module" src="js/main.js">`). Imports inside `src/` must use `.js` extensions (e.g. `import { x } from "./tax.js"`) because `tsc` doesn't rewrite paths.
- **Plain HTML + CSS.** The theme uses CSS custom properties on `:root` with light/dark variants. Charts are hand-written SVG; there are no chart libraries.
- **Zero runtime dependencies.** The only dev dependency is `typescript`.
- **Persistence:** `localStorage` (key `mortgage-calculator:v1`), with URL query params taking priority for share links.
- **Deploy:** `.github/workflows/deploy.yml` builds on every push to `main` and publishes `dist/` to GitHub Pages (Pages source is set to "GitHub Actions").

## Commands

```bash
npm install
npm run build      # rm -rf dist && tsc && cp index.html styles.css dist/
npm run serve      # python3 http.server on :8000 serving dist/ (ES modules need http, not file://)
npm run watch      # tsc --watch (re-run build after editing index.html or styles.css)
npm run typecheck  # tsc --noEmit
```

There is no test suite yet. Verify math changes by importing the compiled modules from `dist/js` with `node --input-type=module`. A known-good check: a $320,000 loan at 6.5% for 30 years should give a monthly P&I of **$2,022.62**.

## Layout

| Path | What it does |
| --- | --- |
| `index.html` | Page markup: form, results cards, sources & methodology section |
| `styles.css` | All styling and color tokens (light + dark) |
| `src/mortgage.ts` | Pure amortization math and PMI rules. **No DOM access.** |
| `src/tax.ts` | ZIP → state mapping, state property tax rates, Portland/Vancouver county overrides |
| `src/storage.ts` | `FormState` type, `DEFAULT_STATE`, localStorage load/save, share URLs |
| `src/charts.ts` | SVG payment breakdown, balance/equity chart, state tax strip |
| `src/format.ts` | Currency / percent / duration formatting |
| `src/main.ts` | Reads the form, calls the math, renders everything, wires events |
| `FACTCHECK.md` | Research report behind every number in the app |

## Conventions

- Keep `mortgage.ts` pure (inputs in, numbers out) so it can be tested without a browser.
- **Adding a field to `FormState`:** add it to `DEFAULT_STATE` and handle it in `sanitize()` in `storage.ts` (stored and URL values are untrusted). Then wire it in `writeForm` / `readForm` in `main.ts`.
- **Changing a data value** (rates, defaults): update the code comment with the source and date, update the matching entry in the **Sources & methodology** section of `index.html`, and note it in `FACTCHECK.md`.
- Use `textContent` (not `innerHTML`) for anything derived from user input.
- The page must work at phone widths (grid columns use `minmax(0, 1fr)`), and in both light and dark themes.

## Research

All figures were fact-checked on 2026-11-18. Start with **[`FACTCHECK.md`](FACTCHECK.md)**, which has a summary table, the reasoning for each item, and links. Key points:

- **Loan model:** standard fixed-rate, fully amortizing annuity formula with monthly compounding. Equity = home price − balance (no appreciation).
- **PMI:** follows the Homeowners Protection Act ([12 U.S.C. §4901](https://www.law.cornell.edu/uscode/text/12/4901), [§4902](https://www.law.cornell.edu/uscode/text/12/4902)). PMI ends at the earliest of 78% LTV on the *original* schedule (automatic), 80% of the *actual* balance (on request; a user toggle), or the loan midpoint.
- **State tax rates:** [Tax Foundation, Property Taxes by State and County, 2026](https://taxfoundation.org/data/all/state/property-taxes-by-state-county/) (2024 ACS). Some states not flagged as stale are from the prior edition.
- **Portland (Multnomah) 1.15%:** [Oregon DOR, Property Tax Statistics FY 2025-26](https://www.oregon.gov/dor/programs/gov-research/Documents/FY%202025-26%20Oregon%20Property%20Tax%20Statistics%20Report-UA.pdf) (1.20% of real market value). This matched a real Portland estimate ($600/mo on a $625k home).
- **Oregon caveat:** under Measures 5 and 50, tax is based on *assessed value*, which does not reset on sale. A "% of price" estimate can be far off for an individual home, which is why the UI offers a "$ per year" override in the Advanced section.
- **ZIP → county lists:** checked against the [Census 2020 ZCTA-to-county relationship file](https://www2.census.gov/geo/docs/maps-data/data/rel2020/zcta520/), using a ≥70% land-area threshold. 972xx is not all Multnomah; for example, 97229 is mostly in Washington County.
- **Defaults:** 7.1% rate ([Freddie Mac PMMS](https://www.freddiemac.com/pmms), week of 2026-11-12; static, not a live feed, by decision); $545k home price (RMLS Portland-metro median, Sept 2026); $1,850/yr insurance (NerdWallet, Portland).

## Known gaps / ideas

- Most state rates outside the refreshed set should be updated from the Tax Foundation 2026 table in one pass.
- No automated tests. A small `node:test` suite over `dist/js/mortgage.js` would be a good first addition.
- No appreciation, tax, or insurance escalation inputs.
- GitHub Actions in `deploy.yml` run on Node 20 action versions, which triggers a deprecation warning. Bump them when convenient.
