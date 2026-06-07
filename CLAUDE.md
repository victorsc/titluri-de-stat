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
  style.css           ← all site styles
  app.js              ← chart init, tab logic for index.html
  market.js           ← screener + portfolio logic for market.html
  favicon.svg
  robots.txt
  sitemap.xml
  vendor/
    chart.umd.min.js  ← Chart.js 4, vendored (no CDN)
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

docs/                 ← developer documentation (not served)
  missing-emission-codes.md ← research on secondary-market bond emission dates

.github/workflows/
  deploy.yml          ← deploys public/ to GitHub Pages on every push to main
  update-data.yml     ← runs scraper on 1st & 15th of each month
  update-market-data.yml ← fetches secondary-market data daily at 21:00 UTC
```

## Data format

Every entry in `fidelis.json` / `tezaur.json`: `{ "d": "May 2026", "m": 3, "r": 7.25 }`

- `d` — emission label (`"Mon YYYY"` or `"Mon1–Mon2 YYYY"` for two-month Tezaur)
- `m` — maturity in years (integer), or `"2d"` for the Fidelis blood-donor 2-year bond
- `r` — annual rate as float (7.25 = 7.25%)

`fidelis.json` has three top-level keys: `ron`, `eur`, and `donatori` (itself `{ ron: [], eur: [] }` for blood-donor bonds). `tezaur.json` is a flat array.

`fidelis_yields.json` is fetched from `fidelis.pacalab.ro` and contains secondary-market bid/ask prices, YTM values (broker commission already embedded), and accrued coupons for all listed Fidelis bonds.

## Chart architecture

- Charts use **Chart.js 4** with `responsive: false` and explicit canvas sizing
- Each chart is wrapped in `.chart-outer > .chart-wrap` — the wrap scrolls horizontally
- Canvas width = `max(containerWidth, labels.length × 18px)` so every label gets space
- Legend is a custom HTML element above the scroll container (stays fixed while scrolling)
- Charts open scrolled to the right (most recent data visible) via `requestAnimationFrame`
- EUR chart (Fidelis) is lazy-initialized on first tab click

## Running the scraper

```bash
cd scripts && npm install && node ../scripts/scrape.js
```

## Running the market data fetcher

```bash
node scripts/fetch-market.js
```

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

Renovate is configured (`renovate.json`) to auto-update GitHub Actions and npm dependencies via PRs, running Monday mornings (Europe/Bucharest). No manual `npm install` is needed for the static site itself — the only `package.json` is under `scripts/`.
