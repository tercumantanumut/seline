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

/**
 * Max items in the Codex input array before truncation kicks in.
 * This is a safety net, not a known API limit — the Codex API does not
 * document a hard item cap. Set conservatively to avoid hitting
 * undocumented server-side limits (typical sessions: 50-150 items).
 */
export const MAX_CODEX_INPUT_ITEMS = 256;

/**
 * Max serialized payload bytes before truncation kicks in (900 KB).
 * The Codex API appears to enforce an undocumented ~1 MB request body
 * limit — sessions with 1.2 MB payloads fail with opaque "Unknown error".
 * Set to 900 KB to leave headroom for the instructions/model fields that
 * transformCodexRequest adds on top of the input array.
 */
export const MAX_CODEX_PAYLOAD_BYTES = 900 * 1024;

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

/**
 * Extract nested tool-call parts from an assistant message's content array
 * and return them as top-level function_call items.
 *
 * When the AI SDK or stored session data includes tool-call parts nested
 * inside assistant message content (instead of as top-level function_call
 * items), the normalizer can't match them with their corresponding outputs.
 * This causes synthetic empty-arg calls to be created, bloating the payload.
 *
 * Returns [cleanedMessage, ...extractedCalls] or [originalMessage] if no
 * extraction was needed.
 */
function extractNestedToolCalls(item: CodexInputItem): CodexInputItem[] {
  if (item.type !== "message" || item.role !== "assistant") return [item];
  if (!Array.isArray(item.content)) return [item];

  const toolCallParts: CodexInputItem[] = [];
  const remainingContent: unknown[] = [];

  for (const part of item.content as Array<Record<string, unknown>>) {
    if (!part || typeof part !== "object") {
      remainingContent.push(part);
      continue;
    }

    // AI SDK format: {type: "tool-call", toolCallId, toolName, input}
    if (part.type === "tool-call" && typeof part.toolCallId === "string") {
      const args =
        part.input !== undefined ? JSON.stringify(part.input) : "{}";
      toolCallParts.push({
        type: "function_call",
        call_id: part.toolCallId as string,
        name: (typeof part.toolName === "string" ? part.toolName : "tool") as string,
        arguments: args,
      });
      continue;
    }

    // Responses API format nested inside content (shouldn't happen but be safe)
    if (
      isToolCallType(part.type as string | undefined) &&
      typeof (part.call_id ?? part.callId ?? part.toolCallId) === "string"
    ) {
      const cid = (part.call_id ?? part.callId ?? part.toolCallId) as string;
      toolCallParts.push({
        type: part.type as string,
        call_id: cid,
        name: (typeof part.name === "string" ? part.name : "tool") as string,
        arguments:
          typeof part.arguments === "string" ? part.arguments : "{}",
      });
      continue;
    }

    remainingContent.push(part);
  }

  if (toolCallParts.length === 0) return [item];

  const result: CodexInputItem[] = [];

  // Keep the assistant message with remaining content (text parts, etc.)
  if (remainingContent.length > 0) {
    result.push({ ...item, content: remainingContent });
  }

  // Add extracted tool calls as top-level items
  result.push(...toolCallParts);

  if (toolCallParts.length > 0) {
    console.log(
      `[CODEX] Extracted ${toolCallParts.length} nested tool-call parts from assistant message content`
    );
  }

  return result;
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

    // Extract nested tool-call parts from assistant messages into top-level items
    const extracted = extractNestedToolCalls(sanitized);
    normalized.push(...extracted);
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

/**
 * Truncate oversized Codex input by dropping the oldest tool-call/output
 * pairs until both MAX_CODEX_INPUT_ITEMS and MAX_CODEX_PAYLOAD_BYTES are
 * satisfied.
 *
 * Strategy:
 * 1. Separate tool items from non-tool "anchor" items (messages, etc.).
 * 2. Group tool items into call/output pairs by call_id.
 * 3. Drop the oldest pairs first, keeping the most recent context.
 * 4. Always preserve all non-tool anchor items.
 */
export function truncateCodexInput(input: CodexInputItem[]): CodexInputItem[] {
  if (input.length <= MAX_CODEX_INPUT_ITEMS) {
    const payloadSize = JSON.stringify(input).length;
    if (payloadSize <= MAX_CODEX_PAYLOAD_BYTES) {
      return input;
    }
  }

  // Separate tool items from anchors, preserving order information
  type IndexedItem = { index: number; item: CodexInputItem };
  const anchors: IndexedItem[] = [];
  const toolItems: IndexedItem[] = [];

  for (let i = 0; i < input.length; i++) {
    const item = input[i];
    if (isToolCallType(item.type) || isToolOutputType(item.type)) {
      toolItems.push({ index: i, item });
    } else {
      anchors.push({ index: i, item });
    }
  }

  if (toolItems.length === 0) {
    return input;
  }

  // Group tool items into pairs by call_id (order by first appearance)
  const pairMap = new Map<string, IndexedItem[]>();
  const pairOrder: string[] = [];

  for (const ti of toolItems) {
    const cid = getCallId(ti.item) ?? `__no_id_${ti.index}`;
    if (!pairMap.has(cid)) {
      pairMap.set(cid, []);
      pairOrder.push(cid);
    }
    pairMap.get(cid)!.push(ti);
  }

  // Drop oldest pairs first until within limits
  // pairOrder[0] is the oldest, pairOrder[last] is the most recent
  let dropCount = 0;

  const rebuild = (): CodexInputItem[] => {
    const kept = new Set<number>();
    for (const a of anchors) kept.add(a.index);
    for (let p = dropCount; p < pairOrder.length; p++) {
      for (const ti of pairMap.get(pairOrder[p])!) {
        kept.add(ti.index);
      }
    }
    return input.filter((_, i) => kept.has(i));
  };

  const isWithinLimits = (items: CodexInputItem[]): boolean =>
    items.length <= MAX_CODEX_INPUT_ITEMS &&
    JSON.stringify(items).length <= MAX_CODEX_PAYLOAD_BYTES;

  while (dropCount < pairOrder.length && !isWithinLimits(rebuild())) {
    dropCount++;
  }

  const result = rebuild();

  const droppedItems = input.length - result.length;
  if (droppedItems > 0) {
    console.warn(
      `[CODEX] Truncated input: dropped ${droppedItems} items ` +
        `(${dropCount} tool pairs), ` +
        `${input.length} → ${result.length} items, ` +
        `${(JSON.stringify(input).length / 1024).toFixed(0)}KB → ` +
        `${(JSON.stringify(result).length / 1024).toFixed(0)}KB`
    );
  }

  return result;
}
