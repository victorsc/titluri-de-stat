# Titluri de Stat România — Fidelis & Tezaur

Interactive charts tracking the evolution of Romanian government bond yields (Fidelis and Tezaur) from 2020 to present.

**Live site:** https://victorsc.github.io/titluri-de-stat/

---

## What it shows

| Instrument | Type | Currency | Maturities |
|------------|------|----------|------------|
| **Tezaur** | Direct subscription via Ghișeul.ro / Poștă | RON | 1, 3, 5 years |
| **Fidelis** | Secondary market (Bucharest Stock Exchange) | RON | 1–6 years + donor rate |
| **Fidelis** | Secondary market (Bucharest Stock Exchange) | EUR | 1–10 years |

Data source: [fidelis.ro](https://www.fidelis.ro) (Ministerul Finanțelor)

---

## Project structure

```
├── index.html                        # Static site (Chart.js, no framework)
├── data/
│   ├── fidelis.json                  # Fidelis RON + EUR historical rates
│   └── tezaur.json                   # Tezaur historical rates
├── scripts/
│   ├── scrape.js                     # Node.js scraper (cheerio)
│   └── package.json
└── .github/workflows/
    └── update-data.yml               # Runs automatically on 1st & 15th
```

---

## Updating data

### Automatic (GitHub Actions)

A scheduled workflow runs at **08:00 UTC on the 1st and 15th of every month**. It scrapes the current emission from fidelis.ro, appends any new entries to the JSON files, and commits with a message like:

```
chore: auto-update bond data 2026-05-01 [skip ci]
```

You can also trigger it manually from the **Actions** tab → "Update bond data" → **Run workflow**.

### Manual (local)

```bash
cd scripts
npm install
node ../scripts/scrape.js
```

The scraper is idempotent — it skips entries that already exist in the JSON files (matched by date label + maturity).

### Adding data by hand

Each entry in the JSON files follows this shape:

```json
{ "d": "May 2026", "m": 3, "r": 7.25 }
```

| Field | Description |
|-------|-------------|
| `d` | Date label — emission month, e.g. `"May 2026"` or `"Apr–May 2026"` for two-month Tezaur periods |
| `m` | Maturity in years — integer, or `"2d"` for the Fidelis blood-donor 2-year bond |
| `r` | Annual interest rate as a float, e.g. `7.25` for 7.25% |

Append new entries at the end of the relevant array and push — GitHub Pages redeploys automatically.

---

## Tech stack

- **Chart.js 4** — line charts with horizontal scroll, touch tooltips, click-to-toggle legend
- **Vanilla JS + HTML** — no build step, no framework
- **GitHub Pages** — static hosting from `main` branch root
- **GitHub Actions** — scheduled scraping via Node.js + cheerio
