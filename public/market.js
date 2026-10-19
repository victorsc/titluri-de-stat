'use strict';

// ===== State =====
let _mkt = null;
let _holdings = [];
let _emissionMap = {};
let _donorMap = {};   // symbol → true/false, from the matched emission

const BANDS = ['0-1', '1-2', '2-3', '3-5', '5+'];
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// ===== Boot =====
Promise.all([
  fetch('data/fidelis_yields.json').then(r => { if (!r.ok) throw r.status; return r.json(); }),
  fetch('data/fidelis.json').then(r => r.ok ? r.json() : null).catch(() => null),
])
  .then(([mktData, fidData]) => {
    _mkt = mktData;
    if (fidData) ({ labels: _emissionMap, donor: _donorMap } = buildEmissionMap(fidData));
    _holdings = loadHoldings();
    init();
  })
  .catch(() => { document.getElementById('load-error').hidden = false; });

function init() {
  showFreshness();
  const issued = _mkt.symbols.filter(s => s._issued === 1);
  const upcoming = _mkt.symbols.filter(s => s._issued === 0);
  const labels = computeBuyLabels(issued);
  buildScreener(issued, labels);
  buildUpcoming(upcoming, issued);
  buildPortfolio(issued);
  setupTabs();
  setupTooltips();
  setupHoldingForm(issued);
  setupDespreLinks();
  setupCardLayout();
}

// Links into the explainers open the matching accordion: "Cum funcționează"
// the first one, "Ce înseamnă coloanele?" the glossary.
function setupDespreLinks() {
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href="#despre"], a[href="#glosar"]');
    if (!a) return;
    const target = a.getAttribute('href') === '#glosar'
      ? document.getElementById('glosar')
      : document.querySelector('#despre details');
    if (target) target.open = true;
  });
}

// Below 1040px the tables render as cards and the header row is only
// visually hidden; make it inert so its sort and tooltip controls leave the
// tab order (the toolbar's sort select and glossary link replace them).
const CARD_LAYOUT = window.matchMedia('(max-width: 1040px)');
function setupCardLayout() {
  const apply = () => document.querySelectorAll('.market-table thead').forEach(t => { t.inert = CARD_LAYOUT.matches; });
  CARD_LAYOUT.addEventListener('change', apply);
  apply();
}

// ===== Emission Date Lookup =====
const _MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
// Display-only: emission labels keep English abbreviations in the data.
const _MONTH_RO = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','nov','dec'];
const roLabel = d => d && d.replace(/\b[A-Z][a-z]{2}\b/g, m => _MONTH_RO[_MONTH_ABBR.indexOf(m)] ?? m);

// Matches each listed symbol to the emission it came from. Several tranches
// can mature in the same month (e.g. R2802C, Feb 2026 2y, and the Feb 2025
// 3y bond), so the coupon is the deciding key; maturity month alone is only a
// fallback for emissions whose rate isn't in fidelis.json. The suffix letter
// is a tranche sequence, not a donor flag (R2412BE was a regular EUR bond),
// so it only breaks ties. Donor status comes from the array that matched.
function buildEmissionMap(fid) {
  const entries = [
    ...(fid.ron || []).map(e => ({...e, src: 'ron'})),
    ...(fid.eur || []).map(e => ({...e, src: 'eur'})),
    ...((fid.donatori && fid.donatori.ron) || []).map(e => ({...e, src: 'don-ron'})),
    ...((fid.donatori && fid.donatori.eur) || []).map(e => ({...e, src: 'don-eur'})),
  ].filter(e => typeof e.m === 'number');

  const map = {}, donor = {};
  const issued = _mkt.symbols.filter(s => s._issued === 1);

  for (const s of issued) {
    const matDate = new Date(s.Maturity);
    const sym = s.Symbol;
    const isEur = s.Currency === 'EUR';
    let pref;
    if (/BE$/.test(sym)) pref = 'don-eur';
    else if (/E$/.test(sym)) pref = 'eur';
    else if (/[BD]$/.test(sym)) pref = 'don-ron';
    else pref = 'ron';

    let best = null, bestScore = Infinity;
    for (const e of entries) {
      if (e.src.endsWith('eur') !== isEur) continue;
      const parts = e.d.match(/^([A-Za-z]{3})[\s\S]*?(\d{4})$/);
      if (!parts) continue;
      const mi = _MONTH_ABBR.indexOf(parts[1]);
      const yr = parseInt(parts[2]);
      if (mi === -1 || isNaN(yr)) continue;
      const expMat = new Date(yr, mi, 1);
      expMat.setMonth(expMat.getMonth() + Math.round(e.m * 12));
      const deltaMo = Math.abs(
        (matDate.getFullYear() - expMat.getFullYear()) * 12 +
        (matDate.getMonth() - expMat.getMonth())
      );
      if (deltaMo > 2) continue;
      const couponMatch = Math.abs(e.r - s.Coupon) < 0.001;
      if (!couponMatch && e.src !== pref) continue;
      // Coupon match dominates, then maturity distance, then preferred array.
      const score = (couponMatch ? 0 : 100) + deltaMo * 2 + (e.src === pref ? 0 : 1);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    if (best) {
      map[sym] = best.d;
      donor[sym] = best.src.startsWith('don');
    }
  }
  return { labels: map, donor };
}

// ===== Freshness =====
function showFreshness() {
  const el = document.getElementById('freshness-badge');
  if (!el || !_mkt.transaction_date) return;
  el.textContent = 'Prețuri BVB din ' + formatDate(_mkt.transaction_date);
  el.hidden = false;
}

// ===== Helpers =====
function bandOf(maturityStr) {
  const yrs = (new Date(maturityStr) - Date.now()) / MS_PER_YEAR;
  if (yrs < 1) return '0-1';
  if (yrs < 2) return '1-2';
  if (yrs < 3) return '2-3';
  if (yrs < 5) return '3-5';
  return '5+';
}

function quartile(sorted, q) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  return base + 1 < sorted.length
    ? sorted[base] + (pos - base) * (sorted[base + 1] - sorted[base])
    : sorted[base];
}

