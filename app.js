// ── Colors ───────────────────────────────────────────────────────
const T_CLR = {1:'#ff6384',2:'#36a2eb',3:'#ffce56',5:'#9966ff'};
const F_CLR = {1:'#ff6384',2:'#36a2eb',3:'#ffce56',4:'#4bc0c0',5:'#9966ff',6:'#ff9f40',7:'#00ff88',10:'#ff00ff'};
const D_CLR = {'1ron':'#ff6384','2ron':'#36a2eb','3ron':'#ffce56','1eur':'#ff9f40','2eur':'#4bc0c0','3eur':'#9966ff'};

// ── Load data from JSON files ────────────────────────────────────
let _eurData = [];
let _donData = { ron: [], eur: [] };
let _eurBuilt = false;
let _donBuilt = false;

// ── Latest rates strip ────────────────────────────────────────────
function buildRatesStrip(raw, stripId, colorMap) {
  const strip = document.getElementById(stripId);
  if (!strip) return;
  const lastDate = raw[raw.length - 1]?.d;
  if (!lastDate) return;
  const latest = raw.filter(e => e.d === lastDate)
    .sort((a, b) => Number(a.m) - Number(b.m));
  const pills = latest.map(e => {
    const label = `${e.m} ${e.m === 1 ? 'an' : 'ani'}`;
    const color = colorMap[e.m] || '#fff';
    return `<span class="rate-pill">
      <span class="legend-swatch" aria-hidden="true" style="background:${color}"></span>
      <span class="pill-label">${label}</span>
      <span class="pill-value">${e.r}%</span>
    </span>`;
  }).join('');
  strip.innerHTML = `<span class="strip-date">${lastDate}</span>` + pills;
}

Promise.all([
  fetch('data/tezaur.json').then(r => r.json()),
  fetch('data/fidelis.json').then(r => r.json()),
]).then(([tezaur, fidelis]) => {
  _eurData = fidelis.eur;
  _donData = fidelis.donatori || { ron: [], eur: [] };
  buildRatesStrip(tezaur,      'tezaur-rates',     T_CLR);
  buildRatesStrip(fidelis.ron, 'fidelis-rates-ron', F_CLR);
  buildChart(tezaur,      'tezaurChart', T_CLR, 'Evoluție dobânzi Tezaur RON');
  buildChart(fidelis.ron, 'ronChart',    F_CLR, 'Evoluție dobânzi Fidelis RON');
}).catch(err => console.error('Failed to load data:', err));

// ── Chart builder ─────────────────────────────────────────────
const PX_PER_LABEL = 18;
const CHART_HEIGHT = 300;

function buildChart(raw, canvasId, colorMap, ariaLabel) {
  const labels = [];
  raw.forEach(e => { if (!labels.includes(e.d)) labels.push(e.d); });

  const mats = [...new Set(raw.map(e => e.m))].sort((a, b) => Number(a) - Number(b));

  const map = {};
  raw.forEach(e => {
    if (!map[e.m]) map[e.m] = {};
    map[e.m][e.d] = e.r;
  });

  const canvas = document.getElementById(canvasId);
  const wrap   = canvas.closest('.chart-wrap');
  const outer  = canvas.closest('.chart-outer');

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${ariaLabel}, ${labels[0]} până în ${labels[labels.length - 1]}`);

  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label', `${ariaLabel} — derulați orizontal`);
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { wrap.scrollLeft += 60; e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { wrap.scrollLeft -= 60; e.preventDefault(); }
  });

  const containerW = outer.clientWidth || window.innerWidth;
  const chartW     = Math.max(containerW, labels.length * PX_PER_LABEL);

  canvas.style.width  = chartW + 'px';
  canvas.style.height = CHART_HEIGHT + 'px';
  wrap.style.height   = CHART_HEIGHT + 'px';

  wrap.addEventListener('scroll', () => {
    const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
    outer.classList.toggle('scrolled-end', atEnd);
  }, { passive: true });
  if (chartW <= containerW) outer.classList.add('scrolled-end');

  const datasets = mats.map(m => ({
    label: m + ' ani',
    data: labels.map(lbl => map[m]?.[lbl] ?? null),
    borderColor: colorMap[m] || '#fff',
    backgroundColor: colorMap[m] || '#fff',
    fill: false,
    tension: 0.3,
    pointRadius: labels.map(lbl => map[m]?.[lbl] != null ? 4 : 0),
    pointHoverRadius: 7,
    spanGaps: false,
    borderWidth: 2,
  }));

  const legendEl = document.createElement('div');
  legendEl.className = 'chart-legend';
  legendEl.setAttribute('role', 'group');
  legendEl.setAttribute('aria-label', 'Filtrează maturități');
  datasets.forEach((ds, i) => {
    const btn = document.createElement('button');
    btn.className = 'legend-item';
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', `Afișează ${ds.label}`);
    btn.innerHTML = `<span class="legend-swatch" aria-hidden="true" style="background:${ds.borderColor}"></span>${ds.label}`;
    btn.dataset.idx = i;
    legendEl.appendChild(btn);
  });
  const panel = canvas.closest('.chart-panel');
  panel?.querySelector('.chart-skeleton')?.classList.add('hidden');
  outer.insertBefore(legendEl, wrap);

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,12,18,0.92)',
          borderColor: '#252a35',
          borderWidth: 1,
          titleColor: '#cdd',
          bodyColor: '#aab',
          padding: 10,
          callbacks: {
            label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label}: ${ctx.parsed.y}%` : null,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#778', maxRotation: 45, minRotation: 30, font: { size: 9 } },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
          ticks: { color: '#778', font: { size: 10 }, callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
      },
    },
  });

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

