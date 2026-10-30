// Pure Web Audio synth voices. Each takes (ctx, out, time, rand) so the same code
// plays live and renders offline for the demo video. rand is a 0..1 generator.

const env = (ctx, gainNode, t, attack, peak, decay) => {
  gainNode.gain.setValueAtTime(0.0001, t);
  gainNode.gain.exponentialRampToValueAtTime(peak, t + attack);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
};

const tone = (ctx, out, t, { type = 'sine', freq, attack = 0.004, peak, decay, glideTo }) => {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type; osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay);
  env(ctx, gain, t, attack, peak, decay);
  osc.connect(gain).connect(out); osc.start(t); osc.stop(t + attack + decay + 0.05);
};

const noiseBurst = (ctx, out, t, { duration, peak, filterFreq, q = 1, type = 'bandpass' }) => {
  const frames = Math.ceil(ctx.sampleRate * duration), buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** 3;
  const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  src.buffer = buffer; filter.type = type; filter.frequency.value = filterFreq; filter.Q.value = q;
  gain.gain.value = peak; src.connect(filter).connect(gain).connect(out); src.start(t);
};

export const VOICES = {
  key(ctx, out, t, rand) { // soft mechanical tick: click transient + tiny body
    const pitch = 1 + (rand() - 0.5) * 0.25;
    noiseBurst(ctx, out, t, { duration: 0.03, peak: 0.22, filterFreq: 3800 * pitch, q: 1.4 });
    tone(ctx, out, t, { type: 'triangle', freq: 190 * pitch, peak: 0.05, decay: 0.035 });
  },
  space(ctx, out, t, rand) { // lower, quieter thock
    noiseBurst(ctx, out, t, { duration: 0.045, peak: 0.12, filterFreq: 1500 * (1 + (rand() - 0.5) * 0.1), q: 0.8 });
    tone(ctx, out, t, { type: 'sine', freq: 120, peak: 0.05, decay: 0.05 });
  },
  backspace(ctx, out, t) { // short downward zip
    noiseBurst(ctx, out, t, { duration: 0.035, peak: 0.16, filterFreq: 2400, q: 2 });
    tone(ctx, out, t, { type: 'triangle', freq: 520, glideTo: 260, peak: 0.04, decay: 0.06 });
  },
  click(ctx, out, t) { // button: two-part latch
    tone(ctx, out, t, { type: 'square', freq: 1800, peak: 0.03, decay: 0.012 });
    tone(ctx, out, t + 0.03, { type: 'sine', freq: 880, peak: 0.07, decay: 0.08 });
  },
  heart(ctx, out, t) { // bright sparkly arpeggio with shimmer
    [1318.5, 1661.2, 1975.5, 2637].forEach((f, i) => {
      tone(ctx, out, t + i * 0.055, { freq: f, peak: 0.09 - i * 0.012, decay: 0.7 });
      tone(ctx, out, t + i * 0.055, { freq: f * 2.01, peak: 0.015, decay: 0.35 });
    });
  },
  triangle(ctx, out, t) { // punchy pluck with a low thunk
    tone(ctx, out, t, { type: 'sawtooth', freq: 220, glideTo: 110, peak: 0.08, decay: 0.16, attack: 0.002 });
    tone(ctx, out, t, { freq: 90, glideTo: 45, peak: 0.22, decay: 0.18, attack: 0.002 });
    noiseBurst(ctx, out, t, { duration: 0.05, peak: 0.12, filterFreq: 900, q: 0.7, type: 'lowpass' });
  },
  square(ctx, out, t) { // clean two-note blip
    tone(ctx, out, t, { type: 'square', freq: 660, peak: 0.035, decay: 0.07 });
    tone(ctx, out, t + 0.07, { type: 'square', freq: 990, peak: 0.03, decay: 0.09 });
  },
  round(ctx, out, t) { // warm low bell with a bubbly pop
    tone(ctx, out, t, { freq: 392, peak: 0.12, decay: 1.1, attack: 0.006 });
    tone(ctx, out, t, { freq: 392 * 2.76, peak: 0.025, decay: 0.5 });
    tone(ctx, out, t, { freq: 300, glideTo: 900, peak: 0.06, decay: 0.09 });
  },
};

// Master chain: gentle reverb send + compressor so stacked sounds never clip.
export function createMaster(ctx, volume = 0.6) {
  const input = ctx.createGain(), master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  const reverb = ctx.createConvolver(), wet = ctx.createGain();
  reverb.buffer = impulse(ctx, 1.6); wet.gain.value = 0.18; master.gain.value = volume;
  comp.threshold.value = -14; comp.ratio.value = 6;
  input.connect(master); input.connect(reverb).connect(wet).connect(master);
  master.connect(comp).connect(ctx.destination);
  return input;
}

function impulse(ctx, seconds) {
  const length = ctx.sampleRate * seconds, buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 2.5;
  }
  return buffer;
}
