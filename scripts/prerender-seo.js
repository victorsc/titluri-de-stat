#!/usr/bin/env node
'use strict';

// Prerenders the data-driven answers and tables that make the useful content
// available in the initial HTML. The interactive JavaScript replaces these
// blocks in browsers; crawlers and no-JS readers keep the static version.

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');

const readJson = name => JSON.parse(readFileSync(path.join(publicDir, 'data', name), 'utf8'));
const readPage = name => readFileSync(path.join(publicDir, name), 'utf8');
const writePage = (name, html) => writeFileSync(path.join(publicDir, name), html);

const escapeHtml = value => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#39;');

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function replaceMarked(html, marker, content) {
  const start = `<!-- prerender:${marker}:start -->`;
  const end = `<!-- prerender:${marker}:end -->`;
  const pattern = new RegExp(`${escapeRegExp(start)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!pattern.test(html)) throw new Error(`Missing prerender markers for ${marker}`);
  return html.replace(pattern, `${start}\n      ${content}\n      ${end}`);
}

const RO_MONTH = { Jan: 'ian', Feb: 'feb', Mar: 'mar', Apr: 'apr', May: 'mai', Jun: 'iun',
                   Jul: 'iul', Aug: 'aug', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dec' };
const roLabel = d => d && d.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, m => RO_MONTH[m]);
const fmtDec = (v, min = 2, max = min) =>
  v.toLocaleString('ro-RO', { minimumFractionDigits: min, maximumFractionDigits: max });
const yearsLabel = m => `${m} ${Number(m) === 1 ? 'an' : 'ani'}`;

// Mirrors the latest-emission grouping in app.js, without depending on a DOM.
function latestRows(raw, tag = '') {
  const lastDate = raw[raw.length - 1]?.d;
  if (!lastDate) return { date: null, rows: [] };
  const firstIdx = raw.findIndex(e => e.d === lastDate);
  const rows = raw.filter(e => e.d === lastDate).map(e => {
    let prev = null;
    for (let i = firstIdx - 1; i >= 0; i--) {
      if (raw[i].m === e.m) { prev = raw[i]; break; }
    }
    return { ...e, tag, prev };
  });
  return { date: lastDate, rows };
}

function rateGroups(tezaur, fidelis) {
  const don = fidelis.donatori || { ron: [], eur: [] };
  const donRon = latestRows(don.ron || [], 'RON');
  const donEur = latestRows(don.eur || [], 'EUR');
  const donDates = [...new Set([donRon.date, donEur.date].filter(Boolean))];
  return [
    { title: 'Tezaur', dot: 'tezaur', ...latestRows(tezaur), href: '#tezaur' },
    { title: 'Fidelis RON', dot: 'fidelis', ...latestRows(fidelis.ron || []), href: '#fidelis', tab: 'tab-ron' },
    { title: 'Fidelis EUR', dot: 'fidelis', ...latestRows(fidelis.eur || []), href: '#fidelis', tab: 'tab-eur' },
    { title: 'Fidelis Donatori', dot: 'fidelis', date: donDates.join(' / '), rows: [...donRon.rows, ...donEur.rows], href: '#fidelis', tab: 'tab-don' },
  ].filter(g => g.rows.length);
}

function sortedRows(rows) {
  return rows.slice().sort((a, b) => a.m - b.m || String(a.tag || '').localeCompare(String(b.tag || '')));
}

function rateList(rows) {
  return sortedRows(rows)
    .map(r => `${fmtDec(r.r)}% la ${yearsLabel(r.m)}${r.tag ? ' ' + r.tag : ''}`)
    .join(', ');
}

function rateSummary(groups) {
  return 'Dobânzile cele mai recente: ' + groups
    .map(g => `${g.title} (${roLabel(g.date)}) — ${rateList(g.rows)}`)
    .join('; ') + '.';
}

function deltaHtml(row) {
  if (!row.prev) return '<span class="delta">nou</span>';
  const d = Math.round((row.r - row.prev.r) * 100) / 100;
  const since = `față de ${roLabel(row.prev.d)} (${fmtDec(row.prev.r)}%)`;
  if (d === 0) return `<span class="delta" title="Neschimbat ${since}">neschimbat<span class="visually-hidden"> ${since}</span></span>`;
  const up = d > 0;
  const txt = `${up ? '+' : '−'}${fmtDec(Math.abs(d))} pp`;
  return `<span class="delta ${up ? 'delta-up' : 'delta-down'}" title="${txt} ${since}">${txt}<span class="visually-hidden"> ${since}</span></span>`;
}

function nowGroupHtml({ title, dot, date, rows, href, tab }) {
  const items = sortedRows(rows)
    .map(r => `<li class="now-row">
        <span class="now-mat">${yearsLabel(r.m)}${r.tag ? ' ' + r.tag : ''}</span>
        <span class="now-rate">${fmtDec(r.r)}<small>%</small></span>
        ${deltaHtml(r)}
      </li>`).join('\n');
  return `<div class="now-group">
      <div class="now-group-head">
        <span class="dot dot-${dot}" aria-hidden="true"></span>
        <h3>${escapeHtml(title)}</h3>
        <span class="now-group-date">${escapeHtml(roLabel(date))}</span>
      </div>
      <ul class="now-list">${items}</ul>
      <a class="now-link" href="${href}"${tab ? ` data-tab="${tab}"` : ''}>Vezi istoricul</a>
    </div>`;
}

function formatDate(isoStr) {
  const [year, month, day] = isoStr.split('-').map(Number);
  const months = Object.values(RO_MONTH);
  return `${day} ${months[month - 1]} ${year}`;
}

function yrsLeftLabel(maturityStr, referenceDate) {
  const totalMs = new Date(maturityStr) - referenceDate;
  if (totalMs <= 0) return 'expirat';
  const totalMonths = Math.round(totalMs / (30.4375 * 24 * 3600 * 1000));
  if (totalMonths < 12) return totalMonths === 1 ? '1 lună' : totalMonths + ' luni';
  const yrs = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yrsStr = yrs === 1 ? '1 an' : yrs + ' ani';
  const moStr = months === 1 ? '1 lună' : months + ' luni';
  return months === 0 ? yrsStr : yrsStr + ' ' + moStr;
}

const fmtPct = v => fmtDec(v) + '%';
const isLiquid = s => Number.isFinite(s.BidYTM) && Number.isFinite(s.AskYTM) && (s.BidYTM - s.AskYTM) <= 1.0;

function bestLiquid(bonds) {
  return bonds.filter(isLiquid).reduce((best, s) => s.AskYTM > (best?.AskYTM ?? -Infinity) ? s : best, null);
}

function marketSummary(mkt, issued) {
  const date = formatDate(mkt.transaction_date);
  const countLabel = n => `${n}${n >= 20 ? ' de' : ''} obligațiuni`;
  const [ronCount, eurCount] = ['RON', 'EUR'].map(ccy => countLabel(issued.filter(s => s.Currency === ccy).length));
  const bests = ['RON', 'EUR']
    .map(ccy => [ccy, bestLiquid(issued.filter(s => s.Currency === ccy))])
    .filter(([, best]) => best)
    .map(([ccy, best]) => `${best.Symbol} la ${fmtPct(best.AskYTM)} în ${ccy}`)
    .join(' și ');
  return `Snapshotul BVB din ${date} include ${ronCount} Fidelis în RON și ${eurCount} în EUR.${bests ? ` Cel mai mare AskYTM lichid este ${bests}.` : ''}`;
}

function staticMarketTable(bonds, mkt, ccy) {
  const referenceDate = new Date(`${mkt.transaction_date}T00:00:00Z`);
  const rows = bonds
    .slice()
    .sort((a, b) => new Date(a.Maturity) - new Date(b.Maturity))
    .map(s => {
      const spread = s.BidYTM - s.AskYTM;
      return `<tr>
          <td data-label="Simbol"><code class="sym">${escapeHtml(s.Symbol)}</code></td>
          <td data-label="Maturitate">${formatDate(s.Maturity)}</td>
          <td data-label="Timp rămas">${yrsLeftLabel(s.Maturity, referenceDate)}</td>
          <td data-label="Cupon" class="num-cell">${fmtPct(s.Coupon)}</td>
          <td data-label="AskYTM" class="num-cell"><strong>${fmtPct(s.AskYTM)}</strong></td>
          <td data-label="BidYTM" class="num-cell">${fmtPct(s.BidYTM)}</td>
          <td data-label="Spread" class="num-cell">${fmtPct(spread)}</td>
          <td data-label="Preț Ask" class="num-cell">${fmtDec(s.AskPrice)}</td>
        </tr>`;
    }).join('\n');

  return `<p class="seo-data-note"><strong>Obligațiuni în ${ccy}.</strong> Snapshot static al prețurilor BVB din ${formatDate(mkt.transaction_date)}; valorile sunt regenerate în browser pentru filtrare și sortare.</p>
      <div class="table-wrap">
        <table class="market-table">
          <thead><tr>
            <th scope="col">Simbol</th>
            <th scope="col">Maturitate</th>
            <th scope="col">Timp rămas</th>
            <th scope="col" class="num-cell">Cupon</th>
            <th scope="col" class="num-cell">AskYTM</th>
            <th scope="col" class="num-cell">BidYTM</th>
            <th scope="col" class="num-cell">Spread</th>
            <th scope="col" class="num-cell">Preț Ask</th>
          </tr></thead>
          <tbody>
${rows}
          </tbody>
        </table>
      </div>`;
}

const tezaur = readJson('tezaur.json');
const fidelis = readJson('fidelis.json');
const market = readJson('fidelis_yields.json');

const groups = rateGroups(tezaur, fidelis);
let indexHtml = readPage('index.html');
indexHtml = replaceMarked(indexHtml, 'rate-summary', escapeHtml(rateSummary(groups)));
indexHtml = replaceMarked(indexHtml, 'rates', groups.map(nowGroupHtml).join('\n\n'));
writePage('index.html', indexHtml);

const issued = market.symbols.filter(s => s._issued === 1);
let marketHtml = readPage('market.html');
marketHtml = replaceMarked(marketHtml, 'market-summary', escapeHtml(marketSummary(market, issued)));
for (const ccy of ['RON', 'EUR']) {
  marketHtml = replaceMarked(
    marketHtml,
    `market-${ccy.toLowerCase()}`,
    staticMarketTable(issued.filter(s => s.Currency === ccy), market, ccy),
  );
}
writePage('market.html', marketHtml);

console.log(`Prerendered ${groups.length} rate groups and ${issued.length} market rows.`);
