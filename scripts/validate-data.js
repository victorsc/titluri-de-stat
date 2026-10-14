/**
 * Sanity-checks the JSON files under public/data/ before they are committed
 * and deployed. Exits 1 and lists the problems if any check fails.
 *
 * Usage:  node scripts/validate-data.js [--base <git-ref>]
 *
 * With a git ref (default: HEAD), the rate histories must not lose entries
 * compared to that ref: the scraper only ever appends.
 */

import { readFileSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA = 'public/data';

const MON = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';
// "May 2026", "Apr–May 2026", "Dec 2026–Jan 2027"
const LABEL_RE = new RegExp(`^${MON}(–${MON})? \\d{4}$|^${MON} \\d{4}–${MON} \\d{4}$`);
const SYMBOL_RE = /^R\d{4}[A-Z]{1,2}\*?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const errors = [];
const fail = msg => errors.push(msg);

const baseIdx = process.argv.indexOf('--base');
const baseRef = baseIdx !== -1 ? process.argv[baseIdx + 1] : 'HEAD';

function readCurrent(file) {
  try {
    return JSON.parse(readFileSync(join(ROOT, DATA, file), 'utf8'));
  } catch (err) {
    fail(`${file}: ${err.message}`);
    return null;
  }
}

function readBase(file) {
  try {
    const txt = execFileSync('git', ['show', `${baseRef}:${DATA}/${file}`], {
      cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(txt);
  } catch {
    return null; // no git, unknown ref, or file is new
  }
}

function checkRates(where, arr, baseArr) {
  if (!Array.isArray(arr) || arr.length === 0) {
    fail(`${where}: missing or empty array`);
    return;
  }
  const seen = new Set();
  arr.forEach((e, i) => {
    const at = `${where}[${i}]`;
    if (typeof e?.d !== 'string' || !LABEL_RE.test(e.d)) fail(`${at}.d is not a valid label: ${JSON.stringify(e?.d)}`);
    if (!Number.isInteger(e?.m) || e.m < 1 || e.m > 30) fail(`${at}.m is not a maturity in years: ${JSON.stringify(e?.m)}`);
    if (!Number.isFinite(e?.r) || e.r <= 0 || e.r >= 30) fail(`${at}.r is not a plausible rate: ${JSON.stringify(e?.r)}`);
    const key = `${e?.d}|${e?.m}`;
    if (seen.has(key)) fail(`${at} duplicates (d, m) = (${e?.d}, ${e?.m})`);
    seen.add(key);
  });
  if (Array.isArray(baseArr) && arr.length < baseArr.length) {
    fail(`${where}: shrank from ${baseArr.length} to ${arr.length} entries vs ${baseRef}`);
  }
}

// --- fidelis.json / tezaur.json ---
const fidelis = readCurrent('fidelis.json');
const fidelisBase = readBase('fidelis.json');
if (fidelis) {
  checkRates('fidelis.ron', fidelis.ron, fidelisBase?.ron);
  checkRates('fidelis.eur', fidelis.eur, fidelisBase?.eur);
  checkRates('fidelis.donatori.ron', fidelis.donatori?.ron, fidelisBase?.donatori?.ron);
  checkRates('fidelis.donatori.eur', fidelis.donatori?.eur, fidelisBase?.donatori?.eur);
}

const tezaur = readCurrent('tezaur.json');
if (tezaur) checkRates('tezaur', tezaur, readBase('tezaur.json'));

// --- fun-facts.json ---
const facts = readCurrent('fun-facts.json');
if (facts) {
  if (!Array.isArray(facts) || facts.length === 0) fail('fun-facts: missing or empty array');
  else facts.forEach((f, i) => {
    if (typeof f?.title !== 'string' || !f.title) fail(`fun-facts[${i}].title is missing`);
    if (typeof f?.body !== 'string' || !f.body) fail(`fun-facts[${i}].body is missing`);
  });
}

// --- fidelis_yields.json (full payload validation lives in fetch-market.js) ---
const yields = readCurrent('fidelis_yields.json');
if (yields) {
  if (typeof yields.transaction_date !== 'string' || !ISO_DATE_RE.test(yields.transaction_date)) {
    fail('fidelis_yields.transaction_date is not an ISO date');
  }
  if (!Array.isArray(yields.symbols) || yields.symbols.length === 0) {
    fail('fidelis_yields.symbols: missing or empty array');
  } else {
    yields.symbols.forEach((s, i) => {
      if (typeof s?.Symbol !== 'string' || !SYMBOL_RE.test(s.Symbol)) fail(`fidelis_yields.symbols[${i}].Symbol is invalid`);
    });
  }
}

if (errors.length) {
  console.error(`Data validation failed — ${errors.length} problem(s):`);
  errors.slice(0, 50).forEach(e => console.error('  ' + e));
  process.exit(1);
}
console.log('Data validation passed.');
