// Records the Replay to shots/replay.mp4 via CDP screencast + ffmpeg. Needs the local server on :8765.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execFileSync } from 'child_process';
const TEXT = 'I love you more than words. This traffic is absolutely infuriating. The train leaves at nine. I miss you already.';
const DIR = '/tmp/md-frames';
fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR);
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });
await page.goto(`http://localhost:8765/?text=${encodeURIComponent(TEXT)}`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => moodDots.editor.states.every((s) => s.label !== 'pending'), { timeout: 90000, polling: 500 });
await page.evaluate(() => { moodDots.editor.setText(''); document.activeElement.blur(); });
await new Promise((r) => setTimeout(r, 800));
const cdp = await page.createCDPSession();
const frames = [];
cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
  const file = `${DIR}/${String(frames.length).padStart(5, '0')}.jpg`;
  fs.writeFileSync(file, Buffer.from(data, 'base64')); frames.push({ file, t: metadata.timestamp });
  await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
});
await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
await page.evaluate((t) => moodDots.replayer.play(t), TEXT);
await new Promise((r) => setTimeout(r, 2500));
await cdp.send('Page.stopScreencast');
await browser.close();
const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? f.t + 0.04) - f.t).toFixed(4)}`).join('\n');
fs.writeFileSync(`${DIR}/list.txt`, list + `\nfile '${frames.at(-1).file}'\n`);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${DIR}/list.txt`,
  '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', 'shots/replay.mp4']);
console.log(`frames=${frames.length} span=${(frames.at(-1).t - frames[0].t).toFixed(1)}s -> shots/replay.mp4`);