function fmtPct(v) { return (+v).toFixed(2) + '%'; }

function fmtNum(v) {
  return (+v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoStr) {
  return new Date(isoStr).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
}

function yrsLeftLabel(maturityStr) {
  const totalMs = new Date(maturityStr) - Date.now();
  if (totalMs <= 0) return 'expirat';
  const totalMonths = Math.round(totalMs / (30.4375 * 24 * 3600 * 1000));
  if (totalMonths < 12) return totalMonths === 1 ? '1 lună' : totalMonths + ' luni';
  const yrs = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const yrsStr = yrs === 1 ? '1 an' : yrs + ' ani';
  const moStr = months === 1 ? '1 lună' : months + ' luni';
  return months === 0 ? yrsStr : yrsStr + ' ' + moStr;
}

function currencyOf(symbol, issued) {
  const m = issued.find(s => s.Symbol === symbol);
  return m ? m.Currency : (symbol.endsWith('E') ? 'EUR' : 'RON');
}

// Prefer the matched emission; the suffix is only a guess for bonds with
// no match (e.g. upcoming ones), since B/BE has also been used for regular
// tranches (R2412BE, R2612BE).
function isDonorBond(sym) {
  const s = sym.replace('*', '');
  if (s in _donorMap) return _donorMap[s];
  return /B$/.test(s) || /D$/.test(s) || /BE$/.test(s);
}

function parseEmissionDate(label) {
  if (!label || label === '—') return null;
  const m = label.match(/([A-Za-z]{3})[\s\S]*?(\d{4})/);
  if (!m) return null;
  const mi = _MONTH_ABBR.indexOf(m[1]);
  if (mi === -1) return null;
  return new Date(parseInt(m[2]), mi, 1);
}

// Quotes with a bid/ask YTM spread above 1pp are treated as stale/illiquid.
function isLiquid(s) {
  return Number.isFinite(s.BidYTM) && Number.isFinite(s.AskYTM) && (s.BidYTM - s.AskYTM) <= 1.0;
}

// ===== Buy Label Computation =====
// Bands with fewer liquid peers than this are all labelled "Corect":
// quartiles of 1–3 values would always flag the extremes.
const MIN_BAND_PEERS = 4;

function computeBuyLabels(issued) {
  const groups = {};
  for (const s of issued) {
    if (!isLiquid(s)) continue; // stale quotes would skew the quartiles
    const key = s.Currency + '|' + bandOf(s.Maturity);
    (groups[key] = groups[key] || []).push(s.AskYTM);
  }
  const groupQ = {};
  for (const [key, vals] of Object.entries(groups)) {
    if (vals.length < MIN_BAND_PEERS) continue;
    const sorted = vals.slice().sort((a, b) => a - b);
    groupQ[key] = { q1: quartile(sorted, 0.25), q3: quartile(sorted, 0.75) };
  }
  const out = {};
  for (const s of issued) {
    const q = groupQ[s.Currency + '|' + bandOf(s.Maturity)];
    let label = 'Corect';
    if (q && s.AskYTM >= q.q3) label = 'Oportunitate';
    else if (q && s.AskYTM < q.q1) label = 'Supraevaluat';
    out[s.Symbol] = { label, illiquid: !isLiquid(s) };
  }
  return out;
}

// ===== Icons =====
const svgIcon = (d, w = 2) => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICON_INFO  = svgIcon('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>');
const ICON_X     = svgIcon('<path d="M18 6 6 18M6 6l12 12"/>');
const ICON_CHECK = svgIcon('<path d="M20 6 9 17l-5-5"/>', 2.5);
const ICON_SWAP  = svgIcon('<path d="M7 16V4M3 8l4-4 4 4M17 8v12M21 16l-4 4-4-4"/>');

const tipBtn = (name, text) =>
  `<button class="tip-btn" type="button" aria-label="Ce înseamnă ${name}?" aria-expanded="false" data-tip="${text}">${ICON_INFO}</button>`;

// ===== Screener =====
const TH_TIPS = {
  Coupon:   'Rata nominală anuală a dobânzii plătite de emitent, ca % din valoarea nominală.',
  AskYTM:   'Randamentul anual efectiv dacă cumperi azi la prețul Ask, incluzând comisionul brokerului. Acesta este randamentul real al investiției tale.',
  BidYTM:   'Randamentul anual efectiv pentru cel care cumpără la prețul Bid. Relevant când vrei să vinzi — arată cât ar câștiga cumpărătorul.',
  Spread:   'Diferența BidYTM − AskYTM. Un spread mare (>1%) înseamnă piață nelichidă: riscul de a nu găsi contrapartidă rapidă la prețul dorit.',
  AskPrice: 'Prețul curat (fără cupon acumulat) la care poți cumpăra, ca % din valoarea nominală. La 100 plătești exact valoarea nominală.',
};

function buildScreener(issued, labels) {
  renderScreenerPanel('s-ron-panel', issued.filter(s => s.Currency === 'RON'), labels);
  renderScreenerPanel('s-eur-panel', issued.filter(s => s.Currency === 'EUR'), labels);
}

const BAND_LABELS = { '0-1': 'sub 1 an', '1-2': '1–2 ani', '2-3': '2–3 ani', '3-5': '3–5 ani', '5+': 'peste 5 ani' };

// The sort <select> stands in for the column headers, which are hidden
// when the table collapses into cards on narrow screens.
const SORT_OPTIONS = [
  ['Maturity:asc', 'Maturitate, crescător'],
  ['AskYTM:desc',  'AskYTM, descrescător'],
  ['Coupon:desc',  'Cupon, descrescător'],
  ['Spread:asc',   'Spread, crescător'],
  ['AskPrice:asc', 'Preț Ask, crescător'],
];

function renderScreenerPanel(panelId, bonds, labels) {
  const panel = document.getElementById(panelId);
  const ccy = panelId.includes('eur') ? 'eur' : 'ron';
  const bands = BANDS.filter(b => bonds.some(s => bandOf(s.Maturity) === b));

  const toolbar = document.createElement('div');
  toolbar.className = 'table-toolbar';
  toolbar.innerHTML = `
    <div class="field-inline">
      <label for="band-${ccy}">Timp rămas</label>
      <select id="band-${ccy}" class="select">
        <option value="">Toate</option>
        ${bands.map(b => `<option value="${b}">${BAND_LABELS[b]}</option>`).join('')}
      </select>
    </div>
    <div class="field-inline sort-mobile">
      <label for="sort-${ccy}">Sortează după</label>
      <select id="sort-${ccy}" class="select">
        ${SORT_OPTIONS.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}
      </select>
    </div>
    <label class="check">
      <input type="checkbox" id="liquid-${ccy}" />
      Doar lichide
    </label>
    <a class="toolbar-help" href="#glosar">Ce înseamnă coloanele?</a>
    <span class="table-count" aria-live="polite"></span>`;

  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = buildScreenerTable(bonds, labels);
  wrap.appendChild(table);
  panel.append(toolbar, wrap);
  const sortSel = toolbar.querySelector('#sort-' + ccy);
  const sortBy = attachSort(table, 'Maturity', true, (col, asc) => syncSortSelect(sortSel, table, col, asc));

  const bandSel = toolbar.querySelector('#band-' + ccy);
  const liquidChk = toolbar.querySelector('#liquid-' + ccy);
  const countEl = toolbar.querySelector('.table-count');
  const applyFilter = () => {
    let shown = 0;
    table.querySelectorAll('tbody tr').forEach(tr => {
      const ok = (!bandSel.value || tr.dataset.band === bandSel.value) &&
                 (!liquidChk.checked || tr.dataset.liquid === '1');
      tr.hidden = !ok;
      if (ok) shown++;
    });
    countEl.textContent = shown === 1 ? '1 obligațiune' : `${shown} obligațiuni`;
  };
  bandSel.addEventListener('change', applyFilter);
  liquidChk.addEventListener('change', applyFilter);
  sortSel.addEventListener('change', e => {
    const [col, dir] = e.target.value.split(':');
    sortBy(col, dir === 'asc');
  });
  applyFilter();
}

function buildScreenerTable(bonds, labels) {
  const table = document.createElement('table');
  table.className = 'market-table';
  table.innerHTML = `<thead><tr>
    <th scope="col" data-sort="Symbol" class="sortable">Simbol</th>
    <th scope="col" data-sort="IssueDate" class="sortable">Emisă</th>
    <th scope="col" data-sort="Maturity" class="sortable">Maturitate</th>
    <th scope="col" data-sort="TTM" class="sortable">Timp rămas</th>
    <th scope="col" data-sort="Coupon" class="sortable num-cell">Cupon ${tipBtn('Cupon', TH_TIPS.Coupon)}</th>
    <th scope="col" data-sort="AskYTM" class="sortable num-cell">AskYTM ${tipBtn('AskYTM', TH_TIPS.AskYTM)}</th>
    <th scope="col" data-sort="BidYTM" class="sortable num-cell">BidYTM ${tipBtn('BidYTM', TH_TIPS.BidYTM)}</th>
    <th scope="col" data-sort="Spread" class="sortable num-cell">Spread ${tipBtn('Spread', TH_TIPS.Spread)}</th>
    <th scope="col" data-sort="AskPrice" class="sortable num-cell">Preț Ask ${tipBtn('Preț Ask', TH_TIPS.AskPrice)}</th>
    <th scope="col">Etichetă</th>
  </tr></thead><tbody></tbody>`;

  const tbody = table.querySelector('tbody');
  bonds
    .slice()
    .sort((a, b) => new Date(a.Maturity) - new Date(b.Maturity))
    .forEach(s => tbody.appendChild(buildScreenerRow(s, labels[s.Symbol] || { label: 'Corect', illiquid: false })));
  return table;
}

function buildScreenerRow(s, lbl) {
  const spread = s.BidYTM - s.AskYTM;
  const spreadClass = spread > 1 ? 'num-bad' : spread > 0.3 ? 'num-warn' : 'num-good';
  const ttm = (new Date(s.Maturity) - Date.now()) / MS_PER_YEAR;
  const emissionLabel = _emissionMap[s.Symbol] || '—';
  const tr = document.createElement('tr');
  Object.assign(tr.dataset, {
    Symbol: s.Symbol,
    // Timestamps, so dates sort chronologically (unknown emission sorts last).
    IssueDate: parseEmissionDate(emissionLabel)?.getTime() ?? Number.MAX_SAFE_INTEGER,
    Maturity: new Date(s.Maturity).getTime(),
    TTM: ttm.toFixed(4),
    Coupon: s.Coupon,
    AskYTM: s.AskYTM,
    BidYTM: s.BidYTM,
    Spread: (spread).toFixed(4),
    AskPrice: s.AskPrice,
    band: bandOf(s.Maturity),
    liquid: isLiquid(s) ? '1' : '0',
  });
  tr.innerHTML = `
    <td data-label="Simbol"><code class="sym">${s.Symbol}</code></td>
    <td data-label="Emisă">${roLabel(emissionLabel)}</td>
    <td data-label="Maturitate">${formatDate(s.Maturity)}</td>
    <td data-label="Timp rămas">${yrsLeftLabel(s.Maturity)}</td>
    <td data-label="Cupon" class="num-cell">${fmtPct(s.Coupon)}</td>
    <td data-label="AskYTM" class="num-cell"><strong>${fmtPct(s.AskYTM)}</strong></td>
    <td data-label="BidYTM" class="num-cell">${fmtPct(s.BidYTM)}</td>
    <td data-label="Spread" class="num-cell ${spreadClass}">${fmtPct(spread)}</td>
    <td data-label="Preț Ask" class="num-cell">${(+s.AskPrice).toFixed(2)}</td>
    <td data-label="Etichetă">${pillHtml(lbl)}</td>
  `;
  return tr;
}

function pillHtml(lbl) {
  const cls = { Oportunitate: 'pill-good', Corect: 'pill-fair', Supraevaluat: 'pill-bad' };
  let h = `<span class="status-pill ${cls[lbl.label] || 'pill-fair'}">${lbl.label}</span>`;
  if (lbl.illiquid) h += ' <span class="status-pill pill-illiquid">Nelichid</span>';
  return h;
}

// Keeps the card-layout "Sortează după" select in step with header sorting.
// A header sort with no preset option gets one temporary option of its own.
function syncSortSelect(sel, table, col, asc) {
  const value = `${col}:${asc ? 'asc' : 'desc'}`;
  sel.querySelector('option[data-custom]')?.remove();
  if (![...sel.options].some(o => o.value === value)) {
    const th = table.querySelector(`th[data-sort="${col}"]`);
    const name = th ? th.firstChild.textContent.trim() : col;
    sel.add(new Option(`${name}, ${asc ? 'crescător' : 'descrescător'}`, value));
    sel.options[sel.options.length - 1].dataset.custom = '';
  }
  sel.value = value;
}

function attachSort(table, defaultCol, defaultAsc, onSort) {
  const setSorted = (th, asc) => {
    table.querySelectorAll('th[data-sort]').forEach(t => {
      t.classList.remove('sort-asc', 'sort-desc');
      t.setAttribute('aria-sort', 'none');
    });
    th.classList.add(asc ? 'sort-asc' : 'sort-desc');
    th.setAttribute('aria-sort', asc ? 'ascending' : 'descending');
  };
  const initTh = table.querySelector(`th[data-sort="${defaultCol}"]`);
  if (initTh) setSorted(initTh, defaultAsc);

  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.tabIndex = 0;
    th.addEventListener('keydown', e => {
      if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest('.tip-btn')) { e.preventDefault(); th.click(); }
    });
    th.addEventListener('click', e => {
      if (e.target.closest('.tip-btn')) return;
      sortBy(th.dataset.sort, !th.classList.contains('sort-asc'));
    });
  });

  function sortBy(col, asc) {
    const th = table.querySelector(`th[data-sort="${col}"]`);
    if (th) setSorted(th, asc);
    onSort?.(col, asc);
    const tbody = table.querySelector('tbody');
    Array.from(tbody.querySelectorAll('tr'))
      .sort((a, b) => {
        const av = a.dataset[col] ?? '', bv = b.dataset[col] ?? '';
        const an = parseFloat(av), bn = parseFloat(bv);
        return !isNaN(an) && !isNaN(bn)
          ? (asc ? an - bn : bn - an)
          : (asc ? av.localeCompare(bv) : bv.localeCompare(av));
      })
      .forEach(r => tbody.appendChild(r));
  }
  return sortBy;
}

