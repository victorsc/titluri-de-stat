import { chromium } from 'playwright'; import { mount, FREEZE } from './serve.mjs';
const times = process.argv.slice(2).map(Number);
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
await mount(ctx); await ctx.addInitScript(FREEZE);
const p = await ctx.newPage();
p.on('pageerror', e => console.error('ERR', e.message));
await p.goto('http://site.local/brag-output/work/stage.html');
await p.evaluate(() => window.ready);
for (const t of times) {
  await p.evaluate(t => window.render(t), t);
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await p.screenshot({ path: `still-${t.toFixed(2)}.png` });
}
await b.close();
