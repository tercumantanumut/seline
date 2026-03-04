interface ScopedCountingTelemetryInput {
  sessionId: string;
  provider?: string;
  legacyTokens: number;
  scopedTokens: number;
  legacyStatus: string;
  scopedStatus: string;
  fallbackUsed?: boolean;
  fallbackMinConfidence?: number;
}

function isTelemetryEnabled(): boolean {
  const raw = process.env.CONTEXT_SCOPED_LOG_SAMPLES;
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function logScopedCountingTelemetry(input: ScopedCountingTelemetryInput): void {
  const delta = input.scopedTokens - input.legacyTokens;
  if (!isTelemetryEnabled() && delta === 0 && input.legacyStatus === input.scopedStatus) {
    return;
  }

  console.log("[ContextWindowManager] scoped_counting", {
    sessionId: input.sessionId,
    provider: input.provider,
    legacyTokens: input.legacyTokens,
    scopedTokens: input.scopedTokens,
    delta,
    legacyStatus: input.legacyStatus,
    scopedStatus: input.scopedStatus,
    fallbackUsed: input.fallbackUsed ?? false,
    fallbackMinConfidence: input.fallbackMinConfidence,
  });
}
