// ── Colors ───────────────────────────────────────────────────────
// Each maturity owns a fixed palette slot (--mat-1…--mat-8 in style.css) so
// "3 ani" is the same color on every chart and in both themes.
const MAT_SLOT = {1:1, 2:2, 3:3, 4:4, 5:5, 6:6, 7:7, 10:8};
const matVar = m => `var(--mat-${MAT_SLOT[m] || 8})`;

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const resolve = v => v.startsWith('var(') ? cssVar(v.slice(4, -1)) : v;

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Load data from JSON files ────────────────────────────────────
let _fidelis = null;
let _eurBuilt = false;
let _donBuilt = false;
const _charts = [];

const yearsLabel = m => `${m} ${Number(m) === 1 ? 'an' : 'ani'}`;

function fetchJSON(url) {
  return fetch(url).then(r => {
    if (!r.ok) throw new Error(`GET ${url} failed: ${r.status}`);
    return r.json();
  });
}

Promise.all([
  fetchJSON('data/tezaur.json'),
  fetchJSON('data/fidelis.json'),
]).then(([tezaur, fidelis]) => {
  _fidelis = fidelis;
  _fidelis.donatori = fidelis.donatori || { ron: [], eur: [] };
  buildRatesNow(tezaur, fidelis);
  buildChart('tezaurChart', ...seriesByMaturity(tezaur), 'Evoluție dobânzi Tezaur RON');
  buildChart('ronChart', ...seriesByMaturity(fidelis.ron), 'Evoluție dobânzi Fidelis RON');
}).catch(err => {
  console.error('Failed to load data:', err);
  document.querySelectorAll('.chart-skeleton').forEach(el => el.classList.add('hidden'));
  document.getElementById('now-grid').innerHTML = '';
  document.getElementById('load-error').hidden = false;
});

// ── Rates now (latest emission per product) ──────────────────────
const ICON_UP   = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
const ICON_DOWN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';
const ICON_ARROW = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>';

// Latest emission's rates, each compared with the previous emission that
// offered the same maturity (maturities come and go between emissions).
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

function deltaHtml(row) {
  if (!row.prev) return '<span class="delta">nou</span>';
  const d = Math.round((row.r - row.prev.r) * 100) / 100;
  const since = `față de ${row.prev.d} (${row.prev.r}%)`;
  if (d === 0) return `<span class="delta" title="Neschimbat ${since}">neschimbat<span class="visually-hidden"> ${since}</span></span>`;
  const up = d > 0;
  const txt = `${up ? '+' : '−'}${Math.abs(d).toFixed(2)} pp`;
  return `<span class="delta ${up ? 'delta-up' : 'delta-down'}" title="${txt} ${since}">${up ? ICON_UP : ICON_DOWN}${txt}<span class="visually-hidden"> ${since}</span></span>`;
}

function nowGroupHtml({ title, dot, date, rows, href, tab }) {
  const items = rows
    .sort((a, b) => a.m - b.m || a.tag.localeCompare(b.tag))
    .map(r => `<li class="now-row">
      <span class="now-mat"><span class="swatch" style="background:${matVar(r.m)}" aria-hidden="true"></span>${yearsLabel(r.m)}${r.tag ? ' ' + r.tag : ''}</span>
      <span class="now-rate">${r.r.toFixed(2)}<small>%</small></span>
      ${deltaHtml(r)}
    </li>`).join('');
  return `<div class="now-group">
    <div class="now-group-head">
      <span class="dot dot-${dot}" aria-hidden="true"></span>
      <h3>${title}</h3>
      <span class="now-group-date">${date}</span>
    </div>
    <ul class="now-list">${items}</ul>
    <a class="now-link" href="${href}"${tab ? ` data-tab="${tab}"` : ''}>Vezi istoricul ${ICON_ARROW}</a>
  </div>`;
}

function buildRatesNow(tezaur, fidelis) {
  const don = fidelis.donatori;
  const donRon = latestRows(don.ron, 'RON');
  const donEur = latestRows(don.eur, 'EUR');
  const donDates = [...new Set([donRon.date, donEur.date].filter(Boolean))];

  const groups = [
    { title: 'Tezaur', dot: 'tezaur', ...latestRows(tezaur), href: '#tezaur' },
    { title: 'Fidelis RON', dot: 'fidelis', ...latestRows(fidelis.ron), href: '#fidelis', tab: 'tab-ron' },
    { title: 'Fidelis EUR', dot: 'fidelis', ...latestRows(fidelis.eur), href: '#fidelis', tab: 'tab-eur' },
    { title: 'Fidelis Donatori', dot: 'fidelis', date: donDates.join(' / '), rows: [...donRon.rows, ...donEur.rows], href: '#fidelis', tab: 'tab-don' },
  ].filter(g => g.rows.length);

  const grid = document.getElementById('now-grid');
  grid.innerHTML = groups.map(nowGroupHtml).join('');
  grid.querySelectorAll('[data-tab]').forEach(a => {
    a.addEventListener('click', () => document.getElementById(a.dataset.tab)?.click());
  });
}

