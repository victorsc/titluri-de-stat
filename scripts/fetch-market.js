import { writeFileSync } from 'node:fs';

const SOURCE = 'https://fidelis.pacalab.ro/data/fidelis_yields.json';
const OUT = new URL('../public/data/fidelis_yields.json', import.meta.url).pathname;

const res = await fetch(SOURCE);
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}
const json = await res.json();

if (!Array.isArray(json.symbols) || json.symbols.length === 0) {
  console.error('Invalid payload — missing or empty symbols array');
  process.exit(1);
}

writeFileSync(OUT, JSON.stringify(json, null, 2) + '\n');
console.log(`Wrote ${json.symbols.length} symbols, transaction_date=${json.transaction_date}`);
