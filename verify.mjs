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
// Editing: deleting the first sentence must not hand its shape to the next one.
const afterDelete = await page.evaluate(async () => {
  const { editor } = moodDots;
  const before = editor.states.map((s) => s.shownElsh);
  editor.setText(editor.textarea.value.replace(/^[^.]*\.\s*/, ''));
  const shown = editor.states.map((s) => s.shownElsh);
  await new Promise((r) => setTimeout(r, 800));
  return { before, shown, after: editor.states.map((s) => s.shownElsh) };
});
const deleteOk = JSON.stringify(afterDelete.shown) === JSON.stringify(afterDelete.before.slice(1))
  && JSON.stringify(afterDelete.after) === JSON.stringify(afterDelete.shown);
ok &&= deleteOk; console.log(deleteOk ? 'PASS' : 'FAIL', 'delete first sentence keeps others', JSON.stringify(afterDelete));

// Paste a sad sentence: it should classify and get the round shape once.
await page.evaluate(() => { const t = document.getElementById('input'); t.focus(); t.setSelectionRange(t.value.length, t.value.length); });
await page.evaluate(() => document.execCommand('insertText', false, ' I miss her so much and I feel empty.'));
await page.waitForFunction(() => moodDots.editor.states.at(-1).label !== 'pending', { timeout: 10000, polling: 200 });
const pasted = await page.evaluate(() => moodDots.editor.states.at(-1).label);
const pasteOk = ['sadness', 'fear'].includes(pasted);
ok &&= pasteOk; console.log(pasteOk ? 'PASS' : 'FAIL', 'pasted sad sentence ->', pasted);

// Hover tooltip shows the mood of the sentence under the pointer.
const box = await page.evaluate(() => { const r = moodDots.editor.states[0].el.getClientRects()[0]; return { x: r.left + 20, y: r.top + r.height / 2 }; });
await page.mouse.move(box.x, box.y);
const tip = await page.$eval('#tip', (el) => el.classList.contains('on') && el.textContent);
ok &&= Boolean(tip); console.log(tip ? 'PASS' : 'FAIL', 'hover tooltip ->', tip);

// Sound: every voice renders offline without NaN or clipping.
const audio = await page.evaluate(async () => {
  const { VOICES, createMaster } = await import('./js/voices.js');
  const ctx = new OfflineAudioContext(2, 44100 * 2, 44100), out = createMaster(ctx);
  Object.keys(VOICES).forEach((name, i) => VOICES[name](ctx, out, 0.05 + i * 0.2, Math.random));
  const data = (await ctx.startRendering()).getChannelData(0);
  let peak = 0; for (const v of data) { if (Number.isNaN(v)) return { peak: NaN }; peak = Math.max(peak, Math.abs(v)); }
  return { peak, voices: Object.keys(VOICES).length };
});
const audioOk = audio.peak > 0.01 && audio.peak < 1;
ok &&= audioOk; console.log(audioOk ? 'PASS' : 'FAIL', 'sound voices render, peak', audio.peak.toFixed(3), 'voices', audio.voices);

// Long text: after typing past the bottom, the end of the text stays in view.
const longOk = await page.evaluate(() => {
  const { editor } = moodDots;
  editor.setText(editor.textarea.value + ' One more line to push things down. And another one here. And one more after that.'.repeat(2));
  editor.scrollToEnd();
  const last = [...editor.states.at(-1).el.getClientRects()].at(-1), box = editor.mirror.getBoundingClientRect();
  return last.bottom <= box.bottom + 1 && last.top >= box.top - 1;
});
ok &&= longOk; console.log(longOk ? 'PASS' : 'FAIL', 'long text keeps the end in view');
const orphans = await page.evaluate(() => [...document.querySelectorAll('#mirror .w')].filter((w) => { const tops = [...w.getClientRects()].map((r) => r.bottom); return Math.max(...tops) - Math.min(...tops) > 4; }).length);
ok &&= orphans === 0; console.log(orphans === 0 ? 'PASS' : 'FAIL', 'no word or punctuation split across lines', orphans);
await page.evaluate(() => moodDots.editor.setText('I love this so much. This is absolutely infuriating. The meeting is at 3pm. I miss her so much and I feel empty.'));
await new Promise((r) => setTimeout(r, 1200));

// Clipping: timeline beads (with glow margin), legend and buttons stay inside the viewport.
for (const [width, height] of [[1280, 800], [1440, 900], [1920, 1080], [1280, 650], [390, 844]]) {
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.evaluate(() => moodDots.editor.refresh());
  await new Promise((r) => setTimeout(r, 1200));
  const bad = await page.evaluate(() => {
    const GLOW = 8, out = [];
    document.querySelectorAll('#ribbon .bead, .legend li, .actions button, #sound').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width && (r.left < 0 || r.right > innerWidth || r.top < 0 || r.bottom + (el.classList.contains('bead') ? GLOW : 0) > innerHeight))
        out.push(`${el.className || el.tagName} ${Math.round(r.top)}-${Math.round(r.bottom)}`);
    });
    if (!document.querySelectorAll('#ribbon .bead').length) out.push('no beads');
    return out;
  });
  const pass = bad.length === 0; ok &&= pass;
  console.log(pass ? 'PASS' : 'FAIL', `layout ${width}x${height}`, bad.join(', '));
  await page.screenshot({ path: `shots/layout-${width}x${height}.png` });
}

console.log(errors.length ? `FAIL console errors: ${errors.join(' | ')}` : 'PASS no console errors');
await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 2 });
await new Promise((r) => setTimeout(r, 800));
await page.screenshot({ path: 'shots/desktop.png' });
await page.screenshot({ path: 'shots/dots-zoom.png', clip: { x: 80, y: 110, width: 900, height: 360 } });
const poster = await page.evaluate(async () => (await moodDots.poster.export(moodDots.editor.states)).toDataURL());
(await import('fs')).writeFileSync('shots/poster.png', Buffer.from(poster.split(',')[1], 'base64'));
console.log('saved shots/desktop.png dots-zoom.png layout-*.png poster.png');
await browser.close();
process.exit(ok ? 0 : 1);