// ── Series builders ──────────────────────────────────────────────
// Returns [labels, series] for the generic chart builder.
function seriesByMaturity(raw) {
  const labels = [];
  raw.forEach(e => { if (!labels.includes(e.d)) labels.push(e.d); });
  const mats = [...new Set(raw.map(e => e.m))].sort((a, b) => a - b);
  const series = mats.map(m => {
    const values = {};
    raw.filter(e => e.m === m).forEach(e => { values[e.d] = e.r; });
    return { label: yearsLabel(m), color: matVar(m), dashed: false, values };
  });
  return [labels, series];
}

// RON and EUR donor bonds share one chart; EUR lines are dashed so the
// maturity color stays the identity and the dash carries the currency.
function seriesDonatori(don) {
  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const parseDate = d => {
    const p = d.split(' ');
    return parseInt(p[p.length - 1]) * 12 + (MONTHS[p[0]] ?? 0);
  };
  const tagged = [
    ...don.ron.map(e => ({ ...e, ccy: 'RON' })),
    ...don.eur.map(e => ({ ...e, ccy: 'EUR' })),
  ];
  const labels = [...new Set(tagged.map(e => e.d))].sort((a, b) => parseDate(a) - parseDate(b));
  const keys = [...new Set(tagged.map(e => `${e.m}|${e.ccy}`))].sort((a, b) => {
    const [ma, ca] = a.split('|'), [mb, cb] = b.split('|');
    return ma - mb || ca.localeCompare(cb);
  });
  const series = keys.map(k => {
    const [m, ccy] = k.split('|');
    const values = {};
    tagged.filter(e => e.m === Number(m) && e.ccy === ccy).forEach(e => { values[e.d] = e.r; });
    return { label: `${yearsLabel(m)} ${ccy}`, color: matVar(Number(m)), dashed: ccy === 'EUR', values };
  });
  return [labels, series];
}

// ── Chart builder ─────────────────────────────────────────────
const PX_PER_LABEL = 26;

// Shorter charts on phones and short laptop screens so the whole plot fits
// on screen with the legend.
const chartHeight = () => Math.round(Math.max(260, Math.min(420, window.innerHeight * 0.55, window.innerWidth * 0.8)));

// The canvas scrolls horizontally, which would take the y-axis with it.
// After every render, redraw the y tick labels on an overlay canvas pinned
// to the left edge of the scroll container.
const stickyYAxis = {
  id: 'stickyYAxis',
  afterRender(chart) {
    const ov = chart.$yAxis;
    if (!ov) return;
    const y = chart.scales.y;
    const dpr = chart.currentDevicePixelRatio;
    const w = Math.ceil(chart.chartArea.left);
    const h = Math.ceil(chart.chartArea.bottom) + 8;
    if (ov.width !== w * dpr || ov.height !== h * dpr) {
      ov.width = w * dpr;
      ov.height = h * dpr;
      ov.style.width = w + 'px';
      ov.style.height = h + 'px';
    }
    const top = chart.canvas.parentElement.offsetTop;
    ov.style.top = top + 'px';
    ov.parentElement.style.setProperty('--legend-h', top + 'px');

    const ctx = ov.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = cssVar('--surface');
    ctx.fillRect(0, 0, w, h);
    const tickOpts = y.options.ticks;
    ctx.font = Chart.helpers.toFont(tickOpts.font).string;
    ctx.fillStyle = tickOpts.color;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    y.ticks.forEach((t, i) => {
      ctx.fillText(tickOpts.callback(t.value), w - 8, y.getPixelForTick(i));
    });
  },
};

