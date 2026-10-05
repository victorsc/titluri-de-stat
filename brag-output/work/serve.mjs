import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '../..');
const types = {'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.woff2':'font/woff2'};
const fontCss = fs.readFileSync(path.join(import.meta.dirname, 'inter-local.css'));
export async function mount(ctx) {
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ status: 200, contentType: 'text/css', body: fontCss });
    if (u.hostname !== 'site.local') return r.abort();
    const f = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    r.fulfill({ status: 200, contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
}
// Freeze Chart.js animations and CSS transitions in every frame so each video frame is a pure function of t.
export const FREEZE = `
  (() => {
    let C;
    Object.defineProperty(window, 'Chart', { configurable: true,
      get() { return C; },
      set(v) { C = v; try { v.defaults.animation = false; v.defaults.animations = false; v.defaults.transitions = {}; } catch {} } });
    document.addEventListener('DOMContentLoaded', () => {
      const s = document.createElement('style');
      s.textContent = '*,*::before,*::after{transition:none!important;animation:none!important;scroll-behavior:auto!important}';
      document.head.appendChild(s);
    });
  })();`;
