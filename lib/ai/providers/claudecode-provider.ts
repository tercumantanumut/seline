import { createAnthropic } from "@ai-sdk/anthropic";
import { query as claudeAgentQuery } from "@anthropic-ai/claude-agent-sdk";
import type { LanguageModel } from "ai";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";
import { readClaudeAgentSdkAuthStatus } from "@/lib/auth/claude-agent-sdk-auth";

const CLAUDECODE_MAX_RETRY_ATTEMPTS = 5;
const DEFAULT_MODEL = "claude-sonnet-4-5-20250929";

function sanitizeLoneSurrogates(input: string): { value: string; changed: boolean } {
  let changed = false;
  let output = "";

  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i);

    // Preserve valid surrogate pairs and replace malformed lone surrogates.
    if (code >= 0xd800 && code <= 0xdbff) {
      const nextCode = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
      if (nextCode >= 0xdc00 && nextCode <= 0xdfff) {
        output += input[i] + input[i + 1];
        i += 1;
      } else {
        output += "\ufffd";
        changed = true;
      }
      continue;
    }

    if (code >= 0xdc00 && code <= 0xdfff) {
      output += "\ufffd";
      changed = true;
      continue;
    }

    output += input[i];
  }

  return { value: output, changed };
}

export function sanitizeJsonStringValues(value: unknown): { value: unknown; changed: boolean } {
  if (typeof value === "string") {
    return sanitizeLoneSurrogates(value);
  }

  if (Array.isArray(value)) {
    let changed = false;
    const sanitizedArray = value.map((entry) => {
      const result = sanitizeJsonStringValues(entry);
      changed = changed || result.changed;
      return result.value;
    });
    return { value: sanitizedArray, changed };
  }

  if (value && typeof value === "object") {
    let changed = false;
    const sanitizedObject: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const result = sanitizeJsonStringValues(entry);
      changed = changed || result.changed;
      sanitizedObject[key] = result.value;
    }
    return { value: sanitizedObject, changed };
  }

  return { value, changed: false };
}

function isDictionary(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeToolUseInput(input: unknown): Record<string, unknown> {
  if (isDictionary(input)) {
    return input;
  }

  if (typeof input === "string") {
    try {
      const parsed = JSON.parse(input);
      if (isDictionary(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to placeholder object.
    }
  }

  return {
    _recoveredInvalidToolUseInput: true,
    _inputType: input === null ? "null" : Array.isArray(input) ? "array" : typeof input,
  };
}

export function normalizeAnthropicToolUseInputs(body: Record<string, unknown>): {
  body: Record<string, unknown>;
  fixedCount: number;
} {
  const messages = body.messages;
  if (!Array.isArray(messages)) {
    return { body, fixedCount: 0 };
  }

  let fixedCount = 0;
  const normalizedMessages = messages.map((message) => {
    if (!isDictionary(message) || !Array.isArray(message.content)) {
      return message;
    }

    const normalizedContent = message.content.map((part) => {
      if (!isDictionary(part) || part.type !== "tool_use") {
        return part;
      }

      const normalizedInput = normalizeToolUseInput(part.input);
      if (normalizedInput !== part.input) {
        fixedCount += 1;
      }

      return {
        ...part,
        input: normalizedInput,
      };
    });

    return { ...message, content: normalizedContent };
  });

  return { body: { ...body, messages: normalizedMessages }, fixedCount };
}

function buildSystemPrompt(system: unknown): string | undefined {
  if (typeof system === "string" && system.trim().length > 0) {
    return system;
  }

  if (Array.isArray(system)) {
    const text = system
      .map((entry) => {
        if (isDictionary(entry) && typeof entry.text === "string") {
          return entry.text;
        }
        return "";
      })
      .filter((line) => line.length > 0)
      .join("\n\n")
      .trim();

    if (text.length > 0) {
      return text;
    }
  }

  return undefined;
}

function buildPromptFromMessages(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return "USER: Continue.";
  }

  const lines: string[] = [];

  for (const message of messages) {
    if (!isDictionary(message)) {
      continue;
    }

    const role = message.role === "assistant" ? "ASSISTANT" : "USER";
    const content = message.content;

    if (typeof content === "string" && content.trim().length > 0) {
      lines.push(`${role}: ${content}`);
      continue;
    }

    if (Array.isArray(content)) {
      const fragments: string[] = [];
      for (const part of content) {
        if (!isDictionary(part) || typeof part.type !== "string") {
          continue;
        }

        if (part.type === "text" && typeof part.text === "string") {
          fragments.push(part.text);
        } else if (part.type === "tool_use") {
          const toolName = typeof part.name === "string" ? part.name : "tool";
          fragments.push(`[tool_use:${toolName}]`);
        } else if (part.type === "tool_result") {
          fragments.push("[tool_result]");
        }
      }

      if (fragments.length > 0) {
        lines.push(`${role}: ${fragments.join("\n")}`);
      }
    }
  }

  if (lines.length === 0) {
    return "USER: Continue.";
  }

  return lines.join("\n\n");
}

function isAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("authentication") ||
    lower.includes("auth") ||
    lower.includes("oauth") ||
    lower.includes("login")
  );
}

