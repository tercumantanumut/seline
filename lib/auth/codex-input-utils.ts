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

const convertOrphanedCallToMessage = (
  item: CodexInputItem,
  callId: string | null,
): CodexInputItem => {
  const toolName = typeof item.name === "string" ? item.name : "tool";
  const labelCallId = callId ?? "unknown";
  let argsText = "";

  try {
    const args = item.arguments ?? item.input ?? {};
    argsText = typeof args === "string" ? args : JSON.stringify(args);
  } catch {
    argsText = "[unserializable call input]";
  }

  if (argsText.length > 4000) {
    argsText = `${argsText.slice(0, 4000)}\n...[truncated]`;
  }

  return {
    type: "message",
    role: "assistant",
    content: `[Previous ${toolName} call omitted (missing output); call_id=${labelCallId}; args=${argsText}]`,
  };
};

const collectCallAndOutputIds = (input: CodexInputItem[]) => {
  const functionCallIds = new Set<string>();
  const localShellCallIds = new Set<string>();
  const customToolCallIds = new Set<string>();
  const functionCallOutputIds = new Set<string>();
  const localShellCallOutputIds = new Set<string>();
  const customToolCallOutputIds = new Set<string>();

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
      case "function_call_output":
        functionCallOutputIds.add(callId);
        break;
      case "local_shell_call_output":
        localShellCallOutputIds.add(callId);
        break;
      case "custom_tool_call_output":
        customToolCallOutputIds.add(callId);
        break;
      default:
        break;
    }
  }

  return {
    functionCallIds,
    localShellCallIds,
    customToolCallIds,
    functionCallOutputIds,
    localShellCallOutputIds,
    customToolCallOutputIds,
  };
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
  const {
    functionCallIds,
    localShellCallIds,
    customToolCallIds,
    functionCallOutputIds,
    localShellCallOutputIds,
    customToolCallOutputIds,
  } = collectCallAndOutputIds(input);

  return input.map((item) => {
    if (item.type === "function_call") {
      const callId = getCallId(item);
      const hasMatch =
        !!callId &&
        (functionCallOutputIds.has(callId) || localShellCallOutputIds.has(callId));
      if (!hasMatch) {
        return convertOrphanedCallToMessage(item, callId);
      }
    }

    if (item.type === "local_shell_call") {
      const callId = getCallId(item);
      const hasMatch =
        !!callId &&
        (localShellCallOutputIds.has(callId) || functionCallOutputIds.has(callId));
      if (!hasMatch) {
        return convertOrphanedCallToMessage(item, callId);
      }
    }

    if (item.type === "custom_tool_call") {
      const callId = getCallId(item);
      const hasMatch = !!callId && customToolCallOutputIds.has(callId);
      if (!hasMatch) {
        return convertOrphanedCallToMessage(item, callId);
      }
    }

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