// ===== Upcoming Subscriptions =====
function buildUpcoming(upcoming, issued) {
  const section = document.getElementById('upcoming-section');
  const tbody = document.getElementById('upcoming-body');
  if (!section || !tbody) return;
  if (!upcoming.length) { section.hidden = true; return; }

  const FOUR_MONTHS_MS = 4 * 30.4375 * 24 * 3600 * 1000;
  const BUDGET = 10000;

  // AskYTM is the all-in annualized return: dirty ask price + accrued coupon + broker
  // commission are already factored in by the source. So BUDGET × AskYTM × TTM gives
  // the correct total interest gain to compare against BUDGET × Coupon × TTM.
  function compareGain(peer, subCoupon) {
    const ttm = (new Date(peer.Maturity) - Date.now()) / MS_PER_YEAR;
    const gainPeer = BUDGET * peer.AskYTM / 100 * ttm;
    const gainSub  = BUDGET * subCoupon  / 100 * ttm;
    return { diff: gainPeer - gainSub, gainPeer, ttm };
  }

  function optionHtml(peer, subCoupon, ccy, rank) {
    const spread = peer.BidYTM - peer.AskYTM;
    const dirtyAskPct = +peer.AskPrice + +peer.AccruedCoupon;
    const { diff, gainPeer } = compareGain(peer, subCoupon);
    const sign = diff >= 0 ? '+' : '';
    return `<div class="upcoming-option">
      <span class="upcoming-rank">${rank}</span>
      <code class="sym">${peer.Symbol}</code>
      <span class="upcoming-ytm">${fmtPct(peer.AskYTM)} AskYTM</span>
      <span class="upcoming-ttm">${yrsLeftLabel(peer.Maturity)}</span>
      · preț ${fmtNum(dirtyAskPct)}% · spread ${fmtPct(spread)}
      · la ${BUDGET.toLocaleString('ro-RO')} ${ccy}: <strong>${sign}${fmtNum(diff)} ${ccy}</strong> față de subscrierea nouă (ținut până la maturitate, dobândă simplă)
    </div>`;
  }

  upcoming.forEach(s => {
    const upcomingMat = new Date(s.Maturity);
    const ccy = s.Currency;

    // Liquid secondary bonds with maturity ±4 months (spread ≤ 1%)
    const peers = issued.filter(i => {
      if (i.Currency !== ccy) return false;
      if (Math.abs(new Date(i.Maturity) - upcomingMat) > FOUR_MONTHS_MS) return false;
      return isLiquid(i);
    });

    // Option 1: best AskYTM
    peers.sort((a, b) => b.AskYTM - a.AskYTM);
    const bestByYTM = peers[0] || null;

    // Option 2: closest maturity that's still better than subscription and different from #1
    const secondOption = peers
      .filter(p => p !== bestByYTM && p.AskYTM > s.Coupon)
      .sort((a, b) =>
        Math.abs(new Date(a.Maturity) - upcomingMat) -
        Math.abs(new Date(b.Maturity) - upcomingMat)
      )[0] || null;

    let verdictLabel, verdictClass, optionsHtml = '';

    if (!bestByYTM) {
      verdictLabel = 'Fără comparabil';
      verdictClass = 'pill-fair';
      optionsHtml = '<span class="verdict-detail">nu există obligațiuni lichide cu maturitate similară (±4 luni)</span>';
    } else if (bestByYTM.AskYTM <= s.Coupon) {
      verdictLabel = 'Subscriere avantajoasă';
      verdictClass = 'pill-good';
      const spread = bestByYTM.BidYTM - bestByYTM.AskYTM;
      optionsHtml = `<span class="verdict-detail">cel mai bun comparabil: ${bestByYTM.Symbol} la ${fmtPct(bestByYTM.AskYTM)} AskYTM, spread ${fmtPct(spread)}</span>`;
    } else {
      verdictLabel = 'Piața oferă mai mult';
      verdictClass = 'pill-bad';
      optionsHtml = optionHtml(bestByYTM, s.Coupon, ccy, '1.');
      if (secondOption) {
        optionsHtml += optionHtml(secondOption, s.Coupon, ccy, '2.');
      }
    }

    const cleanSym = s.Symbol.replace('*', '');
    const donorTag = isDonorBond(cleanSym) ? ' <span class="badge-donor">Donatori</span>' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td data-label="Simbol"><code class="sym">${cleanSym}</code>${donorTag}</td>
      <td data-label="Monedă">${ccy}</td>
      <td data-label="Maturitate">${formatDate(s.Maturity)}</td>
      <td data-label="Timp rămas">${yrsLeftLabel(s.Maturity)}</td>
      <td data-label="Cupon" class="num-cell"><strong>${fmtPct(s.Coupon)}</strong></td>
      <td data-label="Verdict" class="upcoming-verdict-cell">
        <span class="status-pill ${verdictClass}">${verdictLabel}</span>
        ${optionsHtml}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// ===== Portfolio =====
function loadHoldings() {
  try {
    const raw = JSON.parse(localStorage.getItem('fidelis_holdings_v1') || '[]');
    // Accept both old {symbol,faceValue,subscriptionDate} and new {symbol} format
    return raw.map(h => ({ symbol: (h.symbol || h).toUpperCase() }));
  }
  catch { return []; }
}

function saveHoldings() {
  localStorage.setItem('fidelis_holdings_v1', JSON.stringify(_holdings.map(h => ({ symbol: h.symbol }))));
}

function buildPortfolio(issued) {
  renderHoldingsTab('p-ron-panel', 'RON', issued);
  renderHoldingsTab('p-eur-panel', 'EUR', issued);
}

function renderHoldingsTab(panelId, currency, issued) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  const container = panel.querySelector('.holdings-list');
  if (!container) return;
  container.innerHTML = '';

  const forCcy = _holdings.filter(h => currencyOf(h.symbol, issued) === currency);
  if (!forCcy.length) {
    container.innerHTML = `<p class="empty-state">Nicio obligațiune în ${currency} adăugată încă. Folosește formularul de mai sus.</p>`;
    return;
  }
  forCcy.forEach(h => {
    const m = issued.find(s => s.Symbol === h.symbol);
    if (!m) {
      const errDiv = document.createElement('div');
      errDiv.className = 'holding-card holding-error';
      errDiv.innerHTML = `<code class="sym">${h.symbol}</code> — date de piață indisponibile.
        <button class="remove-btn" type="button" aria-label="Șterge ${h.symbol} din portofoliu">${ICON_X}</button>`;
      errDiv.querySelector('.remove-btn').addEventListener('click', e => {
        const idx = removeIndex(e.currentTarget);
        _holdings = _holdings.filter(x => x.symbol !== h.symbol);
        saveHoldings();
        renderHoldingsTab(panelId, currency, issued);
        refocusHoldings(panelId, idx);
      });
      container.appendChild(errDiv);
      return;
    }
    container.appendChild(buildHoldingCard(h, m, issued));
  });
}

// Fidelis coupons are paid yearly on the maturity date's anniversary.
// The emission month only tells us the term (number of coupons).
function couponSchedule(maturityStr, subDate, now = Date.now()) {
  const mat = new Date(maturityStr);
  const term = Math.max(0, Math.round((mat - subDate) / MS_PER_YEAR));
  let received = 0;
  let next = null;
  for (let k = term - 1; k >= 0; k--) {
    const d = new Date(mat);
    d.setUTCFullYear(mat.getUTCFullYear() - k);
    if (d <= now) received++;
    else if (!next) next = d;
  }
  return { received, remaining: term - received, next };
}

function buildHoldingCard(h, m, issued) {
  const FACE = 10000;
  const ccy  = m.Currency;
  const emissionLabel = _emissionMap[h.symbol] || null;
  const subDate = parseEmissionDate(emissionLabel);
  const annualCoupon = FACE * m.Coupon / 100;

  let couponsReceivedHtml = '';
  let nextCouponHtml = '';
  let accruedHtml = '';

  if (subDate) {
    const { received: couponsReceived, remaining: couponsRemaining, next: nextCoupon } =
      couponSchedule(m.Maturity, subDate);
    const cashFromCoupons = couponsReceived * annualCoupon;
    const accrued = FACE * m.AccruedCoupon / 100;

    const sellDirty  = FACE * m.DirtyBid / 100;
    const grandSold  = cashFromCoupons + sellDirty;
    const grandHeld  = cashFromCoupons + couponsRemaining * annualCoupon + FACE;

    couponsReceivedHtml = `
      <div class="hm"><span class="hm-label">Cupoane încasate până azi</span>
        <span class="hm-value">${couponsReceived} × ${fmtNum(annualCoupon)} = <strong>${fmtNum(cashFromCoupons)} ${ccy}</strong></span></div>
      <div class="hm"><span class="hm-label">Cupon acumulat (neîncasat, inclus în prețul murdar)</span>
        <span class="hm-value">${fmtNum(accrued)} ${ccy}</span></div>
      <div class="hm"><span class="hm-label">Următorul cupon estimat</span>
        <span class="hm-value">${nextCoupon ? formatDate(nextCoupon) : '—'}</span></div>`;

    accruedHtml = `
      <div class="sim-block sim-sell">
        <div class="sim-title">Dacă vinzi azi</div>
        <div class="hm"><span class="hm-label">Valoare la vânzare (preț murdar BVB)</span>
          <span class="hm-value">${fmtNum(sellDirty)} ${ccy}</span></div>
        <div class="hm hm-highlight"><span class="hm-label">Total încasat (cupoane + vânzare)</span>
          <span class="hm-value">${fmtNum(grandSold)} ${ccy}</span></div>
      </div>
      <div class="sim-block sim-hold">
        <div class="sim-title">Dacă ții până la maturitate</div>
        <div class="hm"><span class="hm-label">Cupoane rămase (${couponsRemaining} × ${fmtNum(annualCoupon)})</span>
          <span class="hm-value">${fmtNum(couponsRemaining * annualCoupon)} ${ccy}</span></div>
        <div class="hm"><span class="hm-label">Principal la maturitate</span>
          <span class="hm-value">${fmtNum(FACE)} ${ccy}</span></div>
        <div class="hm hm-highlight"><span class="hm-label">Total încasat</span>
          <span class="hm-value">${fmtNum(grandHeld)} ${ccy}</span></div>
      </div>`;
  } else {
    accruedHtml = `<p class="sim-no-date">Data emisiunii e necunoscută, așa că simularea nu poate fi calculată.</p>`;
  }

  const signal = computeSellSignal(h, m, issued);
  const donorTag = isDonorBond(h.symbol) ? ' <span class="badge-donor">Donatori</span>' : '';

  const div = document.createElement('div');
  div.className = 'holding-card';
  div.innerHTML = `
    <div class="holding-header">
      <div class="holding-title-row">
        <code class="sym">${h.symbol}</code>
        <span class="currency-chip">${ccy}</span>
        ${donorTag}
        <span class="holding-meta">
          ${emissionLabel ? 'emis ' + roLabel(emissionLabel) + ' ·' : ''} cupon ${fmtPct(m.Coupon)} · maturitate ${formatDate(m.Maturity)}
        </span>
      </div>
      <button class="remove-btn" type="button" aria-label="Șterge ${h.symbol} din portofoliu">${ICON_X}</button>
    </div>
    <div class="holding-base">
      <div class="hm"><span class="hm-label">Simulare pentru</span>
        <span class="hm-value"><strong>${fmtNum(FACE)} ${ccy}</strong> subscriși la emisiune (preț 100%)</span></div>
      ${couponsReceivedHtml}
    </div>
    <div class="holding-sim">
      ${accruedHtml}
    </div>
    <div class="holding-signal ${signal.signal === 'sell' ? 'sig-sell' : 'sig-hold'}">
      ${renderSignalHtml(signal, m)}
    </div>
  `;

  div.querySelector('.remove-btn').addEventListener('click', e => {
    const idx = removeIndex(e.currentTarget);
    _holdings = _holdings.filter(x => x.symbol !== h.symbol);
    saveHoldings();
    renderHoldingsTab('p-ron-panel', 'RON', issued);
    renderHoldingsTab('p-eur-panel', 'EUR', issued);
    refocusHoldings(ccy === 'EUR' ? 'p-eur-panel' : 'p-ron-panel', idx);
  });
  return div;
}

// The clicked button disappears on re-render; move focus to the holding
// that took its place (or the previous one, or the add field) so keyboard
// users aren't dropped back at the top of the page.
function removeIndex(btn) {
  return [...btn.closest('.holdings-list').querySelectorAll('.remove-btn')].indexOf(btn);
}
function refocusHoldings(panelId, idx) {
  const btns = document.querySelectorAll(`#${panelId} .remove-btn`);
  (btns[Math.min(idx, btns.length - 1)] || document.getElementById('h-symbol'))?.focus();
}

function renderSignalHtml(signal, m) {
  if (signal.signal === 'sell') {
    return `<span class="sig-label sig-sell-label">${ICON_SWAP}Merită vânzarea</span>
      ${signal.bestAlt.Symbol} oferă <strong>${fmtPct(signal.bestAlt.AskYTM)}</strong> AskYTM
      față de <strong>${fmtPct(m.BidYTM)}</strong> BidYTM al obligațiunii tale
      (diferență: +${fmtPct(signal.gap)}).
      Maturitatea alternativei: ${formatDate(signal.bestAlt.Maturity)}.`;
  }
  const altText = signal.bestAlt
    ? `Cea mai bună alternativă pe termen similar: ${signal.bestAlt.Symbol} la ${fmtPct(signal.bestAlt.AskYTM)} AskYTM.`
    : 'Nu există momentan o alternativă mai bună.';
  return `<span class="sig-label sig-hold-label">${ICON_CHECK}Păstrează</span>
    BidYTM curent: <strong>${fmtPct(m.BidYTM)}</strong>. ${altText}`;
}

function computeSellSignal(h, m, issued) {
  const myBidYTM = m.BidYTM;
  const myBandIdx = BANDS.indexOf(bandOf(m.Maturity));
  if (myBandIdx === -1) return { signal: 'hold', bestAlt: null, gap: null };

  const alternatives = issued.filter(s =>
    s.Currency === m.Currency &&
    s.Symbol !== h.symbol &&
    isLiquid(s) &&
    BANDS.indexOf(bandOf(s.Maturity)) >= myBandIdx
  );
  const bestAlt = alternatives.reduce((best, s) => s.AskYTM > (best?.AskYTM ?? 0) ? s : best, null);

  if (bestAlt && bestAlt.AskYTM > myBidYTM + 0.5) {
    return { signal: 'sell', bestAlt, gap: bestAlt.AskYTM - myBidYTM };
  }
  return { signal: 'hold', bestAlt, gap: bestAlt ? bestAlt.AskYTM - myBidYTM : null };
}

// ===== Add Holding Form =====
function setupHoldingForm(issued) {
  const form  = document.getElementById('add-holding-form');
  const dl    = document.getElementById('symbols-list');
  const errEl = document.getElementById('form-error');
  const input = document.getElementById('h-symbol');
  if (!form || !dl || !errEl || !input) return;

  issued.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.Symbol;
    opt.label = `${s.Symbol} — ${s.Currency}, cupon ${fmtPct(s.Coupon)}, maturitate ${s.Maturity}`;
    dl.appendChild(opt);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    errEl.hidden = true;
    input.removeAttribute('aria-invalid');

    const symbol = input.value.trim().toUpperCase();
    if (!symbol) return;

    const mkt = issued.find(s => s.Symbol === symbol);
    if (!mkt) { showErr('Simbolul nu a fost găsit. Verifică scrierea (ex. R2608A) sau alege din listă.'); return; }
    if (_holdings.find(x => x.symbol === symbol)) {
      showErr('Acest simbol este deja în portofoliu.'); return;
    }

    _holdings.push({ symbol });
    saveHoldings();
    form.reset();

    const tabId = mkt.Currency === 'EUR' ? 'ptab-eur' : 'ptab-ron';
    document.getElementById(tabId)?.click();
    renderHoldingsTab('p-ron-panel', 'RON', issued);
    renderHoldingsTab('p-eur-panel', 'EUR', issued);
  });

  function showErr(msg) {
    errEl.textContent = msg;
    errEl.hidden = false;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
}

// ===== Tab Switching =====
function setupTabs() {
  document.querySelectorAll('[role="tablist"]').forEach(tablist => {
    const tabs = [...tablist.querySelectorAll('[role="tab"]')];
    tabs.forEach((btn, i) => {
      btn.addEventListener('click', () => {
        const card = tablist.closest('.card');
        tabs.forEach(b => { b.setAttribute('aria-selected', 'false'); b.tabIndex = -1; });
        card.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.setAttribute('aria-selected', 'true');
        btn.tabIndex = 0;
        document.getElementById(btn.getAttribute('aria-controls')).classList.add('active');
      });
      btn.addEventListener('keydown', e => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!step) return;
        const next = tabs[(i + step + tabs.length) % tabs.length];
        next.focus();
        next.click();
        e.preventDefault();
      });
    });
  });
}

