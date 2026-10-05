import { chromium } from 'playwright'; import { mount, FREEZE } from './serve.mjs'; import fs from 'node:fs';
const FPS = 30, DUR = 20, N = FPS * DUR;
fs.mkdirSync('frames', { recursive: true });
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await mount(ctx); await ctx.addInitScript(FREEZE);
const p = await ctx.newPage();
p.on('pageerror', e => console.error('ERR', e.message));
await p.goto('http://site.local/brag-output/work/stage.html');
await p.evaluate(() => window.ready);
console.log('hlRows', await p.evaluate(() => geo.hlRows.length));
const [A, B] = [+(process.argv[2] ?? 0), +(process.argv[3] ?? N)];
for (let i = A; i < B; i++) {
  await p.evaluate(t => window.render(t), i / FPS);
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `frames/f${String(i).padStart(4, '0')}.png` });
  if (i % 100 === 0) console.log('frame', i);
}
await b.close();
