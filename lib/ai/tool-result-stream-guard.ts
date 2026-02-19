import { estimateTokens } from "@/lib/ai/output-limiter";

export const MIN_STREAM_TOOL_RESULT_TOKENS = 1;

interface OversizedToolResult {
  status: "error";
  error: string;
  summary: string;
  toolName: string;
  tokenLimit: number;
  estimatedTokens: number;
  oversizedForStreaming: true;
  metadata?: Record<string, unknown>;
  logId?: string;
  truncatedContentId?: string;
}

export interface GuardToolResultForStreamingResult {
  blocked: boolean;
  estimatedTokens: number;
  result: unknown;
}

export interface GuardToolResultForStreamingOptions {
  maxTokens?: number;
  metadata?: Record<string, unknown>;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function estimateTokensSafely(content: unknown): number {
  try {
    return estimateTokens(content);
  } catch {
    const fallback = typeof content === "string" ? content : safeStringify(content);
    return Math.ceil(fallback.length / 4);
  }
}

function normalizeTokenLimit(maxTokens?: number): number {
  if (typeof maxTokens !== "number" || !Number.isFinite(maxTokens)) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Math.max(MIN_STREAM_TOOL_RESULT_TOKENS, Math.floor(maxTokens));
}

function extractRetrievalIds(result: unknown): {
  logId?: string;
  truncatedContentId?: string;
} {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    return {};
  }

  const record = result as Record<string, unknown>;
  const logId = typeof record.logId === "string" ? record.logId : undefined;
  const truncatedContentId =
    typeof record.truncatedContentId === "string" ? record.truncatedContentId : undefined;

  return {
    logId,
    truncatedContentId,
  };
}

function buildOversizedToolResult(
  toolName: string,
  estimatedTokens: number,
  tokenLimit: number,
  rawResult: unknown,
  metadata?: Record<string, unknown>
): OversizedToolResult {
  const safeToolName = toolName || "tool";
  const retrieval = extractRetrievalIds(rawResult);
  const sourceFileName =
    metadata && typeof metadata.sourceFileName === "string" ? metadata.sourceFileName : undefined;

  let error =
    `Tool output from ${safeToolName} exceeded the remaining context budget ` +
    `(~${estimatedTokens.toLocaleString()} tokens, allowed: ${tokenLimit.toLocaleString()}). ` +
    `Streaming continued, but this tool result was replaced with a validation error. `;

  if (sourceFileName) {
    error += `Source file: ${sourceFileName}. `;
  }

  if (retrieval.logId) {
    error +=
      `Full output is still available via executeCommand({ command: "readLog", logId: "${retrieval.logId}" }). `;
  }

  if (retrieval.truncatedContentId) {
    error +=
      `Truncated content is available via retrieveFullContent({ contentId: "${retrieval.truncatedContentId}" }). `;
  }

  error +=
    safeToolName === "executeCommand"
      ? "Narrow the command scope (filters, head/tail, specific paths) and retry."
      : "Refine the request and retry with a smaller result scope.";

  return {
    status: "error",
    error,
    summary: `${safeToolName} output exceeded context budget and was validated`,
    toolName: safeToolName,
    tokenLimit,
    estimatedTokens,
    oversizedForStreaming: true,
    ...(metadata ? { metadata } : {}),
    ...(retrieval.logId ? { logId: retrieval.logId } : {}),
    ...(retrieval.truncatedContentId ? { truncatedContentId: retrieval.truncatedContentId } : {}),
  };
}

export function guardToolResultForStreaming(
  toolName: string,
  result: unknown,
  options: GuardToolResultForStreamingOptions = {}
): GuardToolResultForStreamingResult {
  const estimatedTokens = estimateTokensSafely(result);
  const tokenLimit = normalizeTokenLimit(options.maxTokens);

  if (estimatedTokens <= tokenLimit) {
    return {
      blocked: false,
      estimatedTokens,
      result,
    };
  }

  return {
    blocked: true,
    estimatedTokens,
    result: buildOversizedToolResult(toolName, estimatedTokens, tokenLimit, result, options.metadata),
  };
}
