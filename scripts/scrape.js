/**
 * Scrapes fidelis.ro/emisiuni and fidelis.ro/tezaur for current bond rates
 * and appends any new entries to data/fidelis.json and data/tezaur.json.
 *
 * Run manually:  node scripts/scrape.js
 * Run via CI:    see .github/workflows/update-data.yml
 */

import { load } from 'cheerio';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR  = join(__dirname, '..', 'data');
const UA = 'Mozilla/5.0 (compatible; titluri-de-stat-bot/1.0)';

// Romanian month → English abbreviation
const RO_TO_EN = {
  ianuarie: 'Jan', februarie: 'Feb', martie: 'Mar', aprilie: 'Apr',
  mai: 'May', iunie: 'Jun', iulie: 'Jul', august: 'Aug',
  septembrie: 'Sep', octombrie: 'Oct', noiembrie: 'Nov', decembrie: 'Dec',
};

function roToEn(word) {
  return RO_TO_EN[word.toLowerCase().trim()] ?? word;
}

function parseRate(str) {
  return parseFloat(str.replace('%', '').replace(',', '.').trim());
}

function isDuplicate(arr, entry) {
  return arr.some(e => e.d === entry.d && String(e.m) === String(entry.m));
}

// ── Fidelis scraper ───────────────────────────────────────────────────────────
async function scrapeFidelis() {
  console.log('Fetching fidelis.ro/emisiuni …');
  const html = await fetch('https://www.fidelis.ro/emisiuni', {
    headers: { 'User-Agent': UA },
  }).then(r => r.text());

  const $ = load(html);

  // Date label from page title: "Emisiuni Fidelis aprilie 2026 | …"
  const titleText = $('title').text();
  const tm = titleText.match(/fidelis\s+(\w+)\s+(\d{4})/i);
  if (!tm) throw new Error(`Cannot extract date from Fidelis title: "${titleText}"`);
  const dateLabel = `${roToEn(tm[1])} ${tm[2]}`;
  console.log(`  Fidelis emission: ${dateLabel}`);

  const result = { ron: [], eur: [], donatori: { ron: [], eur: [] } };

  $('table').each((tableIdx, table) => {
    if (tableIdx > 1) return false; // only first 2 tables (RON, EUR)
    const isEur = tableIdx === 1;
    const target = isEur ? result.eur : result.ron;

    $(table).find('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      let maturity = null, rate = null, isDonatori = false;

      tds.each((_, td) => {
        const text = $(td).text().trim();
        // "2 ani" / "10 ani"
        const mMatch = text.match(/^(\d+)\s*ani?$/i);
        if (mMatch) maturity = parseInt(mMatch[1]);
        // "6,60%"
        if (/^\d+,\d+%$/.test(text)) rate = parseRate(text);
        if (/donatori/i.test(text)) isDonatori = true;
      });

      if (!maturity || rate == null || isNaN(rate)) return;

      if (isDonatori) {
        result.donatori[isEur ? 'eur' : 'ron'].push({ d: dateLabel, m: maturity, r: rate });
      } else {
        target.push({ d: dateLabel, m: maturity, r: rate });
      }
    });
  });

  if (!result.ron.length && !result.eur.length) {
    throw new Error('Fidelis: no data rows found — page structure may have changed');
  }
  console.log(`  RON: ${result.ron.length} entries, EUR: ${result.eur.length} entries, donatori RON: ${result.donatori.ron.length}, EUR: ${result.donatori.eur.length}`);
  return result;
}

