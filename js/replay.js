// Retypes the current text at a human pace: quick letters, pauses after words and sentences.
export class Replayer {
  constructor(editor, { speed = 1, onType } = {}) { Object.assign(this, { editor, speed, onType }); this.token = 0; }

  stop() { this.token++; }

  delayFor(ch) {
    const jitter = 0.6 + Math.random() * 0.8;
    if (/[.!?]/.test(ch)) return 520 * jitter;
    if (/[,;:]/.test(ch)) return 220 * jitter;
    if (ch === ' ') return 75 * jitter;
    return 42 * jitter;
  }

  async play(text = this.editor.textarea.value) {
    const token = ++this.token;
    this.editor.setText('');
    for (const ch of text) {
      if (token !== this.token) return;
      this.editor.textarea.value += ch;
      this.onType?.(ch);
      this.editor.refresh();
      this.editor.scrollToEnd();
      await new Promise((r) => setTimeout(r, this.delayFor(ch) / this.speed));
    }
  }
}
