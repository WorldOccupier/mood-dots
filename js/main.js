import { EmotionClassifier } from './classifier.js';
import { MoodEditor } from './editor.js';
import { ParticleField } from './particles.js';
import { Ambience } from './ambience.js';
import { Replayer } from './replay.js';
import { PosterExporter } from './poster.js';
import { LEGEND, ELSH } from './moods.js';
import { SoundEngine } from './sound.js';

const MODEL_ID = 'MicahB/emotion_text_classifier';
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const isLocalHost = ['localhost', '127.0.0.1'].includes(location.hostname);
// Local runs use the copy from scripts/fetch-model.sh so they work offline; deployed builds use the pinned CDN build.
const TRANSFORMERS_URL = isLocalHost ? '../vendor/transformers.js'
  : 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.js';
const transformers = await import(TRANSFORMERS_URL);
const classifier = new EmotionClassifier(transformers, MODEL_ID);
const sound = new SoundEngine();
const particles = new ParticleField($('particles'));
const ambience = new Ambience({ root: document.documentElement, ribbon: $('ribbon') });
const editor = new MoodEditor({
  textarea: $('input'), mirror: $('mirror'), classifier,
  onBurst: (x, y, color) => particles.burst(x, y, color),
  onChange: (states) => ambience.update(states),
  onConvert: (shape) => sound.play(shape),
});
const replayer = new Replayer(editor, { speed: Number(params.get('speed') || 1), onType: (ch) => sound.play(sound.keyFor(ch)) });
const poster = new PosterExporter();

$('legend').innerHTML = LEGEND.map(({ shape, moods }) =>
  `<li><span class="glyph" style="font-variation-settings:'ELSH' ${ELSH[shape]}">.</span>${moods}</li>`).join('');

classifier.ready.then(() => document.body.classList.add('model-ready'))
  .catch((err) => { $('status').textContent = 'Model failed to load'; console.error(err); });

// Audio may only start after a gesture; unlock on the first one.
['pointerdown', 'keydown'].forEach((type) => addEventListener(type, () => sound.unlock(), { capture: true }));

$('input').addEventListener('keydown', (event) => {
  if (event.isComposing || event.metaKey || event.ctrlKey) return;
  if (event.key === 'Backspace' || event.key === 'Delete') sound.play('backspace');
  else if (event.key.length === 1 || event.key === 'Enter') sound.play(sound.keyFor(event.key === 'Enter' ? '\n' : event.key));
});
$('input').addEventListener('input', () => replayer.stop(), { capture: true });

function renderSoundToggle() {
  $('sound').classList.toggle('on', sound.enabled);
  $('sound').setAttribute('aria-pressed', String(sound.enabled));
  $('sound').querySelector('.label').textContent = sound.enabled ? 'Sound on' : 'Sound off';
}
$('sound').addEventListener('click', () => { sound.setEnabled(!sound.enabled); renderSoundToggle(); sound.play('click'); });
renderSoundToggle();

document.querySelectorAll('.actions button').forEach((button) => button.addEventListener('click', () => sound.play('click')));
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

window.moodDots = { editor, classifier, replayer, poster, sound };
editor.setText(params.get('text') ?? 'I love this so much. This is absolutely infuriating. The meeting is at 3pm.');
$('input').focus();
