import type { UIMessage } from "ai";

import { classifyRecoverability } from "@/lib/ai/retry/stream-recovery";

function isMeaningfulAssistantPart(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const candidate = part as Record<string, unknown>;

  if (candidate.type === "text") {
    return typeof candidate.text === "string" && candidate.text.trim().length > 0;
  }

  if (typeof candidate.type === "string" && candidate.type.startsWith("tool-")) {
    if (candidate.output !== undefined || candidate.result !== undefined || candidate.errorText !== undefined) {
      return true;
    }
    if (candidate.state === "output-available" || candidate.state === "output-error") {
      return true;
    }
    return false;
  }

  if (candidate.type === "dynamic-tool") {
    if (candidate.output !== undefined || candidate.errorText !== undefined) {
      return true;
    }
    if (candidate.state === "output-available" || candidate.state === "output-error") {
      return true;
    }
    return false;
  }

  return true;
}

export function hasMeaningfulAssistantContent(message: UIMessage | undefined): boolean {
  if (!message || message.role !== "assistant") return false;
  return Array.isArray(message.parts) && message.parts.some(isMeaningfulAssistantPart);
}

export function getLastUserMessageId(messages: UIMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === "user") {
      return message.id;
    }
  }
  return undefined;
}

export function shouldAutoRetryClientChat(args: {
  error: Error;
  messages: UIMessage[];
}): boolean {
  const { error, messages } = args;
  const classification = classifyRecoverability({
    provider: "client-ui",
    error,
    message: error.message,
  });

  if (!classification.recoverable) return false;

  const lastUserMessageId = getLastUserMessageId(messages);
  if (!lastUserMessageId) return false;

  const lastAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant");
  return !hasMeaningfulAssistantContent(lastAssistantMessage);
}
