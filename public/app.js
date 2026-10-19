// ── Colors & shapes ──────────────────────────────────────────────
// Each maturity owns a fixed color (--mat-<years> in style.css) and a fixed
// point shape, so "3 ani" looks the same on every chart, legend and tile.
// The shape is the second channel: no palette keeps every pair of 4+ series
// apart for color-blind readers, so identity never rests on color alone.
const MAT_SHAPE = {
  1:  'M1 6a5 5 0 1 0 10 0a5 5 0 1 0-10 0z',                                    // circle
  2:  'M1.5 1.5h9v9h-9z',                                                         // square
  3:  'M6 .8 11.4 10.6H.6z',                                                      // triangle
  4:  'M6 .3 11.7 6 6 11.7 .3 6z',                                                // diamond
  5:  'M6 11.2 .6 1.4h10.8z',                                                     // inverted triangle
  6:  'M6 .6 10.7 3.3v5.4L6 11.4 1.3 8.7V3.3z',                                   // hexagon
  7:  'M6 .6 11.5 4.6 9.4 11.1H2.6L.5 4.6z',                                      // pentagon
  10: 'M6 .3 7.7 4.2l4.1.4-3.1 2.8.9 4.1L6 9.4l-3.6 2.1.9-4.1L.2 4.6l4.1-.4z',   // star
};
const matVar = m => MAT_SHAPE[m] ? `var(--mat-${m})` : 'var(--text-muted)';
const shapeOf = m => MAT_SHAPE[m] || MAT_SHAPE[1];
const shapeSvg = m =>
  `<svg class="swatch-shape" viewBox="0 0 12 12" aria-hidden="true"><path d="${shapeOf(m)}" style="fill:${matVar(m)}"/></svg>`;

