/**
 * MiniMax Model Definitions
 *
 * MiniMax is a Chinese AI provider with an OpenAI-compatible API.
 * MiniMax-M2.1 is their flagship model with 80K context and strong
 * multilingual capabilities.
 *
 * API: OpenAI-compatible at https://api.minimax.chat/v1
 */

export const MINIMAX_MODEL_IDS = [
  // M2.1 generation (current flagship, 80K context)
  "MiniMax-M2.1",
  "MiniMax-M2.1-lightning",

  // M2 generation (standard)
  "MiniMax-M2",
] as const;

export type MiniMaxModelId = (typeof MINIMAX_MODEL_IDS)[number];

// Default models for different roles
export const MINIMAX_DEFAULT_MODELS = {
  chat: "MiniMax-M2.1" as MiniMaxModelId,
  utility: "MiniMax-M2.1-lightning" as MiniMaxModelId,
};

// MiniMax API configuration
export const MINIMAX_CONFIG = {
  BASE_URL: "https://api.minimax.chat/v1",
} as const;

// Model display names
const MODEL_LABELS: Record<string, string> = {
  "MiniMax-M2.1": "MiniMax M2.1",
  "MiniMax-M2.1-lightning": "MiniMax M2.1 Lightning",
  "MiniMax-M2": "MiniMax M2",
};

/**
 * Get display name for a MiniMax model
 */
export function getMiniMaxModelDisplayName(modelId: string): string {
  return MODEL_LABELS[modelId] || modelId;
}

/**
 * Get all MiniMax models with display names
 */
export function getMiniMaxModels(): Array<{ id: MiniMaxModelId; name: string }> {
  return MINIMAX_MODEL_IDS.map((id) => ({
    id,
    name: getMiniMaxModelDisplayName(id),
  }));
}
