// Loads tokenizer + ONNX model from ./models and classifies sentences, with a per-sentence cache.
// (The pipeline() helper skips the tokenizer for local-only models in transformers.js 4.x, so we wire it directly.)
export class EmotionClassifier {
  constructor(transformers, modelId) {
    this.transformers = transformers;
    this.modelId = modelId;
    this.cache = new Map();
    this.ready = this.load();
  }

  async load() {
    const { env, AutoTokenizer, AutoModelForSequenceClassification } = this.transformers;
    const useLocal = this.prefersLocalModel();
    env.allowRemoteModels = !useLocal;
    env.allowLocalModels = useLocal;
    // A path, not a full URL: transformers.js 4.x skips local file checks for http(s) URLs.
    env.localModelPath = new URL('../models/', import.meta.url).pathname;
    env.backends.onnx.wasm.wasmPaths = new URL('../vendor/ort/', import.meta.url).href;
    env.backends.onnx.wasm.numThreads = 1;
    [this.tokenizer, this.model] = await Promise.all([
      AutoTokenizer.from_pretrained(this.modelId),
      AutoModelForSequenceClassification.from_pretrained(this.modelId, { dtype: 'q8', device: 'wasm' }),
    ]);
  }

  // Local dev serves ./models (see scripts/fetch-model.sh); deployed builds pull from the Hugging Face hub
  // once and the browser caches it. Override with ?model=local or ?model=hub.
  prefersLocalModel() {
    const choice = new URLSearchParams(location.search).get('model');
    if (choice) return choice === 'local';
    return ['localhost', '127.0.0.1'].includes(location.hostname);
  }

  async run(sentence) {
    await this.ready;
    const { logits } = await this.model(this.tokenizer(sentence));
    const values = Array.from(logits.data), max = Math.max(...values);
    const exps = values.map((v) => Math.exp(v - max)), total = exps.reduce((a, b) => a + b, 0);
    const best = exps.indexOf(Math.max(...exps));
    return { label: this.model.config.id2label[best], score: exps[best] / total };
  }

  classify(sentence) {
    if (!this.cache.has(sentence)) this.cache.set(sentence, this.run(sentence));
    return this.cache.get(sentence);
  }
}