// Chart.js draws image point styles at their CSS size in the device-scaled
// context, so an SVG image stays crisp on high-DPI screens.
function pointImage(m, color, ring) {
  const img = new Image(11, 11);
  img.src = 'data:image/svg+xml,' + encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="-1.5 -1.5 15 15">` +
    `<path d="${shapeOf(m)}" fill="${color}" stroke="${ring}" stroke-width="1.6" paint-order="stroke"/></svg>`);
  return img;
}

const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const resolve = v => v.startsWith('var(') ? cssVar(v.slice(4, -1)) : v;

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ── Load data from JSON files ────────────────────────────────────
let _fidelis = null;
let _eurBuilt = false;
let _donBuilt = false;
const _charts = [];

// Romanian number format: decimal comma (6,20%).
const fmtDec = (v, min = 2, max = min) =>
  v.toLocaleString('ro-RO', { minimumFractionDigits: min, maximumFractionDigits: max });

const yearsLabel = m => `${m} ${Number(m) === 1 ? 'an' : 'ani'}`;

// Data labels use English month abbreviations ("May 2026", "Apr–May 2026");
// they stay that way in the JSON (scraper + validator key on them) and are
// translated only for display.
const RO_MONTH = { Jan: 'ian', Feb: 'feb', Mar: 'mar', Apr: 'apr', May: 'mai', Jun: 'iun',
                   Jul: 'iul', Aug: 'aug', Sep: 'sep', Oct: 'oct', Nov: 'nov', Dec: 'dec' };
const roLabel = d => d && d.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, m => RO_MONTH[m]);

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
  const since = `față de ${roLabel(row.prev.d)} (${fmtDec(row.prev.r)}%)`;
  if (d === 0) return `<span class="delta" title="Neschimbat ${since}">neschimbat<span class="visually-hidden"> ${since}</span></span>`;
  const up = d > 0;
  const txt = `${up ? '+' : '−'}${fmtDec(Math.abs(d))} pp`;
  return `<span class="delta ${up ? 'delta-up' : 'delta-down'}" title="${txt} ${since}">${up ? ICON_UP : ICON_DOWN}${txt}<span class="visually-hidden"> ${since}</span></span>`;
}

function nowGroupHtml({ title, dot, date, rows, href, tab }) {
  const items = rows
    .sort((a, b) => a.m - b.m || a.tag.localeCompare(b.tag))
    .map(r => `<li class="now-row">
      <span class="now-mat">${shapeSvg(r.m)}${yearsLabel(r.m)}${r.tag ? ' ' + r.tag : ''}</span>
      <span class="now-rate">${fmtDec(r.r)}<small>%</small></span>
      ${deltaHtml(r)}
    </li>`).join('');
  return `<div class="now-group">
    <div class="now-group-head">
      <span class="dot dot-${dot}" aria-hidden="true"></span>
      <h3>${title}</h3>
      <span class="now-group-date">${roLabel(date)}</span>
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
    return { label: yearsLabel(m), mat: m, color: matVar(m), dashed: false, values };
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
    return { label: `${yearsLabel(m)} ${ccy}`, mat: Number(m), color: matVar(Number(m)), dashed: ccy === 'EUR', values };
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
    const h = chart.height; // full height, so rotated x labels never show through
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
let _lastH = chartHeight();
let _resizeTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_resizeTimer);
  _resizeTimer = setTimeout(() => {
    // Mobile browsers fire resize when the URL bar hides; ignore small
    // height-only changes so the chart doesn't jump while scrolling.
    const h = chartHeight();
    if (window.innerWidth === _lastW && Math.abs(h - _lastH) < 60) return;
    _lastW = window.innerWidth;
    _lastH = h;
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

// Sets a dataset's theme-dependent colors and point image; returns a
// promise that settles once the image is decoded.
function styleDataset(ds, t) {
  const c = resolve(ds._color);
  ds.borderColor = c;
  ds.backgroundColor = c;
  ds.pointBackgroundColor = c;
  ds.pointStyle = pointImage(ds._mat, c, t.surface);
  return ds.pointStyle.decode().catch(() => {});
}

function applyTheme(chart) {
  const t = themeOptions();
  const decoding = chart.data.datasets.map(ds => styleDataset(ds, t));
  const tip = chart.options.plugins.tooltip;
  Object.assign(tip, { backgroundColor: t.raised, borderColor: t.border, titleColor: t.text, bodyColor: t.text });
  ['x', 'y'].forEach(ax => {
    chart.options.scales[ax].ticks.color = t.axis;
    chart.options.scales[ax].grid.color = t.grid;
    chart.options.scales[ax].border = { color: t.grid };
  });
  return Promise.all(decoding);
}

// Point images decode asynchronously; draw once now and again when ready.
// A full update(): update('none') reuses cached point options and would
// keep the previous theme's images.
function repaint(chart) {
  const ready = applyTheme(chart);
  chart.update();
  ready.then(() => chart.update());
}

document.addEventListener('themechange', () => _charts.forEach(repaint));

function buildChart(canvasId, labels, series, ariaLabel) {
  const canvas = document.getElementById(canvasId);
  const wrap   = canvas.closest('.chart-wrap');
  const outer  = canvas.closest('.chart-outer');

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${ariaLabel}, ${roLabel(labels[0])} până în ${roLabel(labels[labels.length - 1])}`);

  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('role', 'region');
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
    _mat: s.mat,
    data: labels.map(lbl => s.values[lbl] ?? null),
    fill: false,
    tension: 0.3,
    pointHitRadius: 8,
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
    btn.innerHTML = (s.dashed
      ? `<span class="swatch swatch-dashed" aria-hidden="true" style="border-color:${s.color}"></span>`
      : '') + shapeSvg(s.mat) + s.label;
    btn.dataset.idx = i;
    legendEl.appendChild(btn);
  });
  canvas.closest('.chart-panel')?.querySelector('.chart-skeleton')?.classList.add('hidden');
  outer.insertBefore(legendEl, wrap);
  wrap.insertAdjacentElement('afterend', yAxis);

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  const theme = themeOptions();
  datasets.forEach(ds => styleDataset(ds, theme));

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels: labels.map(roLabel), datasets },
    plugins: [stickyYAxis],
    options: {
      responsive: false,
      maintainAspectRatio: false, // resize() must honor the width sizeChart() computes
      animation: REDUCED_MOTION ? false : { duration: 400 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        colors: { enabled: false }, // colors come from the --mat-* tokens
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
            label: ctx => ` ${ctx.dataset.label}: ${fmtDec(ctx.parsed.y)}%`,
          },
        },
      },
      scales: {
        x: {
          ticks: { maxRotation: 45, minRotation: 30, font: { size: 12 } },
          grid: { display: false },
        },
        y: {
          ticks: { font: { size: 12 }, callback: v => fmtDec(v, 0, 2) + '%' },
          grid: {},
        },
      },
    },
  });
  chart.$yAxis = yAxis;
  meta.chart = chart;
  _chartMeta.push(meta);
  repaint(chart);
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
