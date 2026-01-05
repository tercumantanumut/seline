/**
 * Tool Execution Logging
 *
 * Structured logging for tool calls with timing and success/failure tracking.
 */

import type { ToolExecutionOptions } from "ai";

/**
 * Log levels
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Tool execution log entry
 */
export interface ToolLogEntry {
  timestamp: string;
  level: LogLevel;
  toolName: string;
  sessionId?: string;
  event: "start" | "success" | "error" | "retry";
  durationMs?: number;
  args?: Record<string, unknown>;
  result?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Format log entry for console output
 */
function formatLogEntry(entry: ToolLogEntry): string {
  const prefix = `[Tool:${entry.toolName}]`;
  const duration = entry.durationMs ? ` (${entry.durationMs}ms)` : "";

  switch (entry.event) {
    case "start":
      return `${prefix} Starting execution...`;
    case "success":
      return `${prefix} Completed successfully${duration}`;
    case "error":
      return `${prefix} Failed: ${entry.error}${duration}`;
    case "retry":
      return `${prefix} Retrying: ${entry.error}`;
    default:
      return `${prefix} ${entry.event}`;
  }
}

/**
 * Global log handler (can be replaced for custom logging)
 */
let logHandler: (entry: ToolLogEntry) => void = (entry) => {
  const message = formatLogEntry(entry);

  switch (entry.level) {
    case "debug":
      console.debug(message, entry.metadata || "");
      break;
    case "info":
      console.info(message, entry.metadata || "");
      break;
    case "warn":
      console.warn(message, entry.metadata || "");
      break;
    case "error":
      console.error(message, entry.error || "", entry.metadata || "");
      break;
  }
};

/**
 * Set a custom log handler
 */
export function setToolLogHandler(handler: (entry: ToolLogEntry) => void): void {
  logHandler = handler;
}

/**
 * Log a tool execution event
 */
export function logToolEvent(entry: Omit<ToolLogEntry, "timestamp">): void {
  logHandler({
    ...entry,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Create a logger for a specific tool
 */
export function createToolLogger(toolName: string, sessionId?: string) {
  return {
    start(args?: Record<string, unknown>) {
      logToolEvent({
        level: "info",
        toolName,
        sessionId,
        event: "start",
        args,
      });
    },

    success(result: unknown, durationMs: number) {
      logToolEvent({
        level: "info",
        toolName,
        sessionId,
        event: "success",
        durationMs,
        result: summarizeResult(result),
      });
    },

    error(error: unknown, durationMs?: number) {
      logToolEvent({
        level: "error",
        toolName,
        sessionId,
        event: "error",
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
    },

    retry(error: unknown, attempt: number) {
      logToolEvent({
        level: "warn",
        toolName,
        sessionId,
        event: "retry",
        error: error instanceof Error ? error.message : String(error),
        metadata: { attempt },
      });
    },
  };
}

/**
 * Summarize result for logging (avoid logging large payloads)
 */
function summarizeResult(result: unknown): unknown {
  if (result === null || result === undefined) {
    return result;
  }

  if (typeof result === "object" && result !== null) {
    const obj = result as Record<string, unknown>;

    // Summarize arrays
    if (Array.isArray(obj)) {
      return `[Array of ${obj.length} items]`;
    }

    // Summarize known result types
    if ("images" in obj && Array.isArray(obj.images)) {
      return { status: obj.status, imageCount: obj.images.length };
    }
    if ("videos" in obj && Array.isArray(obj.videos)) {
      return { status: obj.status, videoCount: obj.videos.length };
    }
    if ("status" in obj) {
      return { status: obj.status };
    }
  }

  return result;
}

/**
 * Summarize args for logging (avoid storing large payloads like prompts)
 */
function summarizeArgs(args: Record<string, unknown>): Record<string, unknown> {
  const summarized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(args)) {
    if (typeof value === "string" && value.length > 200) {
      // Truncate long strings
      summarized[key] = `${value.slice(0, 200)}... (${value.length} chars)`;
    } else if (Array.isArray(value)) {
      summarized[key] = `[Array of ${value.length} items]`;
    } else if (typeof value === "object" && value !== null) {
      summarized[key] = `{Object with ${Object.keys(value).length} keys}`;
    } else {
      summarized[key] = value;
    }
  }

  return summarized;
}

/**
 * Wrap a tool execute function with automatic logging.
 *
 * This wrapper automatically logs start/success/error events for any tool execution,
 * enabling observability without modifying each tool implementation.
 *
 * @param toolName - Name of the tool for logging
 * @param sessionId - Optional session ID for context
 * @param executeFn - The original execute function to wrap
 * @returns Wrapped execute function with logging
 */
export function withToolLogging<TArgs extends object, TResult>(
  toolName: string,
  sessionId: string | undefined,
  executeFn: (args: TArgs, options?: ToolExecutionOptions) => Promise<TResult>
): (args: TArgs, options?: ToolExecutionOptions) => Promise<TResult> {
  return async (args: TArgs, options?: ToolExecutionOptions): Promise<TResult> => {
    const logger = createToolLogger(toolName, sessionId);
    const startTime = Date.now();

    // Log start with summarized args (cast to Record for summarization)
    logger.start(summarizeArgs(args as Record<string, unknown>));

    try {
      const result = await executeFn(args, options);
      logger.success(result, Date.now() - startTime);
      return result;
    } catch (error) {
      logger.error(error, Date.now() - startTime);
      throw error;
    }
  };
}

