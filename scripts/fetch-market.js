import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SOURCE = 'https://fidelis.pacalab.ro/data/fidelis_yields.json';
const OUT = fileURLToPath(new URL('../public/data/fidelis_yields.json', import.meta.url));

const SYMBOL_RE = /^R\d{4}[A-Z]{1,2}\*?$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES = new Set(['RON', 'EUR']);
const NUMERIC_FIELDS = [
  'Coupon', 'LastPrice', 'BidPrice', 'BidVol', 'AskPrice', 'AskVol',
  'AccruedCoupon', 'DirtyBid', 'DirtyAsk', 'DirtyLast',
  'BidYTM', 'AskYTM', 'LastYTM', 'BidCY', 'AskCY', 'LastCY',
];

const isIsoDate = v => typeof v === 'string' && ISO_DATE_RE.test(v) && !Number.isNaN(Date.parse(v));

function validate(json) {
  const errors = [];
  if (!isIsoDate(json.transaction_date)) errors.push('transaction_date is not an ISO date');
  if (!isIsoDate(json.settlement_date)) errors.push('settlement_date is not an ISO date');
  if (!Array.isArray(json.symbols) || json.symbols.length === 0) {
    errors.push('missing or empty symbols array');
    return errors;
  }
  json.symbols.forEach((s, i) => {
    const where = `symbols[${i}]`;
    if (typeof s?.Symbol !== 'string' || !SYMBOL_RE.test(s.Symbol)) errors.push(`${where}.Symbol is invalid`);
    if (!CURRENCIES.has(s?.Currency)) errors.push(`${where}.Currency is invalid`);
    if (!isIsoDate(s?.Maturity)) errors.push(`${where}.Maturity is not an ISO date`);
    for (const f of NUMERIC_FIELDS) {
      if (!Number.isFinite(s?.[f])) errors.push(`${where}.${f} is not a finite number`);
    }
    if (s?._issued !== 0 && s?._issued !== 1) errors.push(`${where}._issued must be 0 or 1`);
  });
  return errors;
}

const res = await fetch(SOURCE, { signal: AbortSignal.timeout(30_000) });
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const json = await res.json();

const errors = validate(json);
if (errors.length) {
  console.error(`Invalid payload — ${errors.length} problem(s):`);
  errors.slice(0, 20).forEach(e => console.error('  ' + e));
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(json, null, 2) + '\n');
console.log(`Wrote ${json.symbols.length} symbols, transaction_date=${json.transaction_date}`);