function sizeChart(meta) {
  const { chart, canvas, wrap, outer, labels } = meta;
  const containerW = outer.clientWidth || window.innerWidth;
  const chartW = Math.max(containerW, labels.length * PX_PER_LABEL);
  const chartH = chartHeight();
  canvas.style.width  = chartW + 'px';
  canvas.style.height = chartH + 'px';
  wrap.style.height   = chartH + 'px';
  outer.classList.toggle('scrollable', chartW > containerW);
  if (chart) chart.resize(chartW, chartH);
  const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
  outer.classList.toggle('scrolled-end', chartW <= containerW || atEnd);
  outer.classList.toggle('scrolled-start', wrap.scrollLeft <= 4);
}

const _chartMeta = [];
let _lastW = window.innerWidth;
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    // Mobile browsers fire resize when the URL bar hides; only react to
    // width changes so the chart doesn't jump while scrolling.
    if (window.innerWidth === _lastW) return;
    _lastW = window.innerWidth;
    _chartMeta.forEach(m => {
      if (!m.outer.offsetParent) return; // hidden tab; sized when shown
      const wasAtEnd = m.outer.classList.contains('scrolled-end');
      sizeChart(m);
      if (wasAtEnd) m.wrap.scrollLeft = m.wrap.scrollWidth;
    });
  }, 150);
});

function themeOptions() {
  return {
    surface: cssVar('--surface'),
    raised:  cssVar('--surface-raised'),
    border:  cssVar('--border-strong'),
    text:    cssVar('--text'),
    muted:   cssVar('--text-muted'),
    axis:    cssVar('--chart-axis'),
    grid:    cssVar('--chart-grid'),
  };
}

function applyTheme(chart) {
  const t = themeOptions();
  chart.data.datasets.forEach(ds => {
    const c = resolve(ds._color);
    ds.borderColor = c;
    ds.backgroundColor = c;
    ds.pointBackgroundColor = c;
    ds.pointBorderColor = t.surface;
  });
  const tip = chart.options.plugins.tooltip;
  Object.assign(tip, { backgroundColor: t.raised, borderColor: t.border, titleColor: t.text, bodyColor: t.text });
  ['x', 'y'].forEach(ax => {
    chart.options.scales[ax].ticks.color = t.axis;
    chart.options.scales[ax].grid.color = t.grid;
    chart.options.scales[ax].border = { color: t.grid };
  });
}

document.addEventListener('themechange', () => {
  _charts.forEach(c => { applyTheme(c); c.update('none'); });
});

function buildChart(canvasId, labels, series, ariaLabel) {
  const canvas = document.getElementById(canvasId);
  const wrap   = canvas.closest('.chart-wrap');
  const outer  = canvas.closest('.chart-outer');

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${ariaLabel}, ${labels[0]} până în ${labels[labels.length - 1]}`);

  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label', `${ariaLabel} — derulați orizontal cu săgețile`);
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { wrap.scrollLeft += 60; e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { wrap.scrollLeft -= 60; e.preventDefault(); }
  });

  const meta = { chart: null, canvas, wrap, outer, labels };
  sizeChart(meta);

  wrap.addEventListener('scroll', () => {
    const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
    outer.classList.toggle('scrolled-end', atEnd);
    outer.classList.toggle('scrolled-start', wrap.scrollLeft <= 4);
  }, { passive: true });

  const yAxis = document.createElement('canvas');
  yAxis.className = 'chart-y-axis';
  yAxis.setAttribute('aria-hidden', 'true');

  const datasets = series.map(s => ({
    label: s.label,
    _color: s.color,
    data: labels.map(lbl => s.values[lbl] ?? null),
    fill: false,
    tension: 0.3,
    pointRadius: labels.map(lbl => s.values[lbl] != null ? 3 : 0),
    pointHoverRadius: 6,
    pointBorderWidth: 1.5,
    spanGaps: false,
    borderWidth: 2,
    borderDash: s.dashed ? [6, 4] : [],
  }));

  const legendEl = document.createElement('div');
  legendEl.className = 'chart-legend';
  legendEl.setAttribute('role', 'group');
  legendEl.setAttribute('aria-label', 'Filtrează maturități');
  legendEl.innerHTML = '<span class="legend-hint" aria-hidden="true">Maturitate:</span>';
  series.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'legend-item';
    btn.setAttribute('aria-pressed', 'true');
    btn.innerHTML = s.dashed
      ? `<span class="swatch swatch-dashed" aria-hidden="true" style="border-color:${s.color}"></span>${s.label}`
      : `<span class="swatch" aria-hidden="true" style="background:${s.color}"></span>${s.label}`;
    btn.dataset.idx = i;
    legendEl.appendChild(btn);
  });
  canvas.closest('.chart-panel')?.querySelector('.chart-skeleton')?.classList.add('hidden');
  outer.insertBefore(legendEl, wrap);
  wrap.insertAdjacentElement('afterend', yAxis);

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    plugins: [stickyYAxis],
    options: {
      responsive: false,
      animation: REDUCED_MOTION ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          borderWidth: 1,
          padding: 12,
          cornerRadius: 8,
          usePointStyle: true,
          boxPadding: 6,
          titleFont: { weight: '600', size: 13 },
          bodyFont: { size: 13 },
          itemSort: (a, b) => b.parsed.y - a.parsed.y,
          filter: item => item.parsed.y != null,
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${ctx.parsed.y.toFixed(2)}%`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 45, minRotation: 30, font: { size: 12 } },
          grid: { display: false },
        },
        y: {
          ticks: { font: { size: 12 }, callback: v => v + '%' },
          grid: {},
        },
      },
    },
  });
  chart.$yAxis = yAxis;
  meta.chart = chart;
  _chartMeta.push(meta);
  applyTheme(chart);
  chart.update('none');
  _charts.push(chart);

  requestAnimationFrame(() => {
    wrap.scrollLeft = wrap.scrollWidth;
  });

  legendEl.querySelectorAll('.legend-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      const visible = chart.isDatasetVisible(i);
      chart.setDatasetVisibility(i, !visible);
      chart.update();
      btn.setAttribute('aria-pressed', String(!visible));
    });
  });
}