// ── Donatori rates strip ───────────────────────────────────────────
function buildDonatoriRatesStrip(donData, stripId) {
  const strip = document.getElementById(stripId);
  if (!strip) return;

  const lastRon = donData.ron[donData.ron.length - 1]?.d;
  const lastEur = donData.eur[donData.eur.length - 1]?.d;

  const latestRon = lastRon ? donData.ron.filter(e => e.d === lastRon) : [];
  const latestEur = lastEur ? donData.eur.filter(e => e.d === lastEur) : [];

  const allDates = [...new Set([lastRon, lastEur].filter(Boolean))];
  const dateLabel = allDates.length === 1 ? allDates[0] : allDates.join(' / ');

  const pills = [
    ...latestRon.map(e => ({ ...e, ccy: 'ron' })),
    ...latestEur.map(e => ({ ...e, ccy: 'eur' })),
  ].map(e => {
    const key = `${e.m}${e.ccy}`;
    const label = `${e.m} ${e.m === 1 ? 'an' : 'ani'} ${e.ccy.toUpperCase()}`;
    const color = D_CLR[key] || '#fff';
    return `<span class="rate-pill">
      <span class="legend-swatch" aria-hidden="true" style="background:${color}"></span>
      <span class="pill-label">${label}</span>
      <span class="pill-value">${e.r}%</span>
    </span>`;
  }).join('');

  strip.innerHTML = `<span class="strip-date">${dateLabel}</span>` + pills;
}

