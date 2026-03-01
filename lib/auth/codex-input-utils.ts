import { isInternalToolHistoryLeakText } from "@/lib/messages/internal-tool-history";

export type CodexInputItem = {
  type?: string;
  role?: string;
  id?: string;
  call_id?: string;
  callId?: string;
  tool_call_id?: string;
  toolCallId?: string;
  name?: string;
  content?: unknown;
  output?: unknown;
  [key: string]: unknown;
};

const TOOL_CALL_TYPES = new Set([
  "function_call",
  "local_shell_call",
  "custom_tool_call",
]);

const TOOL_OUTPUT_TYPES = new Set([
  "function_call_output",
  "local_shell_call_output",
  "custom_tool_call_output",
]);

const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const getCallId = (item: CodexInputItem): string | null =>
  toTrimmedString(item.call_id) ??
  toTrimmedString(item.callId) ??
  toTrimmedString(item.tool_call_id) ??
  toTrimmedString(item.toolCallId) ??
  toTrimmedString(item.id);

const isToolCallType = (type: unknown): type is string =>
  typeof type === "string" && TOOL_CALL_TYPES.has(type);

const isToolOutputType = (type: unknown): type is string =>
  typeof type === "string" && TOOL_OUTPUT_TYPES.has(type);

const mapOutputTypeToCallType = (outputType: string): string => {
  if (outputType === "local_shell_call_output") return "local_shell_call";
  if (outputType === "custom_tool_call_output") return "custom_tool_call";
  return "function_call";
};

const mapCallTypeToOutputType = (callType: string): string => {
  if (callType === "local_shell_call") return "local_shell_call_output";
  if (callType === "custom_tool_call") return "custom_tool_call_output";
  return "function_call_output";
};

const buildSyntheticCallFromOutput = (
  outputItem: CodexInputItem,
  callId: string
): CodexInputItem => {
  const toolName = typeof outputItem.name === "string" ? outputItem.name : "tool";
  const callType = mapOutputTypeToCallType(outputItem.type ?? "function_call_output");

  return {
    type: callType,
    call_id: callId,
    name: toolName,
    arguments: "{}",
  };
};

const buildSyntheticOutputFromCall = (
  callItem: CodexInputItem,
  callId: string
): CodexInputItem => {
  const toolName = typeof callItem.name === "string" ? callItem.name : "tool";
  const outputType = mapCallTypeToOutputType(callItem.type ?? "function_call");

  return {
    type: outputType,
    call_id: callId,
    name: toolName,
    output: {
      status: "error",
      error: "Tool call had no persisted output in conversation history.",
      reconstructed: true,
    },
  };
};

function sanitizeAssistantMessageContent(item: CodexInputItem): CodexInputItem | null {
  if (item.type !== "message" || item.role !== "assistant") {
    return item;
  }

  if (typeof item.content === "string") {
    return isInternalToolHistoryLeakText(item.content) ? null : item;
  }

  if (!Array.isArray(item.content)) {
    return item;
  }

  const cleanedParts = item.content.filter((part) => {
    if (typeof part === "string") {
      return !isInternalToolHistoryLeakText(part);
    }
    if (!part || typeof part !== "object") return true;
    const maybeText = (part as { text?: unknown }).text;
    if (typeof maybeText === "string" && isInternalToolHistoryLeakText(maybeText)) {
      return false;
    }
    return true;
  });

  if (cleanedParts.length === 0) {
    return null;
  }

  return cleanedParts.length === item.content.length
    ? item
    : { ...item, content: cleanedParts };
}

export function filterCodexInput(
  input: CodexInputItem[] | undefined,
): CodexInputItem[] | undefined {
  if (!Array.isArray(input)) return input;

  const normalized: CodexInputItem[] = [];

  for (const rawItem of input) {
    if (rawItem.type === "item_reference") continue;

    // Drop transient item IDs, but preserve tool correlation when upstream
    // encodes call IDs as `id` instead of `call_id`.
    const itemWithoutId = rawItem.id
      ? (({ id, ...rest }) => rest as CodexInputItem)(rawItem)
      : rawItem;
    const callId = getCallId(rawItem);
    const item =
      callId &&
      (isToolCallType(rawItem.type) || isToolOutputType(rawItem.type)) &&
      !toTrimmedString(itemWithoutId.call_id)
        ? { ...itemWithoutId, call_id: callId }
        : itemWithoutId;

    const sanitized = sanitizeAssistantMessageContent(item);
    if (!sanitized) continue;
    normalized.push(sanitized);
  }

  return normalized;
}

export function normalizeOrphanedToolOutputs(input: CodexInputItem[]): CodexInputItem[] {
  const normalized: CodexInputItem[] = [];
  const seenCallIds = new Set<string>();
  const seenOutputIds = new Set<string>();
  let reconstructedCalls = 0;
  let reconstructedResults = 0;
  let droppedDuplicateCalls = 0;
  let droppedDuplicateOutputs = 0;

  for (const item of input) {
    if (isToolCallType(item.type)) {
      const callId = getCallId(item);
      if (!callId) {
        normalized.push(item);
        continue;
      }

      if (seenCallIds.has(callId)) {
        droppedDuplicateCalls += 1;
        continue;
      }

      seenCallIds.add(callId);
      normalized.push(item);
      continue;
    }

    if (isToolOutputType(item.type)) {
      const callId = getCallId(item);
      if (!callId) {
        normalized.push(item);
        continue;
      }

      if (seenOutputIds.has(callId)) {
        droppedDuplicateOutputs += 1;
        continue;
      }

      if (!seenCallIds.has(callId)) {
        normalized.push(buildSyntheticCallFromOutput(item, callId));
        seenCallIds.add(callId);
        reconstructedCalls += 1;
      }

      seenOutputIds.add(callId);
      normalized.push(item);
      continue;
    }

    normalized.push(item);
  }

  for (const callId of seenCallIds) {
    if (seenOutputIds.has(callId)) continue;

    const callItem = normalized.find(
      (candidate) =>
        isToolCallType(candidate.type) &&
        getCallId(candidate) === callId
    );
    if (!callItem) continue;

    normalized.push(buildSyntheticOutputFromCall(callItem, callId));
    reconstructedResults += 1;
  }

  if (
    reconstructedCalls > 0 ||
    reconstructedResults > 0 ||
    droppedDuplicateCalls > 0 ||
    droppedDuplicateOutputs > 0
  ) {
    console.warn(
      `[CODEX] Normalized tool history before request: ` +
        `reconstructedCalls=${reconstructedCalls}, ` +
        `reconstructedResults=${reconstructedResults}, ` +
        `droppedDuplicateCalls=${droppedDuplicateCalls}, ` +
        `droppedDuplicateOutputs=${droppedDuplicateOutputs}`
    );
  }

  return normalized;
}
