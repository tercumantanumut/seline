import type { DBContentPart, DBToolCallPart, DBToolResultPart } from "@/lib/messages/converter";
import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";
import { attemptJsonRepair } from "./tool-call-utils";

export interface StreamingMessageState {
  parts: DBContentPart[];
  toolCallParts: Map<string, DBToolCallPart>;
  loggedIncompleteToolCalls: Set<string>;
  messageId?: string;
  isCreating?: boolean;
  lastBroadcastAt: number;
  lastBroadcastSignature: string;
  pendingBroadcast?: boolean;
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
          // argsText is invalid JSON - log full details for debugging
          console.warn(
            `[CHAT API] Failed to parse argsText for ${part.toolName} (${part.toolCallId}).\n` +
            `  Error: ${error instanceof Error ? error.message : String(error)}\n` +
            `  argsText length: ${part.argsText.length}\n` +
            `  Full argsText: ${part.argsText}`
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
