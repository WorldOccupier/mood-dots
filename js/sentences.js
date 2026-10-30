const SENTENCE_PATTERN = /[^.!?]*[.!?]+["'”’)\]]*\s*|[^.!?]+$/g;
const DOT_CHARS = /[.,:;!?]/;

export function splitSentences(text) {
  const sentences = [];
  let match;
  SENTENCE_PATTERN.lastIndex = 0;
  while ((match = SENTENCE_PATTERN.exec(text)) && match[0].length) {
    const raw = match[0];
    sentences.push({ raw, clean: raw.trim(), finished: /[.!?]["'”’)\]]*\s*$/.test(raw) });
  }
  return sentences;
}

export const isDotChar = (ch) => DOT_CHARS.test(ch);
export const hasDots = (ch) => /[ij.,:;!?]/.test(ch);