// ── Donatori chart (RON + EUR merged) ────────────────────────────
function buildDonatoriChart(donData) {
  const tagged = [
    ...donData.ron.map(e => ({ ...e, ccy: 'ron' })),
    ...donData.eur.map(e => ({ ...e, ccy: 'eur' })),
  ];

  const MONTHS = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
  const parseDate = d => {
    const p = d.split(' ');
    return parseInt(p[p.length - 1]) * 12 + (MONTHS[p[0]] ?? 0);
  };
  const labelSet = new Set();
  tagged.forEach(e => labelSet.add(e.d));
  const labels = [...labelSet].sort((a, b) => parseDate(a) - parseDate(b));

  const seriesKeys = [...new Set(tagged.map(e => `${e.m}${e.ccy}`))].sort((a, b) => {
    const parseKey = k => {
      const m = parseFloat(k);
      const isEur = k.endsWith('eur') ? 0.5 : 0;
      return m + isEur;
    };
    return parseKey(a) - parseKey(b);
  });

  const map = {};
  tagged.forEach(e => {
    const k = `${e.m}${e.ccy}`;
    if (!map[k]) map[k] = {};
    map[k][e.d] = e.r;
  });

  const canvas = document.getElementById('donChart');
  const wrap   = canvas.closest('.chart-wrap');
  const outer  = canvas.closest('.chart-outer');

  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `Evoluție dobânzi Fidelis Donatori, ${labels[0]} până în ${labels[labels.length - 1]}`);

  wrap.setAttribute('tabindex', '0');
  wrap.setAttribute('aria-label', 'Evoluție dobânzi Fidelis Donatori — derulați orizontal');
  wrap.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { wrap.scrollLeft += 60; e.preventDefault(); }
    if (e.key === 'ArrowLeft')  { wrap.scrollLeft -= 60; e.preventDefault(); }
  });

  const containerW = outer.clientWidth || window.innerWidth;
  const chartW     = Math.max(containerW, labels.length * PX_PER_LABEL);

  canvas.style.width  = chartW + 'px';
  canvas.style.height = CHART_HEIGHT + 'px';
  wrap.style.height   = CHART_HEIGHT + 'px';

  wrap.addEventListener('scroll', () => {
    const atEnd = wrap.scrollLeft + wrap.clientWidth >= wrap.scrollWidth - 4;
    outer.classList.toggle('scrolled-end', atEnd);
  }, { passive: true });
  if (chartW <= containerW) outer.classList.add('scrolled-end');

  const datasets = seriesKeys.map(k => {
    const m = parseFloat(k);
    const isEur = k.endsWith('eur');
    const label = `${m} ${m === 1 ? 'an' : 'ani'} ${isEur ? 'EUR' : 'RON'}`;
    return {
      label,
      data: labels.map(lbl => map[k]?.[lbl] ?? null),
      borderColor: D_CLR[k] || '#fff',
      backgroundColor: D_CLR[k] || '#fff',
      fill: false,
      tension: 0.3,
      pointRadius: labels.map(lbl => map[k]?.[lbl] != null ? 4 : 0),
      pointHoverRadius: 7,
      spanGaps: false,
      borderWidth: 2,
      borderDash: isEur ? [5, 3] : [],
    };
  });

  const legendEl = document.createElement('div');
  legendEl.className = 'chart-legend';
  legendEl.setAttribute('role', 'group');
  legendEl.setAttribute('aria-label', 'Filtrează maturități');
  datasets.forEach((ds, i) => {
    const btn = document.createElement('button');
    btn.className = 'legend-item';
    btn.setAttribute('aria-pressed', 'true');
    btn.setAttribute('aria-label', `Afișează ${ds.label}`);
    btn.innerHTML = `<span class="legend-swatch" aria-hidden="true" style="background:${ds.borderColor}"></span>${ds.label}`;
    btn.dataset.idx = i;
    legendEl.appendChild(btn);
  });
  outer.insertBefore(legendEl, wrap);

  const chart = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10,12,18,0.92)',
          borderColor: '#252a35',
          borderWidth: 1,
          titleColor: '#cdd',
          bodyColor: '#aab',
          padding: 10,
          callbacks: {
            label: ctx => ctx.parsed.y != null ? `${ctx.dataset.label}: ${ctx.parsed.y}%` : null,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#778', maxRotation: 45, minRotation: 30, font: { size: 9 } },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
        y: {
          ticks: { color: '#778', font: { size: 10 }, callback: v => v + '%' },
          grid: { color: 'rgba(255,255,255,0.08)' },
        },
      },
    },
  });

  requestAnimationFrame(() => { wrap.scrollLeft = wrap.scrollWidth; });

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
    while (picked.length < 3 && src.length > 0) {
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
        <div class="dyk-card-title">${f.title}</div>
        <div class="dyk-card-body">${f.body}</div>
      </div>`).join('');
  }

  fetch('data/fun-facts.json')
    .then(r => r.json())
    .then(data => {
      facts = data;
      render();
      document.getElementById('dyk-shuffle-btn')?.addEventListener('click', render);
    })
    .catch(() => {});
})();

// ── Tab switching ──────────────────────────────────────────────────
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const card = btn.closest('.fidelis-card');
    card.querySelectorAll('.tab-btn').forEach(b => {
      b.setAttribute('aria-selected', 'false');
    });
    card.querySelectorAll('.chart-panel').forEach(p => p.classList.remove('active'));
    btn.setAttribute('aria-selected', 'true');
    document.getElementById(btn.getAttribute('aria-controls')).classList.add('active');
    if (btn.id === 'tab-eur' && !_eurBuilt && _eurData.length) {
      buildRatesStrip(_eurData, 'fidelis-rates-eur', F_CLR);
      buildChart(_eurData, 'eurChart', F_CLR, 'Evoluție dobânzi Fidelis EUR');
      _eurBuilt = true;
    }
    if (btn.id === 'tab-don' && !_donBuilt && (_donData.ron.length || _donData.eur.length)) {
      buildDonatoriRatesStrip(_donData, 'fidelis-rates-don');
      buildDonatoriChart(_donData);
      _donBuilt = true;
    }
  });
});
