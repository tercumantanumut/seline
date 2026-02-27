"use client";

// Suppress noisy dev warning from @assistant-ui/react useToolInvocations
if (process.env.NODE_ENV !== "production") {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("argsText updated after controller was closed")
    )
      return;
    originalWarn.apply(console, args);
  };
}

import { Component, createContext, type ErrorInfo, type FC, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";
import {
  AssistantRuntimeProvider,
  type AttachmentAdapter,
  type PendingAttachment,
  type CompleteAttachment,
} from "@assistant-ui/react";
import {
  useAISDKRuntime,
  AssistantChatTransport,
} from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";
import type { UIMessage, UIMessageChunk } from "ai";
import { DeepResearchProvider } from "./assistant-ui/deep-research-context";
import { VoiceProvider } from "./assistant-ui/voice-context";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { classifyRecoverability } from "@/lib/ai/retry/stream-recovery";

// ============================================================================
// Error Boundary for Tool Streaming Errors
// ============================================================================

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Check if an error is a recoverable streaming/tool-related error that should
 * auto-retry rather than crash the page.
 */
function isRecoverableStreamingError(error: Error): boolean {
  const msg = error.message || "";
  const classification = classifyRecoverability({
    provider: "client-ui",
    error,
    message: msg,
  });
  if (classification.recoverable) return true;
  // assistant-ui internal: argsText append ordering error
  if (msg.includes("argsText can only be appended")) return true;
  // JSON parse failures from malformed tool call argsText during streaming
  if (error instanceof SyntaxError && msg.includes("JSON")) return true;
  // assistant-ui internal: controller closed during streaming
  if (msg.includes("controller was closed")) return true;
  // Generic tool invocation errors from assistant-ui
  if (msg.includes("toolCallId") && msg.includes("not found")) return true;
  // Tool result processing errors (e.g., accessing undefined properties during streaming)
  if (msg.includes("Cannot read properties of undefined")) return true;
  if (msg.includes("Cannot read property") && msg.includes("undefined")) return true;
  return false;
}

/**
 * Error boundary that catches tool argument streaming errors from assistant-ui.
 * Handles:
 * - "argsText can only be appended" errors from tool streaming
 * - JSON SyntaxError from malformed argsText reaching the client
 * - Controller-closed errors from interrupted streams
 * Shows a loading state and auto-retries after a short delay.
 */
class ChatErrorBoundary extends Component<
  { children: ReactNode; processingText: string; genericError: string },
  ErrorBoundaryState
> {
  constructor(props: { children: ReactNode; processingText: string; genericError: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isRecoverableStreamingError(error)) {
      console.warn("[ChatErrorBoundary] Recoverable streaming error - will retry", error.message);
      // Auto-reset after a short delay to retry rendering
      setTimeout(() => {
        this.setState({ hasError: false, error: null });
      }, 500);
    } else {
      console.error("[ChatErrorBoundary] Unexpected error:", error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      // Show loading state for recoverable streaming errors
      if (this.state.error && isRecoverableStreamingError(this.state.error)) {
        return (
          <div className="flex items-center justify-center p-8 bg-terminal-cream min-h-full">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="h-8 w-8 animate-spin text-terminal-green" />
              <p className="text-sm font-mono text-terminal-muted">{this.props.processingText}</p>
            </div>
          </div>
        );
      }
      // For other errors, show a proper error state
      return (
        <div className="flex items-center justify-center p-8 bg-terminal-cream min-h-full">
          <p className="text-sm font-mono text-red-600">{this.props.genericError}</p>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================================
// Chat setMessages context — allows background polling to update the thread
// in-place without remounting the ChatProvider.
// ============================================================================

type SetMessagesFn = (messages: UIMessage[] | ((messages: UIMessage[]) => UIMessage[])) => void;
const ChatSetMessagesContext = createContext<SetMessagesFn | null>(null);
export const useChatSetMessages = () => useContext(ChatSetMessagesContext);

// ============================================================================
// Dynamic transport proxy (same as useChatRuntime does internally)
// ============================================================================

function useDynamicChatTransport<T extends AssistantChatTransport<UIMessage>>(transport: T): T {
  const transportRef = useRef(transport);
  useEffect(() => { transportRef.current = transport; });
  return useMemo(() => new Proxy(transportRef.current, {
    get(_, prop) {
      const res = (transportRef.current as any)[prop];
      return typeof res === "function" ? res.bind(transportRef.current) : res;
    },
  }) as T, []);
}

// ============================================================================
// Chat Provider
// ============================================================================


interface ChatProviderProps {
  children: ReactNode;
  sessionId?: string;
  characterId?: string;
  initialMessages?: UIMessage[];
}

// =============================================================================
// Streaming Transport with Text Delta Batching
// =============================================================================
// OpenRouter models can emit very small text deltas, which causes excessive
// React re-renders in the browser and Electron shell during long responses.
// This transport coalesces text-delta chunks on the client before they reach
// the runtime while leaving tool events untouched.

const STREAM_BATCH_ENABLED =
  process.env.NEXT_PUBLIC_STREAM_BATCH_ENABLED !== "false";

const envInterval = Number(process.env.NEXT_PUBLIC_STREAM_BATCH_INTERVAL_MS);
const STREAM_BATCH_INTERVAL_MS = Number.isFinite(envInterval)
  ? envInterval
  : 50;

const envMax = Number(process.env.NEXT_PUBLIC_STREAM_BATCH_MAX_CHARS);
const STREAM_BATCH_MAX_CHARS = Number.isFinite(envMax) ? envMax : 4000;

class BufferedAssistantChatTransport extends AssistantChatTransport<UIMessage> {
  protected override processResponseStream(
    stream: ReadableStream<Uint8Array>,
  ): ReadableStream<UIMessageChunk> {
    const baseStream = super.processResponseStream(stream);

    if (!STREAM_BATCH_ENABLED) {
      return baseStream;
    }


    let bufferedDelta = "";
    let lastTextId: string | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let streamErrored = false;

    const clearTimer = () => {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
    };

    const safeEnqueue = (
      controller: TransformStreamDefaultController<UIMessageChunk>,
      chunk: UIMessageChunk,
    ) => {
      if (streamErrored) return false;
      try {
        controller.enqueue(chunk);
        return true;
      } catch {
        streamErrored = true;
        clearTimer();
        bufferedDelta = "";
        return false;
      }
    };

    const flushBuffer = (
      controller: TransformStreamDefaultController<UIMessageChunk>,
    ) => {
      if (!bufferedDelta || !lastTextId) return;
      if (!safeEnqueue(controller, {
        type: "text-delta",
        id: lastTextId,
        delta: bufferedDelta,
      } as UIMessageChunk)) {
        bufferedDelta = "";
        return;
      }
      bufferedDelta = "";
    };

    const scheduleFlush = (
      controller: TransformStreamDefaultController<UIMessageChunk>,
    ) => {
      if (streamErrored) return;
      if (flushTimer) return;
      flushTimer = setTimeout(() => {
        flushTimer = null;
        flushBuffer(controller);
      }, STREAM_BATCH_INTERVAL_MS);
    };

    return baseStream.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (streamErrored) return;
          switch (chunk.type) {
            case "text-start": {
              // Flush anything pending before a new text stream begins.
              flushBuffer(controller);
              lastTextId = chunk.id;
              safeEnqueue(controller, chunk);
              return;
            }
            case "text-delta": {
              lastTextId = chunk.id;
              bufferedDelta += chunk.delta;

              // Flush immediately if the buffer grows too large to avoid UI jank.
              if (bufferedDelta.length >= STREAM_BATCH_MAX_CHARS) {
                clearTimer();
                flushBuffer(controller);
                return;
              }

              scheduleFlush(controller);
              return;
            }
            case "text-end": {
              // Ensure final buffered text is emitted before the end marker.
              clearTimer();
              flushBuffer(controller);
              safeEnqueue(controller, chunk);
              return;
            }
            default: {
              // Tool and control events should not be delayed.
              clearTimer();
              flushBuffer(controller);
              safeEnqueue(controller, chunk);
              return;
            }
          }
        },
        flush(controller) {
          clearTimer();
          flushBuffer(controller);
        },
      }),
    );
  }
}

/**
 * Sanitize initial messages to prevent client-side crashes from incomplete
 * tool calls that were persisted during streaming interruptions.
 *
 * When an Agent SDK stream is interrupted (user navigates away), the last
 * assistant message may contain tool-call parts in "input-available" state
 * with no matching result. The @assistant-ui/react runtime can throw when
 * it encounters these during initialization.
 */
export function sanitizeMessagesForInit(messages: UIMessage[]): UIMessage[] {
  if (!messages || messages.length === 0) return messages;

  return messages.map((msg) => {
    if (msg.role !== "assistant" || !msg.parts || msg.parts.length === 0) {
      return msg;
    }

    // Check if any tool parts have problematic state
    let needsSanitization = false;
    for (const part of msg.parts) {
      if (!part || typeof part !== "object") continue;
      const p = part as Record<string, unknown>;
      // Tool parts have type starting with "tool-" or "dynamic-tool"
      const isToolPart =
        (typeof p.type === "string" && p.type.startsWith("tool-")) ||
        p.type === "dynamic-tool";
      if (!isToolPart) continue;

      const state = p.state as string | undefined;
      // input-streaming = incomplete streaming, input-available without output = pending
      if (state === "input-streaming") {
        needsSanitization = true;
        break;
      }
      if (state === "input-available" && p.output === undefined) {
        // Tool call with args but no result — mark as needing sanitization
        // only if this is the LAST assistant message (active streaming context)
        needsSanitization = true;
        break;
      }
    }

    if (!needsSanitization) return msg;

    // Filter out problematic tool parts
    const sanitizedParts = msg.parts.filter((part) => {
      if (!part || typeof part !== "object") return true;
      const p = part as Record<string, unknown>;
      const isToolPart =
        (typeof p.type === "string" && p.type.startsWith("tool-")) ||
        p.type === "dynamic-tool";
      if (!isToolPart) return true;

      const state = p.state as string | undefined;
      if (state === "input-streaming") {
        console.warn("[ChatProvider] Removing input-streaming tool part:", p.toolCallId);
        return false;
      }
      if (state === "input-available" && p.output === undefined) {
        console.warn("[ChatProvider] Removing dangling input-available tool part:", p.toolCallId);
        return false;
      }
      // Keep all other parts (including input-available with output)
      return true;
    });

    // Ensure we have at least one part
    if (sanitizedParts.length === 0) {
      return {
        ...msg,
        parts: [{ type: "text" as const, text: "" }],
      };
    }

    return sanitizedParts.length !== msg.parts.length
      ? { ...msg, parts: sanitizedParts as UIMessage["parts"] }
      : msg;
  });
}

export const ChatProvider: FC<ChatProviderProps> = ({
  children,
  sessionId,
  characterId,
  initialMessages,
}) => {
  const tAssistant = useTranslations("assistant");
  const tErrors = useTranslations("errors");
  const attachmentAdapter: AttachmentAdapter = useMemo(
    () => ({
      accept: "image/*",

      async *add({ file }): AsyncGenerator<PendingAttachment, void> {
        const id = `${file.name}-${Date.now()}`;
        const localPreviewUrl = URL.createObjectURL(file);

        // First yield: Show uploading state with local preview
        yield {
          id,
          type: "image",
          name: file.name,
          contentType: file.type,
          file,
          content: [
            {
              type: "image",
              image: localPreviewUrl,
            },
          ],
          status: { type: "running", reason: "uploading", progress: 0 },
        };

        // Upload the file
        const formData = new FormData();
        formData.append("file", file);
        if (sessionId) {
          formData.append("sessionId", sessionId);
        }
        formData.append("role", "upload");

        const response = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          // Clean up local URL on error
          URL.revokeObjectURL(localPreviewUrl);
          throw new Error(tAssistant("uploadError"));
        }

        const data = await response.json();

        // Clean up local URL now that we have the remote URL
        URL.revokeObjectURL(localPreviewUrl);

        // Final yield: Upload complete with remote URL
        yield {
          id,
          type: "image",
          name: file.name,
          contentType: file.type,
          file,
          content: [
            {
              type: "image",
              image: data.url,
            },
          ],
          status: { type: "requires-action", reason: "composer-send" },
        };
      },

      async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
        // File was already uploaded in add(), just mark as complete
        return {
          ...attachment,
          content: attachment.content || [],
          status: { type: "complete" },
        };
      },

      async remove(): Promise<void> {
        // No cleanup needed - could delete from S3 if desired
      },
    }),
    [sessionId, tAssistant]
  );



  // Build headers for the chat transport
  const headers: Record<string, string> = {};
  if (sessionId) {
    headers["X-Session-Id"] = sessionId;
  }
  if (characterId) {
    headers["X-Character-Id"] = characterId;
  }
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezone) {
      headers["X-User-Timezone"] = timezone;
    }
  } catch {
    // Ignore timezone detection failures in constrained runtimes.
  }

  const transport = useDynamicChatTransport(
    useMemo(
      () =>
        new BufferedAssistantChatTransport({
          api: "/api/chat",
          headers: Object.keys(headers).length > 0 ? headers : undefined,
        }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [sessionId, characterId],
    ),
  );

  // Sanitize initial messages to prevent crashes from incomplete tool calls
  // persisted during Agent SDK streaming interruptions.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const safeMessages = useMemo(() => sanitizeMessagesForInit(initialMessages ?? []), [initialMessages]);

  const chat = useChat({
    id: sessionId,
    transport,
    messages: safeMessages,
    // Generate UUIDs so client message IDs match the DB format.
    // Without this, AI SDK generates 16-char base62 IDs that fail the server's
    // uuidRegex check, causing the server to assign new UUIDs — the resulting
    // ID mismatch creates phantom branches in assistant-ui's MessageRepository.
    generateId: () => crypto.randomUUID(),
  });

  const runtime = useAISDKRuntime(chat, {
    adapters: { attachments: attachmentAdapter },
  });

  // Connect transport ↔ runtime (same as useChatRuntime does internally)
  useEffect(() => {
    if (transport instanceof AssistantChatTransport) {
      (transport as AssistantChatTransport<UIMessage>).setRuntime(runtime);
    }
  }, [transport, runtime]);

  return (
    <ChatErrorBoundary
      processingText={tAssistant("processingTool")}
      genericError={tErrors("genericRefresh")}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <ChatSetMessagesContext.Provider value={chat.setMessages}>
          <VoiceProvider>
            <DeepResearchProvider sessionId={sessionId}>
              {children}
            </DeepResearchProvider>
          </VoiceProvider>
        </ChatSetMessagesContext.Provider>
      </AssistantRuntimeProvider>
    </ChatErrorBoundary>
  );
};
