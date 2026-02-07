/**
 * Whisper.cpp Model Registry
 *
 * Central source of truth for local whisper.cpp STT model metadata.
 * Follows the same pattern as embedding-models.ts.
 *
 * Models are GGML-format weights hosted on HuggingFace (ggerganov/whisper.cpp).
 * The Electron model:download IPC handles fetching; this registry provides
 * the metadata the UI and transcription layer need.
 */

export interface WhisperModelInfo {
  /** Model identifier used in settings and Electron IPC (e.g., "ggml-tiny.en") */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Approximate download size */
  size: string;
  /** Language scope */
  language: "en" | "multilingual";
  /** Short description for UI */
  description: string;
  /** Whether this is the recommended default */
  recommended?: boolean;
  /** HuggingFace repository */
  hfRepo: string;
  /** Filename within the HF repo */
  hfFile: string;
}

/**
 * Available whisper.cpp models, ordered from smallest to largest.
 *
 * English-only models are faster and more accurate for English audio.
 * Multilingual models support ~99 languages but are slightly slower.
 */
export const WHISPER_MODELS: WhisperModelInfo[] = [
  {
    id: "ggml-tiny.en",
    name: "Tiny (English)",
    size: "~75 MB",
    language: "en",
    description: "Fastest, good for short voice notes",
    recommended: true,
    hfRepo: "ggerganov/whisper.cpp",
    hfFile: "ggml-tiny.en.bin",
  },
  {
    id: "ggml-tiny",
    name: "Tiny (Multilingual)",
    size: "~75 MB",
    language: "multilingual",
    description: "Fastest multilingual model, ~99 languages",
    hfRepo: "ggerganov/whisper.cpp",
    hfFile: "ggml-tiny.bin",
  },
  {
    id: "ggml-base.en",
    name: "Base (English)",
    size: "~142 MB",
    language: "en",
    description: "Good balance of speed and accuracy",
    hfRepo: "ggerganov/whisper.cpp",
    hfFile: "ggml-base.en.bin",
  },
  {
    id: "ggml-base",
    name: "Base (Multilingual)",
    size: "~142 MB",
    language: "multilingual",
    description: "Good multilingual accuracy",
    hfRepo: "ggerganov/whisper.cpp",
    hfFile: "ggml-base.bin",
  },
  {
    id: "ggml-small.en",
    name: "Small (English)",
    size: "~466 MB",
    language: "en",
    description: "High accuracy, slower on CPU",
    hfRepo: "ggerganov/whisper.cpp",
    hfFile: "ggml-small.en.bin",
  },
  {
    id: "ggml-small",
    name: "Small (Multilingual)",
    size: "~466 MB",
    language: "multilingual",
    description: "High multilingual accuracy",
    hfRepo: "ggerganov/whisper.cpp",
    hfFile: "ggml-small.bin",
  },
];

/** Default model ID when local STT is first enabled */
export const DEFAULT_WHISPER_MODEL = "ggml-tiny.en";

/**
 * Look up a whisper model by ID.
 * Returns undefined if the ID is not in the registry.
 */
export function getWhisperModel(id: string): WhisperModelInfo | undefined {
  return WHISPER_MODELS.find((m) => m.id === id);
}
