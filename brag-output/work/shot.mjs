import { chromium } from 'playwright'; import { mount } from './serve.mjs';
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } });
await mount(p);
for (const n of ['index','market']) {
  await p.goto(`http://site.local/public/${n}.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.screenshot({ path: `brag-output/work/ref-${n}.png`, fullPage: true });
}
await b.close();