// ===== Global Tooltip =====
function setupTooltips() {
  const box = document.createElement('div');
  box.id = 'global-tip';
  box.className = 'global-tip';
  box.setAttribute('role', 'tooltip');
  box.hidden = true;
  document.body.appendChild(box);

  let owner = null;
  const hide = () => {
    box.hidden = true;
    if (owner) { owner.setAttribute('aria-expanded', 'false'); owner.removeAttribute('aria-describedby'); }
    owner = null;
  };

  document.addEventListener('click', e => {
    const btn = e.target.closest('.tip-btn');
    if (btn) {
      e.stopPropagation();
      const text = btn.dataset.tip;
      const wasShowing = !box.hidden && box.dataset.src === text;
      hide();
      if (!wasShowing) {
        owner = btn;
        btn.setAttribute('aria-expanded', 'true');
        btn.setAttribute('aria-describedby', 'global-tip');
        const rect = btn.getBoundingClientRect();
        box.textContent = text;
        box.dataset.src = text;
        box.hidden = false;
        box.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
        const cx = rect.left + rect.width / 2 + window.scrollX;
        box.style.left = Math.max(window.scrollX + 144, Math.min(cx, window.innerWidth + window.scrollX - 144)) + 'px';
        box.style.transform = 'translateX(-50%)';
      }
    } else {
      hide();
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
}
