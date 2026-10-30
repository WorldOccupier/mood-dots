// ELSH axis values read from GeistSerifVF.woff2 fvar instances (fonttools).
export const ELSH = { round: 0, square: 25, triangle: 50, heart: 100 };

export const MOODS = {
  joy:      { shape: 'heart',    hue: '#f2a7b5', label: 'joy' },
  anger:    { shape: 'triangle', hue: '#ff6b4a', label: 'anger' },
  disgust:  { shape: 'triangle', hue: '#c9d46a', label: 'disgust' },
  neutral:  { shape: 'square',   hue: '#cfc8b8', label: 'neutral' },
  sadness:  { shape: 'round',    hue: '#8fa8d8', label: 'sadness' },
  fear:     { shape: 'round',    hue: '#b49be0', label: 'fear' },
  surprise: { shape: 'round',    hue: '#7fd6c2', label: 'surprise' },
  pending:  { shape: 'round',    hue: '#efe8d8', label: '…' },
};

export const LEGEND = [
  { shape: 'heart', moods: 'joy, love' },
  { shape: 'triangle', moods: 'anger, disgust' },
  { shape: 'square', moods: 'neutral' },
  { shape: 'round', moods: 'sad, fear, surprise' },
];

export const moodOf = (label) => MOODS[label] || MOODS.pending;
export const elshOf = (label) => ELSH[moodOf(label).shape];
