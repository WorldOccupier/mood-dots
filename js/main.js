import { EmotionClassifier } from './classifier.js';
import { MoodEditor } from './editor.js';
import { ParticleField } from './particles.js';
import { Ambience } from './ambience.js';
import { Replayer } from './replay.js';
import { PosterExporter } from './poster.js';
import { LEGEND, ELSH } from './moods.js';

const MODEL_ID = 'MicahB/emotion_text_classifier';
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
// Local runs use the copy from scripts/fetch-model.sh so they work offline; deployed builds use the pinned CDN build.
const TRANSFORMERS_URL = isLocalHost ? '../vendor/transformers.js'
  : 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.js';
const transformers = await import(TRANSFORMERS_URL);
const classifier = new EmotionClassifier(transformers, MODEL_ID);
const particles = new ParticleField($('particles'));
const ambience = new Ambience({ root: document.documentElement, ribbon: $('ribbon') });
const editor = new MoodEditor({
  textarea: $('input'), mirror: $('mirror'), classifier,
  onBurst: (x, y, color) => particles.burst(x, y, color),
  onChange: (states) => ambience.update(states),
});
const replayer = new Replayer(editor, { speed: Number(params.get('speed') || 1) });
const poster = new PosterExporter();

$('legend').innerHTML = LEGEND.map(({ shape, moods }) =>
  `<li><span class="glyph" style="font-variation-settings:'ELSH' ${ELSH[shape]}">.</span>${moods}</li>`).join('');

classifier.ready.then(() => document.body.classList.add('model-ready'))
  .catch((err) => { $('status').textContent = 'Model failed to load'; console.error(err); });

$('replay').addEventListener('click', () => replayer.play());
$('export').addEventListener('click', async () => {
  const canvas = await poster.export(editor.states);
  const link = Object.assign(document.createElement('a'), { download: 'mood-dots-poster.png', href: canvas.toDataURL('image/png') });
  link.click();
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  particles.step(dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.moodDots = { editor, classifier, replayer, poster };
editor.setText(params.get('text') ?? 'I love this so much. This is absolutely infuriating. The meeting is at 3pm.');
$('input').focus();
