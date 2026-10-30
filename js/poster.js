import { moodOf } from './moods.js';
import { isDotChar } from './sentences.js';

const W = 1080, H = 1350, MARGIN = 96;
// Canvas can't set variation axes, so the poster uses the four static cuts of Geist Serif.
const FAMILY_BY_SHAPE = { round: 'GS Regular', square: 'GS Square', triangle: 'GS Triangle', heart: 'GS Heart' };

export class PosterExporter {
  async export(states) {
    await this.loadFonts();
    const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
    const ctx = canvas.getContext('2d');
    const classified = states.filter((s) => s.clean);
    this.paintBackground(ctx, classified);
    this.paintMasthead(ctx, classified);
    this.paintBody(ctx, classified);
    this.paintRibbon(ctx, classified);
    this.paintGrain(ctx);
    return canvas;
  }

  loadFonts() {
    const families = [...Object.values(FAMILY_BY_SHAPE), 'Geist Mono'];
    return Promise.all(families.map((family) => document.fonts.load(`40px "${family}"`, 'Aa.')));
  }

  dominantHue(states) {
    const last = states.filter((s) => s.label !== 'pending').at(-1);
    return moodOf(last?.label).hue;
  }

  paintBackground(ctx, states) {
    ctx.fillStyle = '#0b0a09'; ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W * 0.75, H * 0.2, 0, W * 0.75, H * 0.2, W);
    glow.addColorStop(0, this.dominantHue(states) + '2e'); glow.addColorStop(1, '#0b0a0900');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
    const vignette = ctx.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.95);
    vignette.addColorStop(0, '#00000000'); vignette.addColorStop(1, '#000000b0');
    ctx.fillStyle = vignette; ctx.fillRect(0, 0, W, H);
  }

  paintMasthead(ctx) {
    ctx.fillStyle = '#efe8d8'; ctx.font = '120px "GS Heart"'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('Mood Dots', MARGIN, MARGIN + 100);
    ctx.font = '20px "Geist Mono"'; ctx.fillStyle = '#efe8d899';
    const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    ctx.fillText(`ISSUE Nº 01 — ${date}`, MARGIN, MARGIN + 150);
    ctx.fillRect(MARGIN, MARGIN + 178, W - MARGIN * 2, 1);
  }

  paintBody(ctx, states) {
    const size = this.fitSize(ctx, states);
    let x = MARGIN, y = MARGIN + 260 + size;
    for (const state of states) {
      const mood = moodOf(state.label);
      ctx.font = `${size}px "${FAMILY_BY_SHAPE[mood.shape]}"`;
      for (const word of state.raw.split(/(\s+)/)) {
        const width = ctx.measureText(word).width;
        if (x + width > W - MARGIN && word.trim()) { x = MARGIN; y += size * 1.12; }
        if (!word.trim() && x === MARGIN) continue;
        x = this.paintWord(ctx, word, x, y, mood.hue);
      }
    }
  }

  paintWord(ctx, word, x, y, hue) {
    for (const ch of word) {
      const dot = isDotChar(ch);
      ctx.fillStyle = dot ? hue : '#efe8d8'; ctx.shadowColor = dot ? hue : 'transparent'; ctx.shadowBlur = dot ? 24 : 0;
      ctx.fillText(ch, x, y); x += ctx.measureText(ch).width;
    }
    ctx.shadowBlur = 0; return x;
  }

  fitSize(ctx, states) {
    const chars = states.reduce((n, s) => n + s.raw.length, 0) || 1;
    const area = (W - MARGIN * 2) * (H - MARGIN * 2 - 420);
    return Math.max(40, Math.min(150, Math.sqrt(area / chars) * 1.25));
  }

  paintRibbon(ctx, states) {
    const y = H - MARGIN; ctx.font = '72px "GS Regular"';
    ctx.fillStyle = '#efe8d833'; ctx.fillRect(MARGIN, y - 60, W - MARGIN * 2, 1);
    states.filter((s) => s.label !== 'pending').forEach((s, i) => {
      const mood = moodOf(s.label);
      ctx.font = `72px "${FAMILY_BY_SHAPE[mood.shape]}"`; ctx.fillStyle = mood.hue;
      ctx.shadowColor = mood.hue; ctx.shadowBlur = 18; ctx.fillText('.', MARGIN + i * 34, y);
    });
    ctx.shadowBlur = 0; ctx.font = '18px "Geist Mono"'; ctx.fillStyle = '#efe8d877'; ctx.textAlign = 'right';
    ctx.fillText('SET IN GEIST SERIF · MOOD READ IN-BROWSER', W - MARGIN, y); ctx.textAlign = 'left';
  }

  paintGrain(ctx) {
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(img, 0, 0);
  }
}
