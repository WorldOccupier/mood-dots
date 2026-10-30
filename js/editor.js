import { splitSentences, isDotChar, hasDots } from './sentences.js';
import { moodOf, elshOf } from './moods.js';

const escapeHtml = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const glyphHtml = (ch) => {
  if (isDotChar(ch)) return `<b class="dot">${escapeHtml(ch)}</b>`;
  if (hasDots(ch)) return `<i class="ij">${ch}</i>`;
  return escapeHtml(ch);
};
const PULSE_MS = 1400;
const SWAP_MS = 260;          // dot shrink -> pop
const SNAP_AT_MS = SWAP_MS * 0.4; // axis snaps while the dots are smallest
const SETTLE_MS = 280;        // wait for the sentence to stop changing before classifying

// Transparent textarea for input and caret; a mirrored overlay renders each sentence with its own ELSH.
export class MoodEditor {
  constructor({ textarea, mirror, classifier, onBurst, onChange, onConvert }) {
    Object.assign(this, { textarea, mirror, classifier, onBurst, onChange, onConvert });
    this.states = [];
    textarea.addEventListener('input', () => this.refresh());
    textarea.addEventListener('scroll', () => { mirror.scrollTop = textarea.scrollTop; });
    textarea.addEventListener('mousemove', (e) => this.hover(e));
    textarea.addEventListener('mouseleave', () => this.hover(null));
  }

  setText(text) { this.textarea.value = text; this.refresh(); }

  // Programmatic edits don't scroll the textarea, so follow the end of the text by hand.
  scrollToEnd() {
    this.textarea.scrollTop = this.textarea.scrollHeight;
    this.mirror.scrollTop = this.textarea.scrollTop;
  }

  refresh() {
    const sentences = splitSentences(this.textarea.value);
    this.states = this.matchStates(sentences);
    this.render();
    this.states.forEach((state) => state.finished && this.scheduleClassify(state));
    this.onChange?.(this.states);
  }

  // Reuse a state with identical text first (so deleting a sentence doesn't hand its shape to the next one),
  // then the unclaimed state at the same position (so editing a sentence keeps its shape until reclassified).
  matchStates(sentences) {
    const unclaimed = new Set(this.states);
    const byText = sentences.map((s) => {
      const match = [...unclaimed].find((state) => state.clean === s.clean && state.finished === s.finished);
      if (match) unclaimed.delete(match);
      return match;
    });
    return sentences.map((sentence, i) => {
      let previous = byText[i];
      if (!previous && unclaimed.has(this.states[i])) { previous = this.states[i]; unclaimed.delete(previous); }
      return this.stateFor(sentence, previous);
    });
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
    const elsh = elshOf(label);
    this.onConvert?.(moodOf(label).shape); // round sentences still "land" with a sound and pulse
    setTimeout(() => this.snapAxis(state, elsh), SNAP_AT_MS);
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
    this.mirror.scrollTop = this.textarea.scrollTop;
    this.states.forEach((s, i) => { s.el = this.mirror.children[i]; });
  }

  sentenceHtml(state, index) {
    // Words are nowrap groups: an inline-block .dot would otherwise let the line break before punctuation,
    // and the mirror would wrap differently from the textarea underneath.
    const glyphs = state.raw.split(/(\s+)/).map((token) => /^\s*$/.test(token) ? escapeHtml(token)
      : `<span class="w">${[...token].map(glyphHtml).join('')}</span>`).join('');
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
    // The mirror has pointer-events: none, so hit-test its line boxes by hand.
    const state = event && this.states.find((s) => s.el && [...s.el.getClientRects()].some((r) =>
      event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom));
    if (!state || state.label === 'pending') { tip.classList.remove('on'); return; }
    tip.textContent = `${state.label} · ${Math.round(state.score * 100)}%`;
    tip.style.setProperty('--mood', moodOf(state.label).hue);
    tip.style.transform = `translate(${event.clientX + 14}px, ${event.clientY + 18}px)`;
    tip.classList.add('on');
  }
}
