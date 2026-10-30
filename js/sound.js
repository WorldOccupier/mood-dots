import { VOICES, createMaster } from './voices.js';

const STORAGE_KEY = 'mood-dots-sound';

// Live sound player. The AudioContext is created on the first user gesture (autoplay rules).
// Every played sound is also logged with a timestamp so the demo recorder can re-render it offline.
export class SoundEngine {
  constructor(storage = localStorage) {
    this.storage = storage;
    this.enabled = storage.getItem(STORAGE_KEY) !== 'off';
    this.log = [];
    this.epoch = performance.now();
  }

  unlock() {
    if (!this.ctx) { this.ctx = new AudioContext(); this.out = createMaster(this.ctx); }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    this.storage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
  }

  play(name) {
    if (!VOICES[name]) return;
    this.log.push({ name, t: (performance.now() - this.epoch) / 1000 });
    if (!this.enabled || !this.ctx || this.ctx.state !== 'running') return;
    VOICES[name](this.ctx, this.out, this.ctx.currentTime + 0.005, Math.random);
  }

  keyFor(ch) {
    if (ch === ' ' || ch === '\n') return 'space';
    return 'key';
  }
}