// ── Tezaur scraper ────────────────────────────────────────────────────────────
async function scrapeTezaur() {
  console.log('Fetching fidelis.ro/tezaur …');
  const html = await fetch('https://www.fidelis.ro/tezaur', {
    headers: { 'User-Agent': UA },
  }).then(r => r.text());

  const $ = load(html);

  // Date label from heading: "Emisiunea Tezaur aprilie 2026 - mai 2026"
  const bodyText = $('body').text();
  const hm = bodyText.match(
    /Emisiunea\s+Tezaur\s+(\w+)\s+(\d{4})(?:\s*[-–]\s*(\w+)\s+\d{4})?/i
  );
  if (!hm) throw new Error('Tezaur: cannot find emission heading');
  const m1   = roToEn(hm[1]);
  const year = hm[2];
  const m2   = hm[3] ? roToEn(hm[3]) : null;
  const dateLabel = m2 ? `${m1}–${m2} ${year}` : `${m1} ${year}`;
  console.log(`  Tezaur emission: ${dateLabel}`);

  // Rates from the 3-box grid: <h3>1 an</h3> … <p class="text-3xl …">6,50%</p>
  const entries = [];
  $('h3').each((_, h3) => {
    const mText  = $(h3).text().trim();
    const mMatch = mText.match(/^(\d+)\s*ani?$/i);
    if (!mMatch) return;
    const maturity = parseInt(mMatch[1]);

    const rateEl = $(h3).siblings('p').filter((_, p) =>
      $(p).attr('class')?.includes('text-3xl')
    ).first();
    if (!rateEl.length) return;

    const rate = parseRate(rateEl.text().trim());
    if (!isNaN(rate)) entries.push({ d: dateLabel, m: maturity, r: rate });
  });

  if (!entries.length) throw new Error('Tezaur: no rate boxes found — page structure may have changed');
  console.log(`  Tezaur: ${entries.length} entries`);
  return entries;
}

// ── Merge & persist ───────────────────────────────────────────────────────────
function readJSON(file) {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
}

function writeJSON(file, data) {
  writeFileSync(join(DATA_DIR, file), JSON.stringify(data, null, 2) + '\n', 'utf8');
}

async function main() {
  let changed = false;

  // --- Fidelis ---
  try {
    const scraped  = await scrapeFidelis();
    const existing = readJSON('fidelis.json');

    if (!existing.donatori) existing.donatori = { ron: [], eur: [] };
    if (!existing.donatori.ron) existing.donatori.ron = [];
    if (!existing.donatori.eur) existing.donatori.eur = [];
    for (const entry of scraped.ron) {
      if (!isDuplicate(existing.ron, entry)) {
        existing.ron.push(entry);
        console.log(`  + fidelis.ron  ${entry.d} m=${entry.m} r=${entry.r}`);
        changed = true;
      }
    }
    for (const entry of scraped.eur) {
      if (!isDuplicate(existing.eur, entry)) {
        existing.eur.push(entry);
        console.log(`  + fidelis.eur  ${entry.d} m=${entry.m} r=${entry.r}`);
        changed = true;
      }
    }
    for (const entry of scraped.donatori.ron) {
      if (!isDuplicate(existing.donatori.ron, entry)) {
        existing.donatori.ron.push(entry);
        console.log(`  + fidelis.donatori.ron  ${entry.d} m=${entry.m} r=${entry.r}`);
        changed = true;
      }
    }
    for (const entry of scraped.donatori.eur) {
      if (!isDuplicate(existing.donatori.eur, entry)) {
        existing.donatori.eur.push(entry);
        console.log(`  + fidelis.donatori.eur  ${entry.d} m=${entry.m} r=${entry.r}`);
        changed = true;
      }
    }
    if (changed) writeJSON('fidelis.json', existing);
  } catch (err) {
    console.error('Fidelis scrape failed:', err.message);
  }

  // --- Tezaur ---
  let tezaurChanged = false;
  try {
    const scraped  = await scrapeTezaur();
    const existing = readJSON('tezaur.json');

    for (const entry of scraped) {
      if (!isDuplicate(existing, entry)) {
        existing.push(entry);
        console.log(`  + tezaur  ${entry.d} m=${entry.m} r=${entry.r}`);
        tezaurChanged = true;
      }
    }
    if (tezaurChanged) writeJSON('tezaur.json', existing);
    changed = changed || tezaurChanged;
  } catch (err) {
    console.error('Tezaur scrape failed:', err.message);
  }

  console.log(changed ? '\nDone — data files updated.' : '\nDone — no new data.');
  process.exit(0);
}

main();
