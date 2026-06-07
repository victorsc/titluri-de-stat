'use strict';

// ===== State =====
let _mkt = null;
let _holdings = [];
let _emissionMap = {};

const BANDS = ['0-1', '1-2', '2-3', '3-5', '5+'];
const MS_PER_YEAR = 365.25 * 24 * 3600 * 1000;

// ===== Boot =====
Promise.all([
  fetch('data/fidelis_yields.json').then(r => { if (!r.ok) throw r.status; return r.json(); }),
  fetch('data/fidelis.json').then(r => r.ok ? r.json() : null).catch(() => null),
])
  .then(([mktData, fidData]) => {
    _mkt = mktData;
    if (fidData) _emissionMap = buildEmissionMap(fidData);
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
}

// ===== Emission Date Lookup =====
const _MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function buildEmissionMap(fid) {
  const entries = [
    ...(fid.ron || []).map(e => ({...e, src: 'ron'})),
    ...(fid.eur || []).map(e => ({...e, src: 'eur'})),
    ...((fid.donatori && fid.donatori.ron) || []).map(e => ({...e, src: 'don-ron'})),
    ...((fid.donatori && fid.donatori.eur) || []).map(e => ({...e, src: 'don-eur'})),
  ].filter(e => typeof e.m === 'number');

  const map = {};
  const issued = _mkt.symbols.filter(s => s._issued === 1);

  for (const s of issued) {
    const matDate = new Date(s.Maturity);
    const sym = s.Symbol;
    let pref;
    if (/B$/.test(sym) || /D$/.test(sym)) pref = 'don-ron';
    else if (/BE$/.test(sym)) pref = 'don-eur';
    else if (/AE$/.test(sym) || /CE$/.test(sym)) pref = 'eur';
    else pref = 'ron';

    let best = null, bestDelta = Infinity;
    for (const e of entries) {
      if (e.src !== pref) continue;
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
      if (deltaMo <= 2 && deltaMo < bestDelta) {
        bestDelta = deltaMo;
        best = e.d;
      }
    }
    if (best) map[sym] = best;
  }
  return map;
}

// ===== Freshness =====
function showFreshness() {
  const el = document.getElementById('freshness-badge');
  if (!el || !_mkt.transaction_date) return;
  el.textContent = 'Date: ' + _mkt.transaction_date;
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

function isDonorBond(sym) {
  const s = sym.replace('*', '');
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

// ===== Buy Label Computation =====
function computeBuyLabels(issued) {
  const groups = {};
  for (const s of issued) {
    const key = s.Currency + '|' + bandOf(s.Maturity);
    (groups[key] = groups[key] || []).push(s.AskYTM);
  }
  const groupQ = {};
  for (const [key, vals] of Object.entries(groups)) {
    const sorted = vals.slice().sort((a, b) => a - b);
    groupQ[key] = { q1: quartile(sorted, 0.25), q3: quartile(sorted, 0.75) };
  }
  const out = {};
  for (const s of issued) {
    const key = s.Currency + '|' + bandOf(s.Maturity);
    const { q1, q3 } = groupQ[key] || { q1: 0, q3: 0 };
    let label = 'Corect';
    if (s.AskYTM >= q3) label = 'Oportunitate';
    else if (s.AskYTM < q1) label = 'Supraevaluat';
    out[s.Symbol] = { label, illiquid: (s.BidYTM - s.AskYTM) > 1.0 };
  }
  return out;
}

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

function renderScreenerPanel(panelId, bonds, labels) {
  const panel = document.getElementById(panelId);
  const wrap = document.createElement('div');
  wrap.className = 'table-wrap';
  const table = buildScreenerTable(bonds, labels);
  wrap.appendChild(table);
  panel.appendChild(wrap);
  attachSort(table, 'Maturity', true);
}

function buildScreenerTable(bonds, labels) {
  const table = document.createElement('table');
  table.className = 'market-table';
  table.innerHTML = `<thead><tr>
    <th data-sort="Symbol" class="sortable">Simbol</th>
    <th data-sort="IssueDate" class="sortable">Emisă</th>
    <th data-sort="Maturity" class="sortable">Maturitate</th>
    <th data-sort="TTM" class="sortable">Scadentă</th>
    <th data-sort="Coupon" class="sortable">Cupon <button class="tip-btn" type="button" data-tip="${TH_TIPS.Coupon}">ⓘ</button></th>
    <th data-sort="AskYTM" class="sortable">AskYTM <button class="tip-btn" type="button" data-tip="${TH_TIPS.AskYTM}">ⓘ</button></th>
    <th data-sort="BidYTM" class="sortable">BidYTM <button class="tip-btn" type="button" data-tip="${TH_TIPS.BidYTM}">ⓘ</button></th>
    <th data-sort="Spread" class="sortable">Spread <button class="tip-btn" type="button" data-tip="${TH_TIPS.Spread}">ⓘ</button></th>
    <th data-sort="AskPrice" class="sortable">Preț Ask <button class="tip-btn" type="button" data-tip="${TH_TIPS.AskPrice}">ⓘ</button></th>
    <th>Eticheta</th>
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
    IssueDate: emissionLabel === '—' ? 'z' : emissionLabel,
    Maturity: s.Maturity,
    TTM: ttm.toFixed(4),
    Coupon: s.Coupon,
    AskYTM: s.AskYTM,
    BidYTM: s.BidYTM,
    Spread: (spread).toFixed(4),
    AskPrice: s.AskPrice,
  });
  tr.innerHTML = `
    <td data-label="Simbol"><code class="sym">${s.Symbol}</code></td>
    <td data-label="Emisă">${emissionLabel}</td>
    <td data-label="Maturitate">${formatDate(s.Maturity)}</td>
    <td data-label="Scadentă">${yrsLeftLabel(s.Maturity)}</td>
    <td data-label="Cupon" class="num-cell">${fmtPct(s.Coupon)}</td>
    <td data-label="AskYTM" class="num-cell"><strong>${fmtPct(s.AskYTM)}</strong></td>
    <td data-label="BidYTM" class="num-cell">${fmtPct(s.BidYTM)}</td>
    <td data-label="Spread" class="num-cell ${spreadClass}">${fmtPct(spread)}</td>
    <td data-label="Preț Ask" class="num-cell">${(+s.AskPrice).toFixed(2)}</td>
    <td data-label="Eticheta">${pillHtml(lbl)}</td>
  `;
  return tr;
}

function pillHtml(lbl) {
  const cls = { Oportunitate: 'pill-good', Corect: 'pill-fair', Supraevaluat: 'pill-bad' };
  let h = `<span class="status-pill ${cls[lbl.label] || 'pill-fair'}">${lbl.label}</span>`;
  if (lbl.illiquid) h += ' <span class="status-pill pill-illiquid">Nelichid</span>';
  return h;
}

function attachSort(table, defaultCol, defaultAsc) {
  const initTh = table.querySelector(`th[data-sort="${defaultCol}"]`);
  if (initTh) initTh.classList.add(defaultAsc ? 'sort-asc' : 'sort-desc');

  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', e => {
      if (e.target.closest('.tip-btn')) return;
      const col = th.dataset.sort;
      const asc = !th.classList.contains('sort-asc');
      table.querySelectorAll('th').forEach(t => t.classList.remove('sort-asc', 'sort-desc'));
      th.classList.add(asc ? 'sort-asc' : 'sort-desc');
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
    });
  });
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
      · la ${BUDGET.toLocaleString('ro-RO')} ${ccy}: <strong>${sign}${fmtNum(diff)} ${ccy}</strong> vs subscrierea noua (tinut pana la maturitate, dobanda simpla)
    </div>`;
  }

  upcoming.forEach(s => {
    const upcomingMat = new Date(s.Maturity);
    const ccy = s.Currency;

    // Liquid secondary bonds with maturity ±4 months (spread ≤ 1%)
    const peers = issued.filter(i => {
      if (i.Currency !== ccy) return false;
      if (Math.abs(new Date(i.Maturity) - upcomingMat) > FOUR_MONTHS_MS) return false;
      return (i.BidYTM - i.AskYTM) <= 1.0;
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
      verdictLabel = 'Fara comparabil';
      verdictClass = 'pill-fair';
      optionsHtml = '<span class="verdict-detail">nu exista obligatiuni lichide cu maturitate similara (±4 luni)</span>';
    } else if (bestByYTM.AskYTM <= s.Coupon) {
      verdictLabel = 'Subscriere avantajoasa';
      verdictClass = 'pill-good';
      const spread = bestByYTM.BidYTM - bestByYTM.AskYTM;
      optionsHtml = `<span class="verdict-detail">cel mai bun comparabil: ${bestByYTM.Symbol} la ${fmtPct(bestByYTM.AskYTM)} AskYTM, spread ${fmtPct(spread)}</span>`;
    } else {
      verdictLabel = 'Piata mai buna';
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
      <td data-label="Moneda">${ccy}</td>
      <td data-label="Maturitate">${formatDate(s.Maturity)}</td>
      <td data-label="Scadentă">${yrsLeftLabel(s.Maturity)}</td>
      <td data-label="Cupon subscriere" class="num-cell"><strong>${fmtPct(s.Coupon)}</strong></td>
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
    container.innerHTML = `<p class="empty-state">Nicio subscriptie adaugata pentru ${currency}. Foloseste formularul de mai sus.</p>`;
    return;
  }
  forCcy.forEach(h => {
    const m = issued.find(s => s.Symbol === h.symbol);
    if (!m) {
      const errDiv = document.createElement('div');
      errDiv.className = 'holding-card holding-error';
      errDiv.innerHTML = `<code class="sym">${h.symbol}</code> — date de piata indisponibile.
        <button class="remove-btn" aria-label="Sterge">×</button>`;
      errDiv.querySelector('.remove-btn').addEventListener('click', () => {
        _holdings = _holdings.filter(x => x.symbol !== h.symbol);
        saveHoldings();
        renderHoldingsTab(panelId, currency, issued);
      });
      container.appendChild(errDiv);
      return;
    }
    container.appendChild(buildHoldingCard(h, m, issued));
  });
}

function buildHoldingCard(h, m, issued) {
  const FACE = 10000;
  const ccy  = m.Currency;
  const emissionLabel = _emissionMap[h.symbol] || null;
  const subDate = parseEmissionDate(emissionLabel);
  const matDate = new Date(m.Maturity);
  const annualCoupon = FACE * m.Coupon / 100;

  let couponsReceivedHtml = '';
  let nextCouponHtml = '';
  let accruedHtml = '';

  if (subDate) {
    const yearsHeld = (Date.now() - subDate) / MS_PER_YEAR;
    const couponsReceived = Math.max(0, Math.floor(yearsHeld));
    const totalTerm = Math.round((matDate - subDate) / MS_PER_YEAR);
    const couponsRemaining = Math.max(0, totalTerm - couponsReceived);
    const cashFromCoupons = couponsReceived * annualCoupon;
    const accrued = FACE * m.AccruedCoupon / 100;
    const nextCoupon = new Date(subDate);
    nextCoupon.setFullYear(subDate.getFullYear() + couponsReceived + 1);

    const sellDirty  = FACE * m.DirtyBid / 100;
    const grandSold  = cashFromCoupons + sellDirty;
    const grandHeld  = cashFromCoupons + couponsRemaining * annualCoupon + FACE;

    couponsReceivedHtml = `
      <div class="hm"><span class="hm-label">Cupoane incasate pana azi</span>
        <span class="hm-value">${couponsReceived} × ${fmtNum(annualCoupon)} = <strong>${fmtNum(cashFromCoupons)} ${ccy}</strong></span></div>
      <div class="hm"><span class="hm-label">Cupon acumulat (neincasat, inclus in pret murdar)</span>
        <span class="hm-value">${fmtNum(accrued)} ${ccy}</span></div>
      <div class="hm"><span class="hm-label">Urmatorul cupon estimat</span>
        <span class="hm-value">${formatDate(nextCoupon)}</span></div>`;

    accruedHtml = `
      <div class="sim-block sim-sell">
        <div class="sim-title">Daca vinzi azi</div>
        <div class="hm"><span class="hm-label">Valoare vanzare (pret murdar BVB)</span>
          <span class="hm-value">${fmtNum(sellDirty)} ${ccy}</span></div>
        <div class="hm hm-highlight"><span class="hm-label">Total incasat (cupoane + vanzare)</span>
          <span class="hm-value">${fmtNum(grandSold)} ${ccy}</span></div>
      </div>
      <div class="sim-block sim-hold">
        <div class="sim-title">Daca tii pana la maturitate</div>
        <div class="hm"><span class="hm-label">Cupoane ramase (${couponsRemaining} × ${fmtNum(annualCoupon)})</span>
          <span class="hm-value">${fmtNum(couponsRemaining * annualCoupon)} ${ccy}</span></div>
        <div class="hm"><span class="hm-label">Principal la maturitate</span>
          <span class="hm-value">${fmtNum(FACE)} ${ccy}</span></div>
        <div class="hm hm-highlight"><span class="hm-label">Total incasat</span>
          <span class="hm-value">${fmtNum(grandHeld)} ${ccy}</span></div>
      </div>`;
  } else {
    accruedHtml = `<p class="sim-no-date">Data emisiei necunoscuta — simularea nu poate fi calculata.</p>`;
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
          ${emissionLabel ? 'emis ' + emissionLabel + ' ·' : ''} cupon ${fmtPct(m.Coupon)} · maturitate ${formatDate(m.Maturity)}
        </span>
      </div>
      <button class="remove-btn" aria-label="Sterge aceasta subscriptie">×</button>
    </div>
    <div class="holding-base">
      <div class="hm"><span class="hm-label">Simulare pentru</span>
        <span class="hm-value"><strong>${fmtNum(FACE)} ${ccy}</strong> subscrise la emisie (pret 100%)</span></div>
      ${couponsReceivedHtml}
    </div>
    <div class="holding-sim">
      ${accruedHtml}
    </div>
    <div class="holding-signal ${signal.signal === 'sell' ? 'sig-sell' : 'sig-hold'}">
      ${renderSignalHtml(signal, m)}
    </div>
  `;

  div.querySelector('.remove-btn').addEventListener('click', () => {
    _holdings = _holdings.filter(x => x.symbol !== h.symbol);
    saveHoldings();
    renderHoldingsTab('p-ron-panel', 'RON', issued);
    renderHoldingsTab('p-eur-panel', 'EUR', issued);
  });
  return div;
}

function renderSignalHtml(signal, m) {
  if (signal.signal === 'sell') {
    return `<span class="sig-label sig-sell-label">Merita vanzarea</span>
      ${signal.bestAlt.Symbol} ofera <strong>${fmtPct(signal.bestAlt.AskYTM)}</strong> AskYTM
      fata de <strong>${fmtPct(m.BidYTM)}</strong> BidYTM al obligatiunii tale
      (diferenta: +${fmtPct(signal.gap)}).
      Maturitate alternativa: ${formatDate(signal.bestAlt.Maturity)}.`;
  }
  const altText = signal.bestAlt
    ? `Cea mai buna alternativa pe termen similar: ${signal.bestAlt.Symbol} la ${fmtPct(signal.bestAlt.AskYTM)} AskYTM.`
    : 'Nu exista alternativa superioara disponibila in prezent.';
  return `<span class="sig-label sig-hold-label">Pastreaza</span>
    BidYTM curent: <strong>${fmtPct(m.BidYTM)}</strong>. ${altText}`;
}

function computeSellSignal(h, m, issued) {
  const myBidYTM = m.BidYTM;
  const myBandIdx = BANDS.indexOf(bandOf(m.Maturity));
  if (myBandIdx === -1) return { signal: 'hold', bestAlt: null, gap: null };

  const alternatives = issued.filter(s =>
    s.Currency === m.Currency &&
    s.Symbol !== h.symbol &&
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
  if (!form || !dl || !errEl) return;

  issued.forEach(s => {
    const opt = document.createElement('option');
    opt.value = s.Symbol;
    opt.label = `${s.Symbol} — ${s.Currency}, cupon ${fmtPct(s.Coupon)}, maturitate ${s.Maturity}`;
    dl.appendChild(opt);
  });

  form.addEventListener('submit', e => {
    e.preventDefault();
    errEl.hidden = true;

    const symbol = form.querySelector('#h-symbol').value.trim().toUpperCase();
    if (!symbol) return;

    const mkt = issued.find(s => s.Symbol === symbol);
    if (!mkt) { showErr('Simbolul nu a fost gasit. Verifica scrierea (ex: R2608A).'); return; }
    if (_holdings.find(x => x.symbol === symbol)) {
      showErr('Acest simbol este deja in portofoliu.'); return;
    }

    _holdings.push({ symbol });
    saveHoldings();
    form.reset();

    const tabId = mkt.Currency === 'EUR' ? 'ptab-eur' : 'ptab-ron';
    document.getElementById(tabId)?.click();
    renderHoldingsTab('p-ron-panel', 'RON', issued);
    renderHoldingsTab('p-eur-panel', 'EUR', issued);
  });

  function showErr(msg) { errEl.textContent = msg; errEl.hidden = false; }
}

// ===== Tab Switching =====
function setupTabs() {
  document.querySelectorAll('[role="tablist"]').forEach(tablist => {
    tablist.querySelectorAll('[role="tab"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const card = tablist.closest('.card');
        tablist.querySelectorAll('[role="tab"]').forEach(b => b.setAttribute('aria-selected', 'false'));
        card.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.setAttribute('aria-selected', 'true');
        document.getElementById(btn.getAttribute('aria-controls')).classList.add('active');
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

  document.addEventListener('click', e => {
    const btn = e.target.closest('.tip-btn');
    if (btn) {
      e.stopPropagation();
      const text = btn.dataset.tip;
      const wasShowing = !box.hidden && box.dataset.src === text;
      box.hidden = true;
      if (!wasShowing) {
        const rect = btn.getBoundingClientRect();
        box.textContent = text;
        box.dataset.src = text;
        box.hidden = false;
        box.style.top = (rect.bottom + 8 + window.scrollY) + 'px';
        const cx = rect.left + rect.width / 2 + window.scrollX;
        box.style.left = Math.max(8, Math.min(cx, window.innerWidth + window.scrollX - 228)) + 'px';
        box.style.transform = 'translateX(-50%)';
      }
    } else {
      box.hidden = true;
    }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') box.hidden = true; });
}
