/**
 * streaming-progress.ts
 *
 * Factory for the `syncStreamingMessage` function used inside the POST handler.
 * This function persists the current streaming state to the database and emits
 * progress events to the background-task registry.
 */

import { createMessage, updateMessage } from "@/lib/db/queries";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { limitProgressContent } from "@/lib/background-tasks/progress-content-limiter";
import { nextOrderingIndex } from "@/lib/session/message-ordering";
import { nowISO } from "@/lib/utils/timestamp";
import type { DBContentPart } from "@/lib/messages/converter";
import {
  type StreamingMessageState,
  cloneContentParts,
  buildProgressSignature,
  extractTextFromParts,
} from "./streaming-state";

// Feature-flagged safety projection for task progress SSE payloads.
const ENABLE_PROGRESS_CONTENT_LIMITER =
  process.env.ENABLE_PROGRESS_CONTENT_LIMITER === "true";

export interface SyncStreamingMessageContext {
  sessionId: string;
  userId: string;
  eventCharacterId: string;
  scheduledRunId: string | null;
  scheduledTaskId: string | null;
  scheduledTaskName: string | null;
  /** Reference to the current agentRun — may be set after factory is called. */
  getAgentRunId: () => string | undefined;
  streamingState: StreamingMessageState;
}

/**
 * Creates the `syncStreamingMessage(force?)` function.
 * The returned function is self-referencing (for deferred setTimeout calls),
 * so the factory returns the function directly rather than via an object.
 */
export function createSyncStreamingMessage(
  ctx: SyncStreamingMessageContext
): (force?: boolean) => Promise<void> {
  const {
    sessionId,
    userId,
    eventCharacterId,
    scheduledRunId,
    scheduledTaskId,
    scheduledTaskName,
    getAgentRunId,
    streamingState,
  } = ctx;

  const syncStreamingMessage = async (force = false): Promise<void> => {
    if (streamingState.parts.length === 0) return;

    let filteredParts = streamingState.parts.filter((part) => {
      if (part.type === "tool-call") {
        const hasCompleteArgs = part.args !== undefined;
        const isStillStreaming = part.state === "input-streaming";
        if (isStillStreaming && !hasCompleteArgs) {
          const logKey = `${part.toolCallId}:${part.toolName ?? "tool"}`;
          if (!streamingState.loggedIncompleteToolCalls.has(logKey)) {
            streamingState.loggedIncompleteToolCalls.add(logKey);
            console.log(
              `[CHAT API] Filtering incomplete tool call ${part.toolCallId} (${part.toolName}) ` +
                `from streaming persistence - state: ${part.state}, has args: ${hasCompleteArgs}`
            );
          }
          return false;
        }
        if (!hasCompleteArgs && part.argsText) {
          try {
            JSON.parse(part.argsText);
          } catch {
            const logKey = `malformed:${part.toolCallId}:${part.toolName ?? "tool"}`;
            if (!streamingState.loggedIncompleteToolCalls.has(logKey)) {
              streamingState.loggedIncompleteToolCalls.add(logKey);
              console.warn(
                `[CHAT API] Filtering tool call with malformed argsText from persistence: ` +
                  `${part.toolName} (${part.toolCallId}), argsText length: ${part.argsText.length}, ` +
                  `preview: ${part.argsText.substring(0, 120)}...`
              );
            }
            return false;
          }
        }
      }
      return true;
    });

    if (filteredParts.length === 0 && streamingState.parts.length > 0) {
      filteredParts = [{ type: "text", text: "Working..." }];
    }

    const now = Date.now();
    const signature = buildProgressSignature(filteredParts);
    if (signature === streamingState.lastBroadcastSignature) return;

    if (!force) {
      const timeSinceLastBroadcast = now - streamingState.lastBroadcastAt;
      const hasToolChanges = filteredParts.some(
        (part) => part.type === "tool-call" || part.type === "tool-result"
      );
      const throttleInterval = hasToolChanges ? 400 : 200;
      if (timeSinceLastBroadcast < throttleInterval) {
        if (!streamingState.pendingBroadcast) {
          streamingState.pendingBroadcast = true;
          setTimeout(() => {
            if (streamingState.pendingBroadcast) {
              streamingState.pendingBroadcast = false;
              void syncStreamingMessage();
            }
          }, throttleInterval - timeSinceLastBroadcast);
        }
        return;
      }
    }

    streamingState.pendingBroadcast = false;
    const partsSnapshot = cloneContentParts(filteredParts);

    if (!streamingState.messageId) {
      if (streamingState.isCreating) return;
      streamingState.isCreating = true;
      try {
        const assistantMessageIndex = await nextOrderingIndex(sessionId);
        const created = await createMessage({
          sessionId,
          role: "assistant",
          content: partsSnapshot,
          orderingIndex: assistantMessageIndex,
          metadata: { isStreaming: true, scheduledRunId, scheduledTaskId },
        });
        streamingState.messageId = created?.id;
      } finally {
        streamingState.isCreating = false;
      }
    } else {
      await updateMessage(streamingState.messageId, { content: partsSnapshot });
    }

    if (streamingState.messageId) {
      streamingState.lastBroadcastSignature = signature;
      streamingState.lastBroadcastAt = now;
      let progressText = extractTextFromParts(partsSnapshot);
      if (!progressText) {
        for (let index = streamingState.parts.length - 1; index >= 0; index -= 1) {
          const part = streamingState.parts[index];
          if (part?.type === "tool-call") {
            progressText = `Running ${part.toolName || "tool"}...`;
            break;
          }
        }
      }
      if (!progressText) progressText = "Working...";

      const agentRunId = getAgentRunId();
      const progressRunId = scheduledRunId ?? agentRunId;
      const progressType = scheduledRunId ? "scheduled" : agentRunId ? "chat" : undefined;
      const assistantMessageId = streamingState.messageId;

      console.log("[CHAT API] Progress event routing:", {
        scheduledRunId,
        agentRunId,
        progressRunId,
        progressType,
        assistantMessageId,
        progressText: progressText.slice(0, 50),
        willEmitToRegistry: Boolean(progressRunId && progressType),
      });

      if (progressRunId && progressType) {
        const progressLimit = ENABLE_PROGRESS_CONTENT_LIMITER
          ? limitProgressContent(partsSnapshot)
          : null;
        if (progressLimit?.wasTruncated) {
          console.log(
            `[CHAT API] Progress content truncated: ` +
              `~${progressLimit.originalTokens.toLocaleString()} -> ~${progressLimit.finalTokens.toLocaleString()} tokens` +
              (progressLimit.hardCapped ? " (hard cap summary applied)" : "")
          );
        }
        taskRegistry.emitProgress(progressRunId, progressText, undefined, {
          type: progressType,
          taskId: scheduledTaskId ?? undefined,
          taskName: scheduledTaskName ?? undefined,
          userId,
          characterId: eventCharacterId,
          sessionId,
          assistantMessageId,
          progressContent: (progressLimit?.content ?? partsSnapshot) as DBContentPart[],
          progressContentLimited: progressLimit?.wasTruncated,
          progressContentOriginalTokens: progressLimit?.originalTokens,
          progressContentFinalTokens: progressLimit?.finalTokens,
          progressContentTruncatedParts: progressLimit?.truncatedParts,
          progressContentProjectionOnly: progressLimit ? true : undefined,
          startedAt: nowISO(),
        });
      }
    }
  };

  return syncStreamingMessage;
}
