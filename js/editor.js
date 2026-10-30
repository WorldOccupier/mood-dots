import { splitSentences, isDotChar, hasDots } from './sentences.js';
import { moodOf, elshOf } from './moods.js';

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const PULSE_MS = 1400;
const SWAP_MS = 260;          // dot shrink -> pop
const SNAP_AT_MS = SWAP_MS * 0.4; // axis snaps while the dots are smallest
const SETTLE_MS = 280;        // wait for the sentence to stop changing before classifying

// Transparent textarea for input and caret; a mirrored overlay renders each sentence with its own ELSH.
export class MoodEditor {
  constructor({ textarea, mirror, classifier, onBurst, onChange }) {
    Object.assign(this, { textarea, mirror, classifier, onBurst, onChange });
    this.states = [];
    textarea.addEventListener('input', () => this.refresh());
    textarea.addEventListener('scroll', () => { mirror.scrollTop = textarea.scrollTop; });
    textarea.addEventListener('mousemove', (e) => this.hover(e));
    textarea.addEventListener('mouseleave', () => this.hover(null));
  }

  setText(text) { this.textarea.value = text; this.refresh(); }

  refresh() {
    const sentences = splitSentences(this.textarea.value);
    this.states = sentences.map((s, i) => this.stateFor(s, this.states[i]));
    this.render();
    this.states.forEach((state) => state.finished && this.scheduleClassify(state));
    this.onChange?.(this.states);
  }

  stateFor(sentence, previous) {
    const state = previous || { label: 'pending', shownElsh: elshOf('pending'), pulseAt: -1e9 };
    if (previous && previous.clean !== sentence.clean) clearTimeout(state.settleTimer);
    return Object.assign(state, sentence);
  }

  scheduleClassify(state) {
    if (state.classifiedText === state.clean || state.pendingText === state.clean) return;
    state.pendingText = state.clean;
    clearTimeout(state.settleTimer);
    state.settleTimer = setTimeout(() => this.classifyState(state), SETTLE_MS);
  }

  async classifyState(state) {
    const text = state.clean;
    const { label, score } = await this.classifier.classify(text);
    if (state.clean !== text || !this.states.includes(state)) return; // stale result
    state.classifiedText = text; state.pendingText = null;
    if (state.label === label) return;
    Object.assign(state, { label, score, pulseAt: performance.now() });
    this.render();
    setTimeout(() => this.snapAxis(state, elshOf(label)), SNAP_AT_MS);
    this.onChange?.(this.states);
  }

  // The ELSH axis is never interpolated: in-between values are other shapes.
  snapAxis(state, elsh) {
    state.shownElsh = elsh;
    this.applyAxis(state);
    this.emitBurst(state);
  }

  render() {
    this.mirror.innerHTML = this.states.map((s, i) => this.sentenceHtml(s, i)).join('') + '\u200b';
    this.states.forEach((s, i) => { s.el = this.mirror.children[i]; });
  }

  sentenceHtml(state, index) {
    const glyphs = [...state.raw].map((ch) => {
      if (isDotChar(ch)) return `<b class="dot">${escapeHtml(ch)}</b>`;
      if (hasDots(ch)) return `<i class="ij">${ch}</i>`;
      return escapeHtml(ch);
    }).join('');
    const elapsed = performance.now() - state.pulseAt;
    const pulse = (elapsed < PULSE_MS ? ' pulse' : '') + (elapsed < SWAP_MS ? ' swap' : '');
    const style = `--mood:${moodOf(state.label).hue};--pulse-delay:-${Math.round(elapsed)}ms;font-variation-settings:'ELSH' ${state.shownElsh}`;
    return `<span class="sentence${pulse}" data-i="${index}" style="${style}">${glyphs}</span>`;
  }

  applyAxis(state) {
    if (state.el) state.el.style.fontVariationSettings = `"ELSH" ${state.shownElsh}`;
  }

  emitBurst(state) {
    if (!state.el) return;
    const color = moodOf(state.label).hue;
    state.el.querySelectorAll('.dot, .ij').forEach((glyph) => {
      const r = glyph.getBoundingClientRect();
      const y = glyph.classList.contains('dot') ? r.top + r.height * 0.72 : r.top + r.height * 0.3;
      this.onBurst(r.left + r.width / 2, y, color);
    });
  }

  hover(event) {
    const tip = document.getElementById('tip');
    const hit = event && document.elementsFromPoint(event.clientX, event.clientY).find((el) => el.classList?.contains('sentence'));
    const state = hit && this.states[hit.dataset.i];
    if (!state || state.label === 'pending') { tip.classList.remove('on'); return; }
    tip.textContent = `${state.label} · ${Math.round(state.score * 100)}%`;
    tip.style.setProperty('--mood', moodOf(state.label).hue);
    tip.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 18}px)`;
    tip.classList.add('on');
  }
}
