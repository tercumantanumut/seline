export const CLAUDECODE_MODEL_IDS = [
  "claude-opus-4-6-thinking",
  "claude-sonnet-4-5-20250929",
  "claude-haiku-4-5-20251001",
] as const;

export type ClaudeCodeModelId = (typeof CLAUDECODE_MODEL_IDS)[number];

const MODEL_LABELS: Record<string, string> = {
  "claude-opus-4-6-thinking": "Claude Opus 4.6 (Thinking)",
  "claude-sonnet-4-5-20250929": "Claude Sonnet 4.5",
  "claude-haiku-4-5-20251001": "Claude Haiku 4.5",
};

export function getClaudeCodeModelDisplayName(modelId: string): string {
  return MODEL_LABELS[modelId] || modelId;
}

export function getClaudeCodeModels(): Array<{ id: ClaudeCodeModelId; name: string }> {
  return CLAUDECODE_MODEL_IDS.map((id) => ({
    id,
    name: getClaudeCodeModelDisplayName(id),
  }));
}
