import type { DBContentPart, DBToolCallPart, DBToolResultPart } from "@/lib/messages/converter";
import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";
import { normalizeToolCallInput } from "./tool-call-utils";
import { cloneContentParts } from "./streaming-state";
import { stripFakeToolCallJson } from "./content-sanitizer";

export interface StepToolCallLike {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

export interface StepToolResultLike {
  toolCallId: string;
  output: unknown;
  toolName?: string;
}

export interface StepLike {
  toolCalls?: StepToolCallLike[];
  toolResults?: StepToolResultLike[];
  text?: string;
}

export function buildCanonicalAssistantContentFromSteps(
  steps: StepLike[] | undefined,
  fallbackText?: string
): DBContentPart[] {
  const content: DBContentPart[] = [];
  const toolCallMetadata = new Map<string, { toolName: string; input?: unknown }>();
  const seenToolCalls = new Set<string>();
  const seenToolResults = new Set<string>();

  if (steps && steps.length > 0) {
    for (const step of steps) {
      if (step.toolCalls) {
        for (const call of step.toolCalls) {
          const normalizedInput = normalizeToolCallInput(
            call.input,
            call.toolName,
            call.toolCallId
          );
          if (!normalizedInput) continue;
          if (seenToolCalls.has(call.toolCallId)) continue;
          seenToolCalls.add(call.toolCallId);
          content.push({
            type: "tool-call",
            toolCallId: call.toolCallId,
            toolName: call.toolName,
            args: normalizedInput,
          });
          toolCallMetadata.set(call.toolCallId, {
            toolName: call.toolName,
            input: normalizedInput,
          });
        }
      }

      if (step.toolResults) {
        for (const res of step.toolResults) {
          if (seenToolResults.has(res.toolCallId)) continue;
          seenToolResults.add(res.toolCallId);

          const meta = toolCallMetadata.get(res.toolCallId);
          const toolName = res.toolName || meta?.toolName || "tool";
          const normalized = normalizeToolResultOutput(toolName, res.output, meta?.input, {
            mode: "canonical",
          });
          const status = normalized.status.toLowerCase();
          const state =
            status === "error" || status === "failed"
              ? "output-error"
              : "output-available";

          content.push({
            type: "tool-result",
            toolCallId: res.toolCallId,
            toolName,
            result: normalized.output,
            status: normalized.status,
            timestamp: new Date().toISOString(),
            state,
          });
        }
      }

      if (step.text?.trim()) {
        const cleanedStepText = stripFakeToolCallJson(step.text);
        if (cleanedStepText.trim()) {
          content.push({ type: "text", text: cleanedStepText });
        }
      }
    }
  }

  if (content.length === 0 && fallbackText?.trim()) {
    const cleanedFallbackText = stripFakeToolCallJson(fallbackText);
    if (cleanedFallbackText.trim()) {
      content.push({ type: "text", text: cleanedFallbackText });
    }
  }

  return content;
}

export function isReconstructedMissingResult(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  if (obj.reconstructed === true) return true;
  const error = typeof obj.error === "string" ? obj.error : "";
  return error.includes("did not return a persisted result");
}

export function reconcileDbToolCallResultPairs(parts: DBContentPart[]): DBContentPart[] {
  const normalized: DBContentPart[] = [];
  const toolCallIds = new Set<string>();
  const toolResultIds = new Set<string>();

  for (const part of parts) {
    if (part.type === "tool-result") {
      if (!toolCallIds.has(part.toolCallId)) {
        normalized.push({
          type: "tool-call",
          toolCallId: part.toolCallId,
          toolName: part.toolName || "tool",
          args: {
            __reconstructed: true,
            reason: "missing_tool_call_in_history",
          },
          state: "input-available",
        });
        toolCallIds.add(part.toolCallId);
      }
      toolResultIds.add(part.toolCallId);
      normalized.push(part);
      continue;
    }

    if (part.type === "tool-call") {
      toolCallIds.add(part.toolCallId);
    }

    normalized.push(part);
  }

  for (const toolCallId of toolCallIds) {
    if (toolResultIds.has(toolCallId)) continue;
    const callPart = normalized.find(
      (part): part is DBToolCallPart => part.type === "tool-call" && part.toolCallId === toolCallId
    );
    normalized.push({
      type: "tool-result",
      toolCallId,
      toolName: callPart?.toolName || "tool",
      result: {
        status: "error",
        error: "Tool execution did not return a persisted result in conversation history.",
        reconstructed: true,
      },
      status: "error",
      state: "output-error",
      timestamp: new Date().toISOString(),
    });
  }

  return normalized;
}

export function mergeCanonicalAssistantContent(
  streamedParts: DBContentPart[] | undefined,
  stepParts: DBContentPart[]
): DBContentPart[] {
  const base = Array.isArray(streamedParts)
    ? cloneContentParts(streamedParts)
    : [];

  if (base.length === 0) {
    return reconcileDbToolCallResultPairs(stepParts);
  }
  if (stepParts.length === 0) {
    return reconcileDbToolCallResultPairs(base);
  }

  const callIndexById = new Map<string, number>();
  const resultIndexById = new Map<string, number>();

  for (let i = 0; i < base.length; i += 1) {
    const part = base[i];
    if (part.type === "tool-call") {
      callIndexById.set(part.toolCallId, i);
    } else if (part.type === "tool-result") {
      resultIndexById.set(part.toolCallId, i);
    }
  }

  for (const incoming of stepParts) {
    if (incoming.type === "tool-call") {
      const existingIdx = callIndexById.get(incoming.toolCallId);
      if (existingIdx === undefined) {
        callIndexById.set(incoming.toolCallId, base.length);
        base.push(incoming);
      } else {
        const existing = base[existingIdx] as DBToolCallPart;
        if (!existing.args && incoming.args) {
          existing.args = incoming.args;
        }
        if (!existing.toolName && incoming.toolName) {
          existing.toolName = incoming.toolName;
        }
        if (!existing.state && incoming.state) {
          existing.state = incoming.state;
        }
      }
      continue;
    }

    if (incoming.type === "tool-result") {
      const existingIdx = resultIndexById.get(incoming.toolCallId);
      if (existingIdx === undefined) {
        resultIndexById.set(incoming.toolCallId, base.length);
        base.push(incoming);
      } else {
        const existing = base[existingIdx] as DBToolResultPart;
        if (isReconstructedMissingResult(existing.result)) {
          base[existingIdx] = incoming;
        } else if (!existing.result && incoming.result) {
          base[existingIdx] = incoming;
        } else if (existing.preliminary && !incoming.preliminary) {
          base[existingIdx] = incoming;
        }
      }
      continue;
    }

    if (incoming.type === "text") {
      let latestExistingText: string | undefined;
      for (let i = base.length - 1; i >= 0; i -= 1) {
        const part = base[i];
        if (part.type === "text") {
          latestExistingText = part.text;
          break;
        }
      }
      if (latestExistingText === incoming.text) {
        continue;
      }
      base.push(incoming);
      continue;
    }

    base.push(incoming);
  }

  return reconcileDbToolCallResultPairs(base);
}

export function countCanonicalTruncationMarkers(parts: DBContentPart[]): number {
  let count = 0;
  for (const part of parts) {
    if (part.type !== "tool-result") continue;
    const result = part.result;
    if (!result || typeof result !== "object" || Array.isArray(result)) continue;
    const obj = result as Record<string, unknown>;
    if (obj.truncated === true) {
      count += 1;
      continue;
    }
    if (typeof obj.truncatedContentId === "string" && obj.truncatedContentId.startsWith("trunc_")) {
      count += 1;
      continue;
    }
  }
  return count;
}

export function isAbortLikeTerminationError(errorMessage: string): boolean {
  const lower = errorMessage.toLowerCase();
  return (
    lower.includes("abort") ||
    lower.includes("terminated") ||
    lower.includes("interrupted") ||
    lower.includes("controller was closed") ||
    lower.includes("connection reset") ||
    lower.includes("socket hang up")
  );
}

export function shouldTreatStreamErrorAsCancellation(args: {
  errorMessage: string;
  isCreditError: boolean;
  streamAborted: boolean;
  classificationRecoverable: boolean;
  classificationReason?: string;
}): boolean {
  const {
    errorMessage,
    isCreditError,
    streamAborted,
    classificationRecoverable,
    classificationReason,
  } = args;

  if (isCreditError) return false;
  if (streamAborted) return true;
  if (classificationReason === "user_abort") return true;

  return classificationRecoverable && isAbortLikeTerminationError(errorMessage);
}
