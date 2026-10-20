# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Static GitHub Pages site charting Romanian government bond yields (Fidelis & Tezaur) from 2020 to present. No framework, no build step. Web assets live under `public/`; tooling (scripts, workflows, docs) lives at the repo root.

Live at: https://victorsc.github.io/titluri-de-stat/

## Directory layout

```
public/               ← everything served by GitHub Pages
  index.html          ← main page: Chart.js yield history (Fidelis & Tezaur)
  market.html         ← secondary market screener + portfolio tracker
  style.css           ← all site styles + design tokens (see docs/design-system.md)
  theme.js            ← light/dark toggle (fires 'themechange'), strips .html from the URL
  app.js              ← chart init, tab logic for index.html
  market.js           ← screener + portfolio logic for market.html
  favicon.svg
  robots.txt
  sitemap.xml
  vendor/
    chart.umd.min.js  ← Chart.js 4, vendored (no CDN); Renovate bumps it, refresh-vendor.yml downloads the release
  data/
    fidelis.json      ← Fidelis RON + EUR + donor historical rates
    tezaur.json       ← Tezaur RON historical rates
    fun-facts.json    ← "Did you know" section content
    fidelis_yields.json ← daily snapshot of secondary-market prices (BVB)
  docs/
    preview.png       ← og:image for social sharing

scripts/              ← Node.js tooling (not served)
  scrape.js           ← scrapes fidelis.ro, appends to public/data/fidelis.json & tezaur.json
  fetch-market.js     ← fetches fidelis.pacalab.ro, writes public/data/fidelis_yields.json
  validate-data.js    ← sanity-checks public/data/*.json; run before every data commit

docs/                 ← developer documentation (not served)
  missing-emission-codes.md ← research on secondary-market bond emission dates
  design-system.md    ← tokens, chart palette, type scale, component rules

.github/workflows/
  deploy.yml          ← deploys public/ to GitHub Pages on every push to main
  update-data.yml     ← runs scraper at 08:00 UTC on every odd day of the month
  update-market-data.yml ← fetches secondary-market data daily at 21:00 UTC
  validate-data.yml   ← runs validate-data.js on PRs touching data or scripts
```

## Data format

Every entry in `fidelis.json` / `tezaur.json`: `{ "d": "May 2026", "m": 3, "r": 7.25 }`

- `d` — emission label (`"Mon YYYY"`, or `"Mon1–Mon2 YYYY"` for two-month Tezaur)
- `m` — maturity in years (integer)
- `r` — annual rate as float (7.25 = 7.25%)

`fidelis.json` has three top-level keys: `ron`, `eur`, and `donatori` (itself `{ ron: [], eur: [] }`). Blood-donor bonds live only in the `donatori` arrays, with ordinary numeric `m`. `tezaur.json` is a flat array.

`fidelis_yields.json` is fetched from `fidelis.pacalab.ro` and contains secondary-market bid/ask prices, YTM values (broker commission already embedded), and accrued coupons for all listed Fidelis bonds.

## Chart architecture

- Charts use **Chart.js 4** with `responsive: false` and explicit canvas sizing
- Each chart is wrapped in `.chart-outer > .chart-wrap` — the wrap scrolls horizontally
- Canvas width = `max(containerWidth, labels.length × PX_PER_LABEL)` (26px, in `app.js`) so every label gets space
- Legend is a custom HTML element above the scroll container (stays fixed while scrolling)
- Charts open scrolled to the right (most recent data visible) via `requestAnimationFrame`
- EUR and Donatori charts (Fidelis) are lazy-initialized on first tab click
- Each maturity has a fixed color token (`--mat-<years>`) and point shape (`MAT_SHAPE` in `app.js`); charts repaint on `themechange`

## Design system

See `docs/design-system.md`. Components use semantic tokens only (`--surface`, `--text-muted`, `--positive`…) — no raw hex in component rules. Dark is default; light follows the OS or the header toggle (`<html data-theme>`).

## Running the scraper

```bash
cd scripts && npm install && node ../scripts/scrape.js
```

## Running the market data fetcher

```bash
node scripts/fetch-market.js
```

## Validating data

```bash
node scripts/validate-data.js            # compares against HEAD
node scripts/validate-data.js --base main --allow-shrink   # shrinkage → warning
```

Checks labels, integer maturities, plausible rates, duplicate `(d, m)` pairs, and that no rate history shrinks vs the base ref. Both update workflows run it before committing.

## Scraper notes

- Source pages: `fidelis.ro/emisiuni` (tables) and `fidelis.ro/tezaur` (rate boxes)
- Both pages are server-rendered HTML — no headless browser needed (confirmed: no data API endpoints exist)
- Fidelis date: extracted from `<title>` — "Emisiuni Fidelis [month] [year]"
- Tezaur date: extracted from heading — "Emisiunea Tezaur [month] [year] - [month] [year]"
- Deduplication: entries matched by `(d, m)` pair — safe to run multiple times
- Node 24, ESM (`type: "module"`), single dependency: `cheerio`

## Deployment

GitHub Pages is configured to deploy from GitHub Actions (source: `deploy.yml`). Every push to `main` triggers a deploy of the `public/` directory. Data-update commits also trigger a redeploy so users always see fresh data.

**One-time setup required** (already done for this repo): in GitHub repo Settings → Pages → Source, select "GitHub Actions".

## Dependency management

Renovate is configured (`renovate.json`) to auto-update GitHub Actions and npm dependencies via PRs, running Monday mornings (Europe/Bucharest). The vendored Chart.js is tracked by a regex manager reading its `Chart.js vX.Y.Z` banner; on `renovate/*` PRs, `.github/workflows/refresh-vendor.yml` downloads the matching `chart.umd.min.js` from jsDelivr and commits it. No manual `npm install` is needed for the static site itself — the only `package.json` is under `scripts/`.
