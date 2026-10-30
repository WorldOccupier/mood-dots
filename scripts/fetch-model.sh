#!/usr/bin/env sh
# Downloads the emotion model and transformers.js so the app works offline on localhost.
set -e
cd "$(dirname "$0")/.."
REPO=MicahB/emotion_text_classifier
DEST=models/$REPO
mkdir -p "$DEST/onnx"
for f in config.json tokenizer.json tokenizer_config.json special_tokens_map.json onnx/model_quantized.onnx; do
  curl -fsSL -o "$DEST/$f" "https://huggingface.co/$REPO/resolve/main/$f"
done
echo "Model saved to $DEST"
curl -fsSL -o vendor/transformers.js https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.js
echo "transformers.js saved to vendor/transformers.js"
