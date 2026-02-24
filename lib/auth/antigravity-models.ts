export const ANTIGRAVITY_MODEL_IDS = [
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-low",
  "gemini-3-flash",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
] as const;

export type AntigravityModelId = (typeof ANTIGRAVITY_MODEL_IDS)[number];

const ANTIGRAVITY_MODEL_LABELS: Record<AntigravityModelId, string> = {
  "gemini-3.1-pro-high": "Gemini 3.1 Pro (High)",
  "gemini-3.1-pro-low": "Gemini 3.1 Pro (Low)",
  "gemini-3-flash": "Gemini 3 Flash",
  "claude-sonnet-4-6": "Claude Sonnet 4.6",
  "claude-opus-4-6-thinking": "Claude Opus 4.6 (Thinking)",
  "gpt-oss-120b-medium": "GPT-OSS 120B (Medium)",
};

export function getAntigravityModelDisplayName(modelId: AntigravityModelId): string {
  return ANTIGRAVITY_MODEL_LABELS[modelId] || modelId;
}

export function getAntigravityModels(): Array<{ id: AntigravityModelId; name: string }> {
  return ANTIGRAVITY_MODEL_IDS.map((id) => ({
    id,
    name: getAntigravityModelDisplayName(id),
  }));
}
