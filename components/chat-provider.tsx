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

import { Component, createContext, type ErrorInfo, type FC, type MutableRefObject, type ReactNode, useContext, useEffect, useMemo, useRef } from "react";
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

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
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
  {
    children: ReactNode;
    processingText: string;
    genericError: string;
    recoveryRef?: MutableRefObject<(() => void) | null>;
  },
  ErrorBoundaryState
> {
  private resetTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleRecoverableReset() {
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      // Clear bad state (e.g. broken tool-call argsText) from useChat
      // BEFORE re-rendering children, to prevent the same error re-throwing.
      if (this.props.recoveryRef?.current) {
        try {
          this.props.recoveryRef.current();
        } catch (e) {
          console.warn("[ChatErrorBoundary] Recovery callback failed:", e);
        }
      }
      this.setState({ hasError: false, error: null });
      this.resetTimer = null;
    }, 500);
  }

  private handleAsyncError = (errorLike: unknown): boolean => {
    const error = toError(errorLike);
    if (!isRecoverableStreamingError(error)) {
      return false;
    }
    console.warn("[ChatErrorBoundary] Recoverable async streaming error - will retry", error.message);
    this.setState({ hasError: true, error });
    this.scheduleRecoverableReset();
    return true;
  };

  private onUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (this.handleAsyncError(event.reason)) {
      event.preventDefault();
    }
  };

  private onWindowError = (event: ErrorEvent) => {
    if (this.handleAsyncError(event.error ?? event.message)) {
      event.preventDefault();
    }
  };

  constructor(props: { children: ReactNode; processingText: string; genericError: string }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  componentDidMount() {
    window.addEventListener("unhandledrejection", this.onUnhandledRejection);
    window.addEventListener("error", this.onWindowError);
  }

  componentWillUnmount() {
    window.removeEventListener("unhandledrejection", this.onUnhandledRejection);
    window.removeEventListener("error", this.onWindowError);
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = null;
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (isRecoverableStreamingError(error)) {
      console.warn("[ChatErrorBoundary] Recoverable streaming error - will retry", error.message);
      this.scheduleRecoverableReset();
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

const ChatSessionIdContext = createContext<string | undefined>(undefined);
export const useChatSessionId = () => useContext(ChatSessionIdContext);

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
// This transport coalesces high-frequency text/tool-input delta chunks on the
// client before they reach the runtime to reduce React re-render pressure.

const STREAM_BATCH_ENABLED =
  process.env.NEXT_PUBLIC_STREAM_BATCH_ENABLED !== "false";

const envInterval = Number(process.env.NEXT_PUBLIC_STREAM_BATCH_INTERVAL_MS);
const STREAM_BATCH_INTERVAL_MS = Number.isFinite(envInterval)
  ? envInterval
  : 50;

const envMax = Number(process.env.NEXT_PUBLIC_STREAM_BATCH_MAX_CHARS);
const STREAM_BATCH_MAX_CHARS = Number.isFinite(envMax) ? envMax : 4000;
const TOOL_INPUT_BATCH_ENABLED =
  process.env.NEXT_PUBLIC_TOOL_INPUT_BATCH_ENABLED !== "false";
const envToolInputInterval = Number(process.env.NEXT_PUBLIC_TOOL_INPUT_BATCH_INTERVAL_MS);
const TOOL_INPUT_BATCH_INTERVAL_MS = Number.isFinite(envToolInputInterval)
  ? envToolInputInterval
  : 50;
const envToolInputMax = Number(process.env.NEXT_PUBLIC_TOOL_INPUT_BATCH_MAX_CHARS);
const TOOL_INPUT_BATCH_MAX_CHARS = Number.isFinite(envToolInputMax)
  ? envToolInputMax
  : 8192;
const loggedSanitizerToolCallIds = new Set<string>();

class BufferedAssistantChatTransport extends AssistantChatTransport<UIMessage> {
  private wrapStreamWithRecovery(
    source: ReadableStream<UIMessageChunk>,
  ): ReadableStream<UIMessageChunk> {
    let reader: ReadableStreamDefaultReader<UIMessageChunk> | null = null;
    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        reader = source.getReader();
        const pump = async () => {
          try {
            while (true) {
              const { done, value } = await reader!.read();
              if (done) break;
              controller.enqueue(value);
            }
            controller.close();
          } catch (error) {
            const normalized = toError(error);
            if (isRecoverableStreamingError(normalized)) {
              console.warn("[ChatTransport] Recoverable stream reader error:", normalized.message);
              try {
                controller.close();
              } catch {
                // no-op
              }
            } else {
              controller.error(error);
            }
          } finally {
            try {
              reader?.releaseLock();
            } catch {
              // no-op
            }
          }
        };
        void pump();
      },
      async cancel(reason) {
        try {
          await reader?.cancel(reason);
        } catch {
          // no-op
        }
      },
    });
  }

  protected override processResponseStream(
    stream: ReadableStream<Uint8Array>,
  ): ReadableStream<UIMessageChunk> {
    const baseStream = super.processResponseStream(stream);

    if (!STREAM_BATCH_ENABLED) {
      return this.wrapStreamWithRecovery(baseStream);
    }


    let bufferedDelta = "";
    let lastTextId: string | null = null;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;
    let streamErrored = false;
    const toolInputBuffers = new Map<
      string,
      { delta: string; timer: ReturnType<typeof setTimeout> | null }
    >();
    let rawToolInputDeltaChunks = 0;
    let emittedToolInputDeltaChunks = 0;

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

    const getToolInputBuffer = (toolCallId: string) => {
      const existing = toolInputBuffers.get(toolCallId);
      if (existing) return existing;
      const created = { delta: "", timer: null as ReturnType<typeof setTimeout> | null };
      toolInputBuffers.set(toolCallId, created);
      return created;
    };

    const clearToolInputTimer = (toolCallId: string) => {
      const buffered = toolInputBuffers.get(toolCallId);
      if (!buffered?.timer) return;
      clearTimeout(buffered.timer);
      buffered.timer = null;
    };

    const flushToolInputBuffer = (
      toolCallId: string,
      controller: TransformStreamDefaultController<UIMessageChunk>,
    ) => {
      const buffered = toolInputBuffers.get(toolCallId);
      if (!buffered || buffered.delta.length === 0) return;
      clearToolInputTimer(toolCallId);
      if (!safeEnqueue(controller, {
        type: "tool-input-delta",
        toolCallId,
        inputTextDelta: buffered.delta,
      } as UIMessageChunk)) {
        buffered.delta = "";
        return;
      }
      emittedToolInputDeltaChunks += 1;
      buffered.delta = "";
    };

    const flushAllToolInputBuffers = (
      controller: TransformStreamDefaultController<UIMessageChunk>,
    ) => {
      for (const toolCallId of toolInputBuffers.keys()) {
        flushToolInputBuffer(toolCallId, controller);
      }
    };

    const clearAllToolInputBuffers = () => {
      for (const [toolCallId, buffered] of toolInputBuffers.entries()) {
        if (buffered.timer) {
          clearTimeout(buffered.timer);
        }
        toolInputBuffers.delete(toolCallId);
      }
    };

    const bufferToolInputDelta = (
      toolCallId: string,
      delta: string,
      controller: TransformStreamDefaultController<UIMessageChunk>,
    ) => {
      rawToolInputDeltaChunks += 1;
      if (!TOOL_INPUT_BATCH_ENABLED) {
        safeEnqueue(controller, {
          type: "tool-input-delta",
          toolCallId,
          inputTextDelta: delta,
        } as UIMessageChunk);
        emittedToolInputDeltaChunks += 1;
        return;
      }

      const buffered = getToolInputBuffer(toolCallId);
      buffered.delta += delta;

      if (buffered.delta.length >= TOOL_INPUT_BATCH_MAX_CHARS) {
        flushToolInputBuffer(toolCallId, controller);
        return;
      }

      if (!buffered.timer) {
        buffered.timer = setTimeout(() => {
          const state = toolInputBuffers.get(toolCallId);
          if (!state) return;
          state.timer = null;
          flushToolInputBuffer(toolCallId, controller);
        }, TOOL_INPUT_BATCH_INTERVAL_MS);
      }
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

    // Track tool call IDs that received streaming input deltas.
    // When a "tool-input-available" arrives for one of these, the
    // structured input may conflict with the accumulated argsText
    // (e.g. {} vs {"questions":[...]}) — causing @assistant-ui/react
    // to throw "argsText can only be appended, not updated".
    // We drop the conflicting "tool-input-available" so the runtime
    // finalizes from the streaming deltas instead.
    const toolCallsWithDeltas = new Set<string>();

    const bufferedStream = baseStream.pipeThrough(
      new TransformStream<UIMessageChunk, UIMessageChunk>({
        transform(chunk, controller) {
          if (streamErrored) return;
          switch (chunk.type) {
            case "text-start": {
              // Flush anything pending before a new text stream begins.
              flushAllToolInputBuffers(controller);
              flushBuffer(controller);
              lastTextId = chunk.id;
              safeEnqueue(controller, chunk);
              return;
            }
            case "text-delta": {
              flushAllToolInputBuffers(controller);
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
              flushAllToolInputBuffers(controller);
              flushBuffer(controller);
              safeEnqueue(controller, chunk);
              return;
            }
            case "tool-input-delta": {
              // Track that this tool call had streaming deltas.
              const deltaChunk = chunk as UIMessageChunk & {
                toolCallId?: string;
                inputTextDelta?: string;
                delta?: string;
              };
              if (deltaChunk.toolCallId) toolCallsWithDeltas.add(deltaChunk.toolCallId);
              clearTimer();
              flushBuffer(controller);
              const deltaText =
                typeof deltaChunk.inputTextDelta === "string"
                  ? deltaChunk.inputTextDelta
                  : typeof deltaChunk.delta === "string"
                    ? deltaChunk.delta
                    : "";
              if (!deltaChunk.toolCallId || !deltaText) {
                safeEnqueue(controller, chunk);
                return;
              }
              bufferToolInputDelta(deltaChunk.toolCallId, deltaText, controller);
              return;
            }
            case "tool-input-available": {
              flushAllToolInputBuffers(controller);
              // If this tool call already received streaming deltas, the
              // structured input may conflict with accumulated argsText.
              // Drop it to prevent the "argsText can only be appended" crash.
              const availChunk = chunk as UIMessageChunk & { toolCallId: string };
              if (availChunk.toolCallId && toolCallsWithDeltas.has(availChunk.toolCallId)) {
                console.warn(
                  `[ChatTransport] Dropping conflicting tool-input-available for ${availChunk.toolCallId} ` +
                    `(had prior streaming deltas). Runtime will finalize from deltas.`
                );
                toolCallsWithDeltas.delete(availChunk.toolCallId);
                return; // Drop this chunk
              }
              clearTimer();
              flushBuffer(controller);
              safeEnqueue(controller, chunk);
              return;
            }
            case "tool-input-error": {
              flushAllToolInputBuffers(controller);
              // Same as tool-input-available: if this tool call had streaming
              // deltas, dropping the error chunk prevents argsText reset.
              // The subsequent tool-output-error will preserve the streamed input.
              const errChunk = chunk as UIMessageChunk & { toolCallId: string };
              if (errChunk.toolCallId && toolCallsWithDeltas.has(errChunk.toolCallId)) {
                console.warn(
                  `[ChatTransport] Dropping tool-input-error for ${errChunk.toolCallId} ` +
                    `(had prior streaming deltas). Subsequent tool-output-error will preserve input.`
                );
                toolCallsWithDeltas.delete(errChunk.toolCallId);
                return;
              }
              clearTimer();
              flushBuffer(controller);
              safeEnqueue(controller, chunk);
              return;
            }
            default: {
              // Tool and control events should not be delayed.
              clearTimer();
              flushAllToolInputBuffers(controller);
              flushBuffer(controller);
              safeEnqueue(controller, chunk);
              return;
            }
          }
        },
        flush(controller) {
          clearTimer();
          flushAllToolInputBuffers(controller);
          flushBuffer(controller);
          if (
            TOOL_INPUT_BATCH_ENABLED &&
            rawToolInputDeltaChunks > 0 &&
            process.env.NODE_ENV !== "production"
          ) {
            console.log(
              `[ChatTransport] tool-input-delta batching: raw=${rawToolInputDeltaChunks}, emitted=${emittedToolInputDeltaChunks}`,
            );
          }
          clearAllToolInputBuffers();
        },
      }),
    );
    return this.wrapStreamWithRecovery(bufferedStream);
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
      const toolCallId =
        typeof p.toolCallId === "string" ? p.toolCallId : "unknown-tool-call";
      if (state === "input-streaming") {
        const key = `input-streaming:${toolCallId}`;
        if (!loggedSanitizerToolCallIds.has(key)) {
          loggedSanitizerToolCallIds.add(key);
          console.warn("[ChatProvider] Removing input-streaming tool part:", toolCallId);
        }
        return false;
      }
      if (state === "input-available" && p.output === undefined) {
        const key = `input-available:${toolCallId}`;
        if (!loggedSanitizerToolCallIds.has(key)) {
          loggedSanitizerToolCallIds.add(key);
          console.warn("[ChatProvider] Removing dangling input-available tool part:", toolCallId);
        }
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

  // Recovery callback: sanitize messages to clear broken tool-call state
  // so the error boundary can re-render without hitting the same error.
  const recoveryRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    recoveryRef.current = () => {
      chat.setMessages((prev) => sanitizeMessagesForInit(prev));
    };
    return () => {
      recoveryRef.current = null;
    };
  }, [chat]);

  return (
    <ChatErrorBoundary
      processingText={tAssistant("processingTool")}
      genericError={tErrors("genericRefresh")}
      recoveryRef={recoveryRef}
    >
      <AssistantRuntimeProvider runtime={runtime}>
        <ChatSessionIdContext.Provider value={sessionId}>
          <ChatSetMessagesContext.Provider value={chat.setMessages}>
            <VoiceProvider>
              <DeepResearchProvider sessionId={sessionId}>
                {children}
              </DeepResearchProvider>
            </VoiceProvider>
          </ChatSetMessagesContext.Provider>
        </ChatSessionIdContext.Provider>
      </AssistantRuntimeProvider>
    </ChatErrorBoundary>
  );
};
