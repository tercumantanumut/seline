import type { DBContentPart, DBToolCallPart, DBToolResultPart } from "@/lib/messages/converter";
import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";
import { attemptJsonRepair } from "./tool-call-utils";

/**
 * Hard cap on accumulated argsText per tool call (100KB).
 * Prevents unbounded memory growth when models produce runaway/repeated
 * content in tool-call arguments (e.g. duplicated test blocks in editFile).
 * Lowered from 512KB — legitimate tool calls rarely exceed 50KB of JSON args,
 * and catching runaway streams earlier prevents downstream cascading failures
 * (e.g. degenerate values causing bloated tool results → socket errors).
 */
export const MAX_ARGS_TEXT_BYTES = 100_000;

/** Max chars of argsText to include in console warnings to prevent log flooding. */
const LOG_ARGS_TEXT_PREVIEW_CHARS = 500;

export interface StreamingMessageState {
  parts: DBContentPart[];
  toolCallParts: Map<string, DBToolCallPart>;
  loggedIncompleteToolCalls: Set<string>;
  messageId?: string;
  isCreating?: boolean;
  lastBroadcastAt: number;
  lastBroadcastSignature: string;
  pendingBroadcast?: boolean;
  /**
   * Set when a live prompt injection splits the streaming message mid-run.
   * Points to the step index (0-based) at which the split occurred.
   * onFinish uses this to only persist post-injection steps to the new message.
   */
  stepOffset?: number;
}

export function cloneContentParts(parts: DBContentPart[]): DBContentPart[] {
  if (typeof structuredClone === "function") {
    return structuredClone(parts);
  }
  return JSON.parse(JSON.stringify(parts));
}

export function buildProgressSignature(parts: DBContentPart[]): string {
  return parts.map((part) => {
    if (part.type === "text") {
      return `t:${part.text.length}:${part.text.slice(0, 100)}`;
    }

    if (part.type === "tool-call") {
      return `tc:${part.toolCallId}:${part.state ?? ""}`;
    }

    if (part.type === "tool-result") {
      const preview =
        typeof part.result === "string"
          ? `s:${part.result.length}:${part.result.slice(0, 120)}`
          : part.result && typeof part.result === "object"
            ? (() => {
                const entries = Object.entries(part.result as Record<string, unknown>)
                  .slice(0, 5)
                  .map(([key, value]) => {
                    if (typeof value === "string") return `${key}:${value.length}:${value.slice(0, 60)}`;
                    if (typeof value === "number" || typeof value === "boolean") return `${key}:${value}`;
                    if (Array.isArray(value)) return `${key}:arr${value.length}`;
                    return `${key}:${typeof value}`;
                  })
                  .join(",");
                return `o:${Object.keys(part.result as Record<string, unknown>).length}:${entries}`;
              })()
            : `p:${typeof part.result}`;
      return `tr:${part.toolCallId}:${part.state ?? ""}:${preview}`;
    }

    return `o:${part.type}`;
  }).join("|");
}

