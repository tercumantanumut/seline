import { estimateTokens } from "@/lib/ai/output-limiter";

export const MAX_STREAM_TOOL_RESULT_TOKENS = 25_000;

interface OversizedToolResult {
  status: "error";
  error: string;
  summary: string;
  toolName: string;
  tokenLimit: number;
  estimatedTokens: number;
  oversizedForStreaming: true;
}

export interface GuardToolResultForStreamingResult {
  blocked: boolean;
  estimatedTokens: number;
  result: unknown;
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

function buildOversizedToolResult(toolName: string, estimatedTokens: number): OversizedToolResult {
  const safeToolName = toolName || "tool";
  const baseMessage =
    `Tool output from ${safeToolName} was too large (~${estimatedTokens.toLocaleString()} tokens) ` +
    `and was not returned to keep streaming stable (limit: ${MAX_STREAM_TOOL_RESULT_TOKENS.toLocaleString()} tokens).`;

  const guidance =
    safeToolName === "executeCommand"
      ? "Use a narrower command (filters, head/tail, or a smaller path), then try again."
      : "Refine the query to request a smaller, focused result and try again.";

  return {
    status: "error",
    error: `${baseMessage} ${guidance}`,
    summary: `${safeToolName} output blocked because it exceeded streaming limits`,
    toolName: safeToolName,
    tokenLimit: MAX_STREAM_TOOL_RESULT_TOKENS,
    estimatedTokens,
    oversizedForStreaming: true,
  };
}

export function guardToolResultForStreaming(
  toolName: string,
  result: unknown
): GuardToolResultForStreamingResult {
  const estimatedTokens = estimateTokensSafely(result);

  if (estimatedTokens <= MAX_STREAM_TOOL_RESULT_TOKENS) {
    return {
      blocked: false,
      estimatedTokens,
      result,
    };
  }

  return {
    blocked: true,
    estimatedTokens,
    result: buildOversizedToolResult(toolName, estimatedTokens),
  };
}
