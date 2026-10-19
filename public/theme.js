'use strict';

// Theme follows the OS until the visitor picks one with the header toggle.
// The choice is stamped as <html data-theme> by an inline script in <head>
// (so there's no flash) and announced via a 'themechange' event so canvases
// that can't read CSS variables live (Chart.js) can repaint.
(function () {
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: light)');

  const current = () => root.dataset.theme || (media.matches ? 'light' : 'dark');
  const announce = () => document.dispatchEvent(new CustomEvent('themechange', { detail: current() }));

  function syncButton(btn) {
    const next = current() === 'dark' ? 'luminoasă' : 'întunecată';
    btn.setAttribute('aria-label', `Comută la tema ${next}`);
    btn.title = `Temă ${next}`;
  }

  media.addEventListener('change', () => { if (!root.dataset.theme) announce(); });

  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-toggle');
    if (!btn) return;
    syncButton(btn);
    btn.addEventListener('click', () => {
      const next = current() === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      try { localStorage.setItem('theme', next); } catch {}
      syncButton(btn);
      announce();
    });
    document.addEventListener('themechange', () => syncButton(btn));
  });
})();