export function extractTextFromParts(parts: DBContentPart[]): string {
  return parts
    .filter((part): part is Extract<DBContentPart, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function appendTextPartToState(state: StreamingMessageState, delta: string | undefined): boolean {
  if (!delta) {
    return false;
  }
  const lastPart = state.parts[state.parts.length - 1];
  if (lastPart?.type === "text") {
    lastPart.text += delta;
  } else {
    state.parts.push({ type: "text", text: delta });
  }
  return true;
}

export function ensureToolCallPart(state: StreamingMessageState, toolCallId: string, toolName?: string): DBToolCallPart {
  let part = state.toolCallParts.get(toolCallId);
  if (!part) {
    part = {
      type: "tool-call",
      toolCallId,
      toolName: toolName ?? "tool",
      state: "input-streaming",
    };
    state.toolCallParts.set(toolCallId, part);
    state.parts.push(part);
  } else if (toolName && part.toolName !== toolName) {
    part.toolName = toolName;
  }
  return part;
}

export function recordToolInputStart(state: StreamingMessageState, toolCallId: string, toolName?: string): boolean {
  if (!toolCallId) {
    return false;
  }
  const part = ensureToolCallPart(state, toolCallId, toolName);
  part.state = "input-streaming";
  return true;
}

export function recordToolInputDelta(state: StreamingMessageState, toolCallId: string, delta: string | undefined): boolean {
  if (!toolCallId || !delta) {
    return false;
  }
  const part = ensureToolCallPart(state, toolCallId);
  const currentLength = part.argsText?.length ?? 0;

  // Hard cap: stop accumulating if argsText would exceed the safety limit.
  // This prevents unbounded memory growth from runaway/duplicated tool payloads.
  // Check combined size (current + delta) to prevent a single large delta from
  // overshooting the cap.
  if (currentLength + delta.length > MAX_ARGS_TEXT_BYTES) {
    if (!state.loggedIncompleteToolCalls.has(`oversized:${toolCallId}`)) {
      state.loggedIncompleteToolCalls.add(`oversized:${toolCallId}`);
      console.warn(
        `[CHAT API] argsText for ${part.toolName} (${toolCallId}) would exceed ${MAX_ARGS_TEXT_BYTES} bytes ` +
        `(current: ${currentLength}, delta: ${delta.length}). ` +
        `Dropping further deltas to prevent memory exhaustion.`
      );
    }
    return false;
  }

  // Degenerate repetition detection: if the last 64 chars of accumulated text
  // are all the same character, the model is stuck in a token repetition loop
  // (e.g. "endLine":44550000000000000000...). Halt accumulation early to prevent
  // downstream cascading failures (absurd params → bloated results → socket errors).
  if (currentLength > 200 && part.argsText) {
    const tail = part.argsText.slice(-64);
    if (tail.length === 64 && new Set(tail).size === 1) {
      if (!state.loggedIncompleteToolCalls.has(`degenerate:${toolCallId}`)) {
        state.loggedIncompleteToolCalls.add(`degenerate:${toolCallId}`);
        state.loggedIncompleteToolCalls.add(`oversized:${toolCallId}`);
        console.warn(
          `[CHAT API] Degenerate repetition detected in argsText for ${part.toolName} (${toolCallId}). ` +
          `Last 64 chars are all '${tail[0]}' at ${currentLength} bytes. Halting accumulation.`
        );
      }
      return false;
    }
  }

  part.argsText = `${part.argsText ?? ""}${delta}`;
  part.state = part.state ?? "input-streaming";
  return true;
}

export function finalizeStreamingToolCalls(state: StreamingMessageState): boolean {
  let changed = false;
  for (const part of state.toolCallParts.values()) {
    // Finalize any tool call that's still in input-streaming state without args
    if (part.type === "tool-call" && part.state === "input-streaming" && !part.args) {
      if (part.argsText) {
        // Parse the accumulated argsText
        try {
          const parsed = JSON.parse(part.argsText);
          part.args = parsed;
          part.state = "input-available";
          changed = true;
          console.log(`[CHAT API] Finalized streaming tool call: ${part.toolName} (${part.toolCallId})`);
        } catch (error) {
          // argsText is invalid JSON - log truncated preview to avoid log flooding
          console.warn(
            `[CHAT API] Failed to parse argsText for ${part.toolName} (${part.toolCallId}).\n` +
            `  Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `  argsText length: ${part.argsText.length}\n` +
            `  argsText preview: ${part.argsText.slice(0, LOG_ARGS_TEXT_PREVIEW_CHARS)}` +
            (part.argsText.length > LOG_ARGS_TEXT_PREVIEW_CHARS ? `… [truncated ${part.argsText.length - LOG_ARGS_TEXT_PREVIEW_CHARS} more chars]` : "")
          );

          // Attempt to repair truncated JSON (e.g. missing closing braces/brackets)
          const repaired = attemptJsonRepair(part.argsText);
          if (repaired !== null) {
            console.log(
              `[CHAT API] Successfully repaired malformed JSON for ${part.toolName} (${part.toolCallId})`
            );
            part.args = repaired;
            part.state = "input-available";
            changed = true;
          } else {
            // Last resort: empty object so the tool call doesn't crash downstream
            console.warn(
              `[CHAT API] JSON repair failed for ${part.toolName} (${part.toolCallId}), using empty args`
            );
            part.args = {};
            part.state = "input-available";
            changed = true;
          }
        }
      } else {
        // No argsText means the tool was called with empty args (no tool-input-delta chunks sent)
        // This is valid - many tools accept empty/optional parameters
        part.args = {};
        part.state = "input-available";
        changed = true;
        console.log(`[CHAT API] Finalized streaming tool call with empty args: ${part.toolName} (${part.toolCallId})`);
      }
    }
  }
  return changed;
}

/**
 * Ensure every persisted tool-call has a corresponding tool-result.
 *
 * Some interruption/error paths can leave tool-call parts in input-* states
 * without a result, which causes repeated client-side sanitization and noisy
 * logs on every poll. This seals those calls with a synthetic output-error
 * result so history is internally consistent.
 */
export function sealDanglingToolCalls(
  state: StreamingMessageState,
  reason = "Tool execution ended before a result was persisted."
): boolean {
  if (!Array.isArray(state.parts) || state.parts.length === 0) return false;

  const toolResultIds = new Set<string>();
  for (const part of state.parts) {
    if (part.type === "tool-result" && typeof part.toolCallId === "string") {
      toolResultIds.add(part.toolCallId);
    }
  }

  let changed = false;
  const nextParts: DBContentPart[] = [];

  for (const part of state.parts) {
    nextParts.push(part);
    if (part.type !== "tool-call") continue;
    if (!part.toolCallId || toolResultIds.has(part.toolCallId)) continue;

    // Normalize unresolved tool call into a terminal state.
    if (!part.args) {
      if (part.argsText) {
        try {
          part.args = JSON.parse(part.argsText);
        } catch {
          const repaired = attemptJsonRepair(part.argsText);
          part.args = repaired ?? {};
        }
      } else {
        part.args = {};
      }
    }
    part.state = "output-error";

    nextParts.push({
      type: "tool-result",
      toolCallId: part.toolCallId,
      toolName: part.toolName || "tool",
      result: {
        status: "error",
        error: reason,
        reconstructed: true,
      },
      status: "error",
      state: "output-error",
      timestamp: new Date().toISOString(),
    });

    toolResultIds.add(part.toolCallId);
    changed = true;
  }

  if (changed) {
    state.parts = nextParts;
  }

  return changed;
}

export function recordStructuredToolCall(
  state: StreamingMessageState,
  toolCallId: string,
  toolName: string,
  input: unknown,
): boolean {
  if (!toolCallId) {
    return false;
  }
  const part = ensureToolCallPart(state, toolCallId, toolName);

  // When a complete tool-call arrives after streaming deltas (e.g. from
  // experimental_repairToolCall), update argsText to match the new input
  // so server-side state stays consistent.
  if (part.argsText && part.argsText.length > 0) {
    console.warn(
      `[CHAT API] recordStructuredToolCall overwriting streaming argsText for ${toolName} (${toolCallId}). ` +
        `Old argsText length: ${part.argsText.length}`
    );
    part.argsText = JSON.stringify(input ?? {});
  }

  part.state = "input-available";
  part.args = input;
  return true;
}

export function recordToolResultChunk(
  state: StreamingMessageState,
  toolCallId: string,
  toolName: string,
  output: unknown,
  preliminary?: boolean,
): boolean {
  if (!toolCallId) {
    return false;
  }
  const normalizedName = toolName || state.toolCallParts.get(toolCallId)?.toolName || "tool";
  const callPart = ensureToolCallPart(state, toolCallId, normalizedName);
  const normalized = normalizeToolResultOutput(
    normalizedName,
    output,
    callPart.args,
    { mode: "canonical" }
  );
  const status = normalized.status.toLowerCase();
  const isErrorStatus = status === "error" || status === "failed";
  callPart.state = isErrorStatus ? "output-error" : "output-available";

  // Check if we already have a tool-result for this toolCallId
  const existingResultIndex = state.parts.findIndex(
    (part) => part.type === "tool-result" && (part as DBToolResultPart).toolCallId === toolCallId
  );

  const resultPart: DBToolResultPart = {
    type: "tool-result",
    toolCallId,
    toolName: normalizedName,
    result: normalized.output,
    state: callPart.state,
    preliminary,
    status: normalized.status,
    timestamp: new Date().toISOString(),
  };

  if (existingResultIndex !== -1) {
    // Update existing result part instead of adding a new one
    state.parts[existingResultIndex] = resultPart;
  } else {
    // Only add new part if one doesn't exist
    state.parts.push(resultPart);
  }

  return true;
}
