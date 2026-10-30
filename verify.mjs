// Usage: python3 -m http.server 8765 & node verify.mjs   (exits non-zero on failure)
import puppeteer from 'puppeteer-core';
const URL = process.env.URL || 'http://localhost:8765/';
// Set URL to a deployed address to check production (model comes from the Hugging Face hub there).
// [sentence, accepted labels, expected ELSH axis value]
const EXPECT = [['I love this so much.', ['joy'], 100], ['This is absolutely infuriating.', ['anger', 'disgust'], 50], ['The meeting is at 3pm.', ['neutral'], 25]];
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new',
  args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));
if (process.env.DEBUG) { page.on('console', (m) => console.log('[console]', m.type(), m.text())); page.on('requestfailed', (r) => console.log('[reqfail]', r.url())); }
await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 2 });
await page.goto(URL, { waitUntil: 'load' });
await page.waitForSelector('body.model-ready', { timeout: 120000 });
await page.waitForFunction(() => moodDots.editor.states.every((s) => s.label !== 'pending'), { timeout: 30000 });
await new Promise((r) => setTimeout(r, 1500));
const got = await page.evaluate(() => moodDots.editor.states.map((s) => [s.clean, s.label, s.el.style.fontVariationSettings]));
let ok = errors.length === 0;
EXPECT.forEach(([text, label, elsh], i) => {
  const [t, l, fvs] = got[i] || [];
  const axis = Number(fvs?.split(' ').pop());
  const pass = t === text && label.includes(l) && Math.abs(axis - elsh) < 3;
  ok &&= pass; console.log(pass ? 'PASS' : 'FAIL', JSON.stringify(text), '->', l, fvs);
});
// Sample rendered ELSH every 16ms during a replay: each sentence may only ever show its start (0) and final value.
const seen = await page.evaluate(async () => {
  const values = new Map(), allowed = { 0: 1, 25: 1, 50: 1, 100: 1 };
  const read = (el) => Number(getComputedStyle(el.querySelector('.dot') || el).fontVariationSettings.split(' ').pop());
  const timer = setInterval(() => {
    document.querySelectorAll('#mirror .sentence, #ribbon .bead').forEach((el) => {
      const key = el.closest('#ribbon') ? 'bead' + [...el.parentNode.children].indexOf(el) : 's' + el.dataset.i;
      (values.get(key) || values.set(key, new Set()).get(key)).add(read(el));
    });
  }, 16);
  await moodDots.replayer.play();
  await new Promise((r) => setTimeout(r, 1500));
  clearInterval(timer);
  return [...values].map(([k, v]) => [k, [...v]]);
});
for (const [key, values] of seen) {
  const finals = values.filter((v) => v !== 0);
  const pass = finals.length <= 1 && values.every((v) => [0, 25, 50, 100].includes(v));
  ok &&= pass; console.log(pass ? 'PASS' : 'FAIL', `${key} rendered ELSH values`, JSON.stringify(values));
}
console.log(errors.length ? `FAIL console errors: ${errors.join(' | ')}` : 'PASS no console errors');
await page.screenshot({ path: 'shots/desktop.png' });
await page.screenshot({ path: 'shots/dots-zoom.png', clip: { x: 80, y: 110, width: 900, height: 360 } });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/mobile.png' });
const poster = await page.evaluate(async () => (await moodDots.poster.export(moodDots.editor.states)).toDataURL());
(await import('fs')).writeFileSync('shots/poster.png', Buffer.from(poster.split(',')[1], 'base64'));
console.log('saved shots/desktop.png dots-zoom.png mobile.png poster.png');
await browser.close();
process.exit(ok ? 0 : 1);
