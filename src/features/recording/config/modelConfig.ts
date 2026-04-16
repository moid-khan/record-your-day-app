// Centralized model names/paths so the bundle + native lookups stay consistent.
// Add your actual model files under `assets/` and update these constants as needed.

export const HAND_MODEL_NAME = 'hand-model.tflite';
export const HAND_MODEL_ASSET_PATH = `assets/models/${HAND_MODEL_NAME}`; // Add to metro assetExts (tflite already added).

export const VOSK_MODEL_DIR = 'model-small-en-us'; // Place folder directly under /assets and add to iOS Copy Bundle Resources.
