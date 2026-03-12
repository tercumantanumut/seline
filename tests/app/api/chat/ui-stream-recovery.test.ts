import { describe, expect, it } from "vitest";

import {
  hasPersistedStreamingProgress,
  isUiChunkCommittable,
  shouldAttemptPrecommitRecovery,
} from "@/app/api/chat/ui-stream-recovery";

describe("ui-stream-recovery helpers", () => {
  it("treats only non-visible setup chunks as non-committing", () => {
    expect(isUiChunkCommittable({ type: "start" } as any)).toBe(false);
    expect(isUiChunkCommittable({ type: "text-start", id: "t1" } as any)).toBe(false);
    expect(isUiChunkCommittable({ type: "message-metadata", messageMetadata: {} } as any)).toBe(false);
    expect(isUiChunkCommittable({ type: "text-delta", id: "t1", delta: "hello" } as any)).toBe(true);
    expect(isUiChunkCommittable({ type: "tool-input-start", toolCallId: "c1", toolName: "searchTools" } as any)).toBe(true);
  });

  it("only treats a persisted assistant message id as committed DB progress", () => {
    expect(hasPersistedStreamingProgress(undefined)).toBe(false);
    expect(hasPersistedStreamingProgress({ messageId: undefined, parts: [] } as any)).toBe(false);
    expect(hasPersistedStreamingProgress({ messageId: undefined, parts: [{ type: "text", text: "buffered only" }] } as any)).toBe(false);
    expect(hasPersistedStreamingProgress({ messageId: "assistant-1", parts: [] } as any)).toBe(true);
  });

  it("retries recoverable pre-commit failures before anything is committed", () => {
    const decision = shouldAttemptPrecommitRecovery({
      provider: "codex",
      errorMessage: "server_error: stream interrupted",
      attempt: 0,
      maxAttempts: 2,
      aborted: false,
      clientCommitted: false,
      streamingState: { messageId: undefined, parts: [] } as any,
    });

    expect(decision.classification.recoverable).toBe(true);
    expect(decision.retry).toBe(true);
  });

  it("does not retry once client-visible or persisted progress exists", () => {
    expect(
      shouldAttemptPrecommitRecovery({
        provider: "codex",
        errorMessage: "server_error: stream interrupted",
        attempt: 0,
        maxAttempts: 2,
        aborted: false,
        clientCommitted: true,
        streamingState: { messageId: undefined, parts: [] } as any,
      }).retry,
    ).toBe(false);

    expect(
      shouldAttemptPrecommitRecovery({
        provider: "codex",
        errorMessage: "server_error: stream interrupted",
        attempt: 0,
        maxAttempts: 2,
        aborted: false,
        clientCommitted: false,
        streamingState: { messageId: "assistant-1", parts: [] } as any,
      }).retry,
    ).toBe(false);
  });
});
