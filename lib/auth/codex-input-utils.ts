export type CodexInputItem = {
  type?: string;
  role?: string;
  id?: string;
  call_id?: string;
  name?: string;
  content?: unknown;
  output?: unknown;
  [key: string]: unknown;
};

const getCallId = (item: CodexInputItem): string | null => {
  const rawCallId = item.call_id;
  if (typeof rawCallId !== "string") return null;
  const trimmed = rawCallId.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const convertOrphanedOutputToMessage = (
  item: CodexInputItem,
  callId: string | null,
): CodexInputItem => {
  const toolName = typeof item.name === "string" ? item.name : "tool";
  const labelCallId = callId ?? "unknown";
  let text = "";

  try {
    text = typeof item.output === "string" ? item.output : JSON.stringify(item.output);
  } catch {
    text = String(item.output ?? "");
  }

  if (text.length > 16000) {
    text = text.slice(0, 16000) + "\n...[truncated]";
  }

  return {
    type: "message",
    role: "assistant",
    content: `[Previous ${toolName} result; call_id=${labelCallId}]: ${text}`,
  };
};

const collectCallIds = (input: CodexInputItem[]) => {
  const functionCallIds = new Set<string>();
  const localShellCallIds = new Set<string>();
  const customToolCallIds = new Set<string>();

  for (const item of input) {
    const callId = getCallId(item);
    if (!callId) continue;
    switch (item.type) {
      case "function_call":
        functionCallIds.add(callId);
        break;
      case "local_shell_call":
        localShellCallIds.add(callId);
        break;
      case "custom_tool_call":
        customToolCallIds.add(callId);
        break;
      default:
        break;
    }
  }

  return { functionCallIds, localShellCallIds, customToolCallIds };
};

export function filterCodexInput(
  input: CodexInputItem[] | undefined,
): CodexInputItem[] | undefined {
  if (!Array.isArray(input)) return input;

  return input
    .filter((item) => item.type !== "item_reference")
    .map((item) => {
      if (item.id) {
        const { id, ...rest } = item;
        return rest as CodexInputItem;
      }
      return item;
    });
}

export function normalizeOrphanedToolOutputs(input: CodexInputItem[]): CodexInputItem[] {
  const { functionCallIds, localShellCallIds, customToolCallIds } = collectCallIds(input);

  return input.map((item) => {
    if (item.type === "function_call_output") {
      const callId = getCallId(item);
      const hasMatch = !!callId && (functionCallIds.has(callId) || localShellCallIds.has(callId));
      if (!hasMatch) {
        return convertOrphanedOutputToMessage(item, callId);
      }
    }

    if (item.type === "custom_tool_call_output") {
      const callId = getCallId(item);
      const hasMatch = !!callId && customToolCallIds.has(callId);
      if (!hasMatch) {
        return convertOrphanedOutputToMessage(item, callId);
      }
    }

    if (item.type === "local_shell_call_output") {
      const callId = getCallId(item);
      const hasMatch = !!callId && localShellCallIds.has(callId);
      if (!hasMatch) {
        return convertOrphanedOutputToMessage(item, callId);
      }
    }

    return item;
  });
}
