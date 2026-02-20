import type { UIMessage } from "ai";

function toPartDigest(part: UIMessage["parts"][number] | undefined | null): string {
  if (!part || typeof part !== "object") {
    return "unknown";
  }

  if (part.type === "text" && typeof (part as { text?: unknown }).text === "string") {
    const text = (part as { text: string }).text;
    return `text:${text.length}:${text.slice(0, 40)}:${text.slice(-40)}`;
  }

  const serialized = JSON.stringify(part);
  if (serialized) {
    return `${part.type}:${serialized.length}:${serialized.slice(0, 60)}:${serialized.slice(-60)}`;
  }

  return `${part.type}:empty`;
}

export function getMessageSignature(message: UIMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  const partsDigest = parts.map(toPartDigest).join("|");
  return `${message.id || ""}:${message.role}:${parts.length}:${partsDigest}`;
}

export function getMessagesSignature(messages: UIMessage[]): string {
  if (!messages.length) {
    return "0";
  }
  const lastMessage = messages[messages.length - 1];
  return `${messages.length}:${getMessageSignature(lastMessage)}`;
}