function createAnthropicMessageResponse(text: string, model: string): Response {
  const outputTokens = Math.max(1, Math.ceil(text.length / 4));

  return new Response(
    JSON.stringify({
      id: `msg_${crypto.randomUUID()}`,
      type: "message",
      role: "assistant",
      model,
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: 0,
        output_tokens: outputTokens,
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    },
  );
}

function createAnthropicStreamResponse(text: string, model: string): Response {
  const messageId = `msg_${crypto.randomUUID()}`;
  const outputTokens = Math.max(1, Math.ceil(text.length / 4));
  const chunks = text.length > 0 ? text.match(/.{1,800}/gs) ?? [text] : [""];

  const events: string[] = [];
  events.push(`event: message_start\ndata: ${JSON.stringify({
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  })}\n\n`);

  events.push(`event: content_block_start\ndata: ${JSON.stringify({
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  })}\n\n`);

  for (const chunk of chunks) {
    events.push(`event: content_block_delta\ndata: ${JSON.stringify({
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: chunk },
    })}\n\n`);
  }

  events.push("event: content_block_stop\ndata: {\"type\":\"content_block_stop\",\"index\":0}\n\n");
  events.push(`event: message_delta\ndata: ${JSON.stringify({
    type: "message_delta",
    delta: { stop_reason: "end_turn", stop_sequence: null },
    usage: { output_tokens: outputTokens },
  })}\n\n`);
  events.push("event: message_stop\ndata: {\"type\":\"message_stop\"}\n\n");

  return new Response(events.join(""), {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

async function runClaudeAgentQuery(options: {
  prompt: string;
  model: string;
  systemPrompt?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const abortController = new AbortController();
  const signal = options.signal;

  const onAbort = () => abortController.abort();
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener("abort", onAbort, { once: true });
    }
  }

  const query = claudeAgentQuery({
    prompt: options.prompt,
    options: {
      abortController,
      cwd: process.cwd(),
      includePartialMessages: true,
      maxTurns: 1,
      model: options.model,
      permissionMode: "default",
      ...(options.systemPrompt ? { systemPrompt: options.systemPrompt } : {}),
    },
  });

  let text = "";
  let sawStreamText = false;

  try {
    for await (const message of query) {
      if (message.type === "stream_event") {
        const event = (message as { event?: unknown }).event;
        if (
          isDictionary(event) &&
          event.type === "content_block_delta" &&
          isDictionary(event.delta) &&
          event.delta.type === "text_delta" &&
          typeof event.delta.text === "string"
        ) {
          sawStreamText = true;
          text += event.delta.text;
        }
        continue;
      }

      if (message.type === "assistant") {
        const assistant = message as {
          message?: {
            content?: Array<{ type?: string; text?: string }>;
          };
          error?: string;
        };

        if (assistant.error === "authentication_failed") {
          throw new Error("authentication_failed");
        }

        // Agent SDK emits both stream deltas and a finalized assistant payload.
        // If we already consumed deltas, skip assistant text to avoid duplicate output.
        if (!sawStreamText) {
          const content = assistant.message?.content;
          if (Array.isArray(content)) {
            for (const part of content) {
              if (part?.type === "text" && typeof part.text === "string") {
                text += part.text;
              }
            }
          }
        }
        continue;
      }

      if (message.type === "result") {
        const result = message as {
          is_error?: boolean;
          subtype?: string;
          result?: string;
          errors?: string[];
        };

        // Some SDK versions include a final textual result summary; only use it
        // when no stream/assistant text was captured.
        if (
          !sawStreamText &&
          text.trim().length === 0 &&
          typeof result.result === "string" &&
          result.result.length > 0
        ) {
          text = result.result;
        }

        if (Array.isArray(result.errors) && result.errors.length > 0) {
          text = `${text}\n${result.errors.join("\n")}`.trim();
        }

        if (result.is_error) {
          throw new Error(result.subtype || "error_during_execution");
        }
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }

  return text.trim();
}

function createClaudeCodeFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept Anthropic API calls.
    if (!url.includes("api.anthropic.com")) {
      return fetch(input, init);
    }

    if (!init?.body || typeof init.body !== "string") {
      return fetch(input, init);
    }

    let parsedBody: Record<string, unknown>;
    try {
      parsedBody = JSON.parse(init.body) as Record<string, unknown>;
    } catch {
      return fetch(input, init);
    }

    const normalizedToolInputs = normalizeAnthropicToolUseInputs(parsedBody);
    if (normalizedToolInputs.fixedCount > 0) {
      console.warn(
        `[ClaudeCode] Normalized ${normalizedToolInputs.fixedCount} invalid tool_use.input payload(s) before Agent SDK call`,
      );
    }

    const sanitizedBody = sanitizeJsonStringValues(normalizedToolInputs.body);
    if (sanitizedBody.changed) {
      console.warn("[ClaudeCode] Replaced lone surrogate characters in request body before Agent SDK call");
    }

    const requestBody = sanitizedBody.value as Record<string, unknown>;
    const prompt = buildPromptFromMessages(requestBody.messages);
    const model = typeof requestBody.model === "string" ? requestBody.model : DEFAULT_MODEL;
    const systemPrompt = buildSystemPrompt(requestBody.system);
    const stream = requestBody.stream === true;

    for (let attempt = 0; ; attempt += 1) {
      try {
        const output = await runClaudeAgentQuery({
          prompt,
          model,
          systemPrompt,
          signal: init.signal ?? undefined,
        });

        return stream
          ? createAnthropicStreamResponse(output, model)
          : createAnthropicMessageResponse(output, model);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        if (isAuthError(message)) {
          const authStatus = await readClaudeAgentSdkAuthStatus({ timeoutMs: 20_000, model });
          if (!authStatus.authenticated) {
            return new Response(
              JSON.stringify({
                error: "Claude Agent SDK authentication required",
                auth: {
                  required: true,
                  url: authStatus.authUrl,
                  output: authStatus.output,
                },
              }),
              {
                status: 401,
                headers: {
                  "Content-Type": "application/json",
                },
              },
            );
          }
        }

        const classification = classifyRecoverability({
          provider: "claudecode",
          error,
          message,
        });

        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS,
          aborted: init.signal?.aborted ?? false,
        });

        if (!retry) {
          throw error;
        }

        const delay = getBackoffDelayMs(attempt);
        console.log("[ClaudeCode] Retrying Agent SDK request", {
          attempt: attempt + 1,
          reason: classification.reason,
          delayMs: delay,
          outcome: "scheduled",
        });
        await sleepWithAbort(delay, init.signal ?? undefined);
      }
    }
  };
}

export function createClaudeCodeProvider(): (modelId: string) => LanguageModel {
  const provider = createAnthropic({
    apiKey: "claude-agent-sdk",
    fetch: createClaudeCodeFetch(),
  });

  return (modelId: string): LanguageModel => {
    return provider(modelId) as unknown as LanguageModel;
  };
}
