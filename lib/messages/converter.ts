import type { UIMessage } from "ai";

// Database content part types
type DBContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: unknown }
  | { type: "tool-result"; toolCallId: string; toolName?: string; result: unknown };

interface DBMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
  createdAt: Date | string;
  metadata?: unknown;
  tokenCount?: number | null;
  toolCallId?: string | null;  // For role="tool" messages, references the parent tool call
}

// Simpler part type that works with any UIMessage
// Note: For tool parts, we use the typed format `tool-${toolName}` to match what the AI SDK
// sends during streaming. This ensures proper handling by AISDKMessageConverter which uses
// isToolUIPart (matches both static tool-* and dynamic-tool) but extracts toolName differently.
// Using tool-* format ensures the correct toolName extraction via type.replace("tool-", "").
type SimplePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string }
  | { type: `tool-${string}`; toolCallId: string; state: "output-available"; input: unknown; output: unknown };

/**
 * Convert a database message to UIMessage format for assistant-ui
 */
export function convertDBMessageToUIMessage(dbMessage: DBMessage): UIMessage | null {
  // Skip system/tool role messages
  if (dbMessage.role === "system" || dbMessage.role === "tool") {
    return null;
  }

  const content = dbMessage.content as DBContentPart[];
  if (!Array.isArray(content) || content.length === 0) {
    return null;
  }

  const parts: SimplePart[] = [];
  const toolResults: Map<string, unknown> = new Map();

  // First pass: collect tool results
  for (const part of content) {
    if (part.type === "tool-result") {
      toolResults.set(part.toolCallId, part.result);
    }
  }

  // Second pass: build parts
  for (const part of content) {
    if (part.type === "text" && part.text?.trim()) {
      parts.push({ type: "text", text: part.text });
    } else if (part.type === "image" && part.image) {
      parts.push({
        type: "file",
        mediaType: "image/jpeg",
        url: part.image,
      });
    } else if (part.type === "tool-call") {
      const result = toolResults.get(part.toolCallId);
      // Use typed tool format (tool-{toolName}) to match AI SDK streaming format
      // This ensures AISDKMessageConverter extracts toolName correctly via type.replace("tool-", "")
      parts.push({
        type: `tool-${part.toolName}` as `tool-${string}`,
        toolCallId: part.toolCallId,
        state: "output-available",
        input: part.args,
        output: result ?? null,
      });
    }
  }

  if (parts.length === 0) {
    return null;
  }

  // Build metadata for assistant-ui format
  // assistant-ui expects custom data in metadata.custom
  const dbMeta = dbMessage.metadata as { usage?: Record<string, unknown> } | undefined;
  const customMetadata: Record<string, unknown> = {};

  // Pass through usage from database metadata
  if (dbMeta?.usage) {
    customMetadata.usage = dbMeta.usage;
  }

  // Also include tokenCount for convenience
  if (dbMessage.tokenCount) {
    customMetadata.tokenCount = dbMessage.tokenCount;
  }

  return {
    id: dbMessage.id,
    role: dbMessage.role as "user" | "assistant",
    parts: parts as UIMessage["parts"],
    metadata: Object.keys(customMetadata).length > 0 ? { custom: customMetadata } : undefined,
  } as UIMessage;
}

/**
 * Convert an array of database messages to UIMessage format.
 *
 * This function processes messages sequentially and merges tool results
 * from separate role="tool" messages into their corresponding tool-call parts.
 * This prevents the runtime from detecting "pending" tool calls and re-executing them.
 */
