// Records a Replay with sound to shots/replay-sound.mp4 (and the silent shots/replay.mp4).
// Headless capture has no audio, so the page logs each sound event; we re-render the same synth
// offline in the page, write a WAV and mux it with ffmpeg. Needs the local server on :8765.
import puppeteer from 'puppeteer-core';
import fs from 'fs';
import { execFileSync } from 'child_process';

const TEXT = 'I love you more than words. This traffic is absolutely infuriating. The train leaves at nine. I miss you so much it hurts.';
const DIR = new URL('./.tmp/frames', import.meta.url).pathname;
const TAIL_SECONDS = 2.5;

async function openPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:8765/?speed=0.9&text=${encodeURIComponent(TEXT)}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.moodDots?.editor.states.length === 4 && moodDots.editor.states.every((s) => s.label !== 'pending'),
    { timeout: 120000, polling: 300 });
  console.log('labels', await page.evaluate(() => moodDots.editor.states.map((s) => s.label).join(', ')));
  return page;
}

const anchor = {};

async function captureFrames(page) {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR);
  const cdp = await page.createCDPSession(), frames = [];
  frames.anchor = anchor;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = `${DIR}/${String(frames.length).padStart(5, '0')}.jpg`;
    fs.writeFileSync(file, Buffer.from(data, 'base64')); frames.push({ file, t: metadata.timestamp });
    // Pair a frame timestamp with the page clock once, so sound events (page clock) map onto video time.
    if (frames.length === 10) anchor.page = await page.evaluate(() => performance.now()), anchor.frame = metadata.timestamp;
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  // Starting audio stalls headless Chrome for seconds, so warm it up before recording.
  await page.mouse.click(5, 5);
  await page.waitForFunction(() => moodDots.sound.ctx, { timeout: 20000, polling: 100 });
  await page.evaluate(() => moodDots.sound.play('key')); // the first live sound opens the audio device (slow headless)
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate(() => { moodDots.editor.setText(''); moodDots.sound.log = []; });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92 });
  await new Promise((r) => setTimeout(r, 700));
  await page.evaluate((t) => { moodDots.editor.textarea.value = t; }, TEXT);
  await page.click('#replay');
  await page.waitForFunction((t) => moodDots.editor.textarea.value === t, { timeout: 60000, polling: 100 }, TEXT);
  await new Promise((r) => setTimeout(r, TAIL_SECONDS * 1000));
  await cdp.send('Page.stopScreencast');
  return frames;
}

function writeVideo(frames, path) {
  const list = frames.map((f, i) => `file '${f.file}'\nduration ${((frames[i + 1]?.t ?? f.t + 0.04) - f.t).toFixed(4)}`).join('\n');
  fs.writeFileSync(`${DIR}/list.txt`, `${list}\nfile '${frames.at(-1).file}'\n`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', `${DIR}/list.txt`,
    '-vf', 'fps=30,scale=1920:1080:flags=lanczos,format=yuv420p', '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', path]);
}

// Renders the logged sound events offline, aligned to the first video frame. Returns WAV bytes.
async function renderAudio(page, offsetSeconds, durationSeconds) {
  const base64 = await page.evaluate(async (offset, duration) => {
    const { VOICES, createMaster } = await import('./js/voices.js');
    const { sound } = moodDots, rate = 48000;
    const ctx = new OfflineAudioContext(2, Math.ceil(rate * duration), rate), out = createMaster(ctx);
    let seed = 7; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (const { name, t } of sound.log) {
      const at = t + offset; // t is seconds since sound.epoch
      if (at >= 0 && at < duration) VOICES[name](ctx, out, at, rand);
    }
    const buffer = await ctx.startRendering();
    const [left, right] = [buffer.getChannelData(0), buffer.getChannelData(1)];
    const bytes = new DataView(new ArrayBuffer(44 + left.length * 4));
    const str = (o, s) => [...s].forEach((c, i) => bytes.setUint8(o + i, c.charCodeAt(0)));
    str(0, 'RIFF'); bytes.setUint32(4, 36 + left.length * 4, true); str(8, 'WAVEfmt ');
    bytes.setUint32(16, 16, true); bytes.setUint16(20, 1, true); bytes.setUint16(22, 2, true);
    bytes.setUint32(24, rate, true); bytes.setUint32(28, rate * 4, true); bytes.setUint16(32, 4, true); bytes.setUint16(34, 16, true);
    str(36, 'data'); bytes.setUint32(40, left.length * 4, true);
    for (let i = 0; i < left.length; i++) {
      bytes.setInt16(44 + i * 4, Math.max(-1, Math.min(1, left[i])) * 32767, true);
      bytes.setInt16(46 + i * 4, Math.max(-1, Math.min(1, right[i])) * 32767, true);
    }
    let binary = ''; const u8 = new Uint8Array(bytes.buffer);
    for (let i = 0; i < u8.length; i += 0x8000) binary += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(binary);
  }, offsetSeconds, durationSeconds);
  return Buffer.from(base64, 'base64');
}

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await openPage(browser);
const frames = await captureFrames(page);
const duration = frames.at(-1).t - frames[0].t;
const epoch = await page.evaluate(() => moodDots.sound.epoch);
// video time of sound.epoch = (epoch - anchor page time) + anchor frame's video time
const offset = (epoch - anchor.page) / 1000 + (anchor.frame - frames[0].t);
fs.writeFileSync(`${DIR}/audio.wav`, await renderAudio(page, offset, duration + 0.5));
const events = await page.evaluate(() => moodDots.sound.log.reduce((m, e) => ({ ...m, [e.name]: (m[e.name] || 0) + 1 }), {}));
// Headless Chrome pauses for a few seconds after the click; start the cut just before the click.
const clickT = await page.evaluate(() => moodDots.sound.log.find((e) => e.name === 'click').t);
const trimStart = Math.max(0, offset + clickT - 0.6).toFixed(3);
await browser.close();

writeVideo(frames, `${DIR}/full.mp4`);
const cut = ['-ss', trimStart];
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...cut, '-i', `${DIR}/full.mp4`, '-c:v', 'libx264', '-crf', '18', '-movflags', '+faststart', 'shots/replay.mp4']);
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...cut, '-i', `${DIR}/full.mp4`, ...cut, '-i', `${DIR}/audio.wav`,
  '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-crf', '18', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', 'shots/replay-sound.mp4']);
console.log(`frames=${frames.length} trim=${trimStart}s span=${duration.toFixed(1)}s events=${JSON.stringify(events)} -> shots/replay.mp4, shots/replay-sound.mp4`);
