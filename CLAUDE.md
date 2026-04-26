# CLAUDE.md

## Project overview

Static GitHub Pages site charting Romanian government bond yields (Fidelis & Tezaur) from 2020 to present. No framework, no build step — just `index.html`, two JSON data files, and a Node.js scraper.

Live at: https://victorsc.github.io/titluri-de-stat/

## Key files

| File | Purpose |
|------|---------|
| `index.html` | Page shell — loads Chart.js, app.js, style.css |
| `style.css` | All site styles |
| `app.js` | Chart initialization, tab logic, all frontend JS |
| `vendor/chart.umd.min.js` | Bundled Chart.js 4 (vendored, no CDN) |
| `data/fidelis.json` | Fidelis RON + EUR + donor historical rates |
| `data/tezaur.json` | Tezaur RON historical rates |
| `data/fun-facts.json` | Fun facts shown in the "Did you know" section |
| `scripts/scrape.js` | Scraper — fetches fidelis.ro, appends new entries |
| `.github/workflows/update-data.yml` | Runs scraper on 1st & 15th of each month |

## Data format

Every entry in both JSON files: `{ "d": "May 2026", "m": 3, "r": 7.25 }`

- `d` — emission label (`"Mon YYYY"` or `"Mon1–Mon2 YYYY"` for two-month Tezaur)
- `m` — maturity in years (integer)
- `r` — annual rate as float (7.25 = 7.25%)

`fidelis.json` has three top-level keys: `ron`, `eur`, and `donatori` (itself `{ ron: [], eur: [] }` for blood-donor bonds). `tezaur.json` is a flat array.

## Chart architecture

- Charts use **Chart.js 4** with `responsive: false` and explicit canvas sizing
- Each chart is wrapped in `.chart-outer > .chart-wrap` — the wrap scrolls horizontally
- Canvas width = `max(containerWidth, labels.length × 18px)` so every label gets space
- Legend is a custom HTML element above the scroll container (stays fixed while scrolling)
- Charts open scrolled to the right (most recent data visible) via `requestAnimationFrame`
- EUR chart (Fidelis) is lazy-initialized on first tab click

## Scraper notes

- Source pages: `fidelis.ro/emisiuni` (tables) and `fidelis.ro/tezaur` (rate boxes)
- Both pages are server-rendered HTML — no headless browser needed
- Fidelis date: extracted from `<title>` — "Emisiuni Fidelis [month] [year]"
- Tezaur date: extracted from heading — "Emisiunea Tezaur [month] [year] - [month] [year]"
- Deduplication: entries matched by `(d, m)` pair — safe to run multiple times
- Node 24, ESM (`type: "module"`), single dependency: `cheerio`

## Deployment

Push to `main` → GitHub Pages rebuilds automatically (no CI needed for the site itself).
The scraper workflow commits with `[skip ci]` to avoid triggering a redundant Pages build loop.