// ── Did you know ──────────────────────────────────────────────────
(function () {
  let facts = [];
  let shown = [];

  function pickRandom() {
    const pool = facts.filter((_, i) => !shown.includes(i));
    const src = pool.length >= 3 ? pool : facts;
    const picked = [];
    const indices = [];
    while (picked.length < Math.min(3, src.length)) {
      const i = Math.floor(Math.random() * src.length);
      if (!indices.includes(i)) { picked.push(src[i]); indices.push(i); }
    }
    shown = facts.map((f, i) => picked.includes(f) ? i : -1).filter(i => i !== -1);
    return picked;
  }

  function render() {
    const container = document.getElementById('dyk-cards');
    if (!container) return;
    const cards = pickRandom();
    container.innerHTML = cards.map(f => `
      <div class="dyk-card">
        <h3 class="dyk-card-title">${f.title}</h3>
        <p class="dyk-card-body">${f.body}</p>
      </div>`).join('');
  }

  fetchJSON('data/fun-facts.json')
    .then(data => {
      facts = data;
      render();
      document.getElementById('dyk-shuffle-btn')?.addEventListener('click', render);
    })
    .catch(() => {});
})();

// ── Tab switching ──────────────────────────────────────────────────
function selectTab(btn) {
  const card = btn.closest('.fidelis-card');
  card.querySelectorAll('.tab-btn').forEach(b => {
    b.setAttribute('aria-selected', 'false');
    b.tabIndex = -1;
  });
  card.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
  btn.setAttribute('aria-selected', 'true');
  btn.tabIndex = 0;
  const panel = document.getElementById(btn.getAttribute('aria-controls'));
  panel.classList.add('active');
  // Charts in hidden panels miss resize events; catch them up on show.
  _chartMeta.filter(m => panel.contains(m.canvas)).forEach(m => {
    sizeChart(m);
    m.wrap.scrollLeft = m.wrap.scrollWidth;
  });
  if (!_fidelis) return;
  if (btn.id === 'tab-eur' && !_eurBuilt && _fidelis.eur.length) {
    buildChart('eurChart', ...seriesByMaturity(_fidelis.eur), 'Evoluție dobânzi Fidelis EUR');
    _eurBuilt = true;
  }
  const don = _fidelis.donatori;
  if (btn.id === 'tab-don' && !_donBuilt && (don.ron.length || don.eur.length)) {
    buildChart('donChart', ...seriesDonatori(don), 'Evoluție dobânzi Fidelis Donatori');
    _donBuilt = true;
  }
}

document.querySelectorAll('.fidelis-card [role="tablist"]').forEach(list => {
  const tabs = [...list.querySelectorAll('.tab-btn')];
  tabs.forEach((btn, i) => {
    btn.addEventListener('click', () => selectTab(btn));
    btn.addEventListener('keydown', e => {
      const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
      if (!step) return;
      const next = tabs[(i + step + tabs.length) % tabs.length];
      next.focus();
      selectTab(next);
      e.preventDefault();
    });
  });
});