export function convertDBMessagesToUIMessages(dbMessages: DBMessage[]): UIMessage[] {
  // Pre-sort by createdAt (defensive, DB should already be ordered)
  const sortedMessages = [...dbMessages].sort((a, b) => {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();
    return aTime - bTime;
  });

  // First pass: collect all tool results from role="tool" messages
  // These are stored separately from the assistant message that made the tool call
  const globalToolResults = new Map<string, unknown>();
  for (const dbMsg of sortedMessages) {
    if (dbMsg.role === "tool") {
      const content = dbMsg.content as DBContentPart[];
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "tool-result" && part.toolCallId) {
            globalToolResults.set(part.toolCallId, part.result);
          }
        }
      }
      // Also check if toolCallId is at message level (some storage patterns)
      if (dbMsg.toolCallId && Array.isArray(content) && content.length > 0) {
        const firstPart = content[0];
        if (firstPart.type === "tool-result") {
          globalToolResults.set(dbMsg.toolCallId, firstPart.result);
        }
      }
    }
  }

  // Second pass: build UI messages, using collected tool results
  const result: UIMessage[] = [];

  for (const dbMsg of sortedMessages) {
    // Skip system messages
    if (dbMsg.role === "system") continue;

    // Skip tool messages - their results have been collected above
    if (dbMsg.role === "tool") continue;

    const content = dbMsg.content as DBContentPart[];
    if (!Array.isArray(content) || content.length === 0) {
      continue;
    }

    const parts: SimplePart[] = [];

    // Collect tool results within the same message (inline pattern)
    const inlineToolResults = new Map<string, unknown>();
    for (const part of content) {
      if (part.type === "tool-result" && part.toolCallId) {
        inlineToolResults.set(part.toolCallId, part.result);
      }
    }

    // Build parts
    for (const part of content) {
      if (part.type === "text" && part.text?.trim()) {
        parts.push({ type: "text", text: part.text });
      } else if (part.type === "image" && part.image) {
        parts.push({
          type: "file",
          mediaType: "image/jpeg",
          url: part.image,
        });
      } else if (part.type === "tool-call") {
        // Look up result: first check inline (same message), then global (separate tool message)
        const result = inlineToolResults.get(part.toolCallId) ??
                       globalToolResults.get(part.toolCallId) ??
                       null;
        // Use typed tool format (tool-{toolName}) to match AI SDK streaming format
        // This ensures AISDKMessageConverter extracts toolName correctly via type.replace("tool-", "")
        parts.push({
          type: `tool-${part.toolName}` as `tool-${string}`,
          toolCallId: part.toolCallId,
          state: "output-available",
          input: part.args,
          output: result,
        });
      }
    }

    if (parts.length === 0) {
      continue;
    }

    // Build metadata for assistant-ui format
    const dbMeta = dbMsg.metadata as { usage?: Record<string, unknown> } | undefined;
    const customMetadata: Record<string, unknown> = {};

    if (dbMeta?.usage) {
      customMetadata.usage = dbMeta.usage;
    }
    if (dbMsg.tokenCount) {
      customMetadata.tokenCount = dbMsg.tokenCount;
    }

    result.push({
      id: dbMsg.id,
      role: dbMsg.role as "user" | "assistant",
      parts: parts as UIMessage["parts"],
      metadata: Object.keys(customMetadata).length > 0 ? { custom: customMetadata } : undefined,
    } as UIMessage);
  }

  return result;
}

// ThreadMessageLike content part types (what runtime.thread.reset() expects)
type ThreadContentPart =
  | { type: "text"; text: string }
  | { type: "image"; image: string }
  | { type: "tool-call"; toolCallId: string; toolName: string; args: any; result?: any };

interface ThreadMessageLike {
  id?: string;
  role: "user" | "assistant" | "system";
  content: ThreadContentPart[];
  createdAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Convert UIMessage (with parts) to ThreadMessageLike (with content)
 * runtime.thread.reset() expects ThreadMessageLike format, not UIMessage format
 */
function convertUIMessageToThreadMessageLike(msg: UIMessage): ThreadMessageLike {
  const content: ThreadContentPart[] = [];

  for (const part of msg.parts || []) {
    if (part.type === "text" && "text" in part) {
      content.push({ type: "text", text: part.text });
    } else if (part.type === "file" && "url" in part) {
      // File parts (images) need to be converted to image content
      content.push({ type: "image", image: part.url });
    } else if (part.type === "dynamic-tool" && "toolName" in part) {
      // Dynamic tool parts need to be converted to tool-call with result
      const toolPart = part as { toolName: string; toolCallId: string; input: unknown; output: unknown };
      content.push({
        type: "tool-call",
        toolCallId: toolPart.toolCallId,
        toolName: toolPart.toolName,
        args: toolPart.input as any,
        result: toolPart.output,
      });
    }
  }

  // If no content parts were created, add a placeholder text
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    content,
    metadata: (msg as UIMessage & { metadata?: Record<string, unknown> }).metadata,
  };
}

/**
 * Convert UIMessage array to ThreadMessageLike[] for runtime.thread.reset()
 * This is needed because useChatRuntime's messages prop doesn't work properly
 * with unstable_useRemoteThreadListRuntime's thread management.
 */
export function convertToThreadMessageLike(messages: UIMessage[]): ThreadMessageLike[] {
  return messages.map(convertUIMessageToThreadMessageLike);
}
