export type RewardComplexityBand = "small" | "medium" | "large" | "epic";

export interface RewardSuggestion {
  amountUsd: number;
  amountLabel: string;
  reasonLabel: string;
  complexityBand: RewardComplexityBand;
  inputChars: number;
  approxInputTokens: number;
}

export interface TaskRewardRecord {
  id: string;
  taskId: string;
  runId?: string;
  sessionId: string;
  userMessageId?: string;
  queryExcerpt: string;
  amountUsd: number;
  suggestedAmountUsd: number;
  baseAmountUsd: number;
  toolBonusUsd: number;
  tokenBonusUsd: number;
  completedAt: string;
  completionStatus: "completed";
  complexityBand: RewardComplexityBand;
  inputChars: number;
  approxInputTokens: number;
  totalTokens: number;
  toolCallCount: number;
  stepCount: number;
}

export interface CompletedRewardInput {
  sessionId: string;
  runId?: string;
  userMessageId?: string;
  promptText: string;
  totalTokens?: number;
  toolCallCount?: number;
  stepCount?: number;
  completedAt?: string;
}

const MIN_REWARDABLE_CHARS = 24;
const MAX_EXCERPT_LENGTH = 140;

export function estimatePromptTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

export function estimateTaskRewardSuggestion(promptText: string): RewardSuggestion | null {
  const normalized = normalizePromptText(promptText);
  if (normalized.length < MIN_REWARDABLE_CHARS) {
    return null;
  }

  const approxInputTokens = estimatePromptTokens(normalized);
  const complexity = getBaseRewardForTokens(approxInputTokens);

  return {
    amountUsd: complexity.amountUsd,
    amountLabel: formatUsdReward(complexity.amountUsd),
    reasonLabel: complexity.reasonLabel,
    complexityBand: complexity.band,
    inputChars: normalized.length,
    approxInputTokens,
  };
}

export function buildCompletedTaskReward(input: CompletedRewardInput): TaskRewardRecord | null {
  const suggestion = estimateTaskRewardSuggestion(input.promptText);
  if (!suggestion) {
    return null;
  }

  const toolCallCount = Math.max(0, input.toolCallCount ?? 0);
  const stepCount = Math.max(0, input.stepCount ?? 0);
  const totalTokens = Math.max(0, input.totalTokens ?? 0);
  const toolBonusUsd = Math.min(toolCallCount, 6) * 35;
  const tokenBonusUsd = getTokenBonusUsd(totalTokens);
  const amountUsd = suggestion.amountUsd + toolBonusUsd + tokenBonusUsd;
  const completedAt = input.completedAt ?? new Date().toISOString();

  return {
    id: input.runId ?? `reward-${completedAt}`,
    taskId: input.runId ?? `reward-${completedAt}`,
    runId: input.runId,
    sessionId: input.sessionId,
    userMessageId: input.userMessageId,
    queryExcerpt: createQueryExcerpt(input.promptText),
    amountUsd,
    suggestedAmountUsd: suggestion.amountUsd,
    baseAmountUsd: suggestion.amountUsd,
    toolBonusUsd,
    tokenBonusUsd,
    completedAt,
    completionStatus: "completed",
    complexityBand: suggestion.complexityBand,
    inputChars: suggestion.inputChars,
    approxInputTokens: suggestion.approxInputTokens,
    totalTokens,
    toolCallCount,
    stepCount,
  };
}

export function formatUsdReward(amountUsd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amountUsd);
}

export function createQueryExcerpt(promptText: string): string {
  const normalized = normalizePromptText(promptText);
  if (normalized.length <= MAX_EXCERPT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_EXCERPT_LENGTH - 1).trimEnd()}...`;
}

function normalizePromptText(promptText: string): string {
  return promptText.replace(/\s+/g, " ").trim();
}

function getBaseRewardForTokens(approxInputTokens: number): {
  amountUsd: number;
  band: RewardComplexityBand;
  reasonLabel: string;
} {
  if (approxInputTokens >= 700) {
    return { amountUsd: 360, band: "epic", reasonLabel: "Epic scope" };
  }
  if (approxInputTokens >= 360) {
    return { amountUsd: 240, band: "large", reasonLabel: "Large scope" };
  }
  if (approxInputTokens >= 180) {
    return { amountUsd: 150, band: "medium", reasonLabel: "Focused build" };
  }
  if (approxInputTokens >= 80) {
    return { amountUsd: 90, band: "medium", reasonLabel: "Solid task" };
  }
  return { amountUsd: 40, band: "small", reasonLabel: "Quick win" };
}

function getTokenBonusUsd(totalTokens: number): number {
  if (totalTokens >= 8000) {
    return 110;
  }
  if (totalTokens >= 4000) {
    return 60;
  }
  if (totalTokens >= 1500) {
    return 25;
  }
  return 0;
}
