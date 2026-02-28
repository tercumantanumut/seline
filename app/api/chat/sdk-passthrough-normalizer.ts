import { normalizeToolResultOutput } from "@/lib/ai/tool-result-utils";

function toCanonicalToolName(name: string): string {
  const match = /^mcp__.+?__(.+)$/.exec(name);
  return match?.[1] || name;
}

/**
 * Normalize Claude SDK passthrough outputs into the same canonical shape
 * used by persisted tool-result history.
 */
export function normalizeSdkPassthroughOutput(
  toolName: string,
  output: unknown,
  input: unknown
): Record<string, unknown> {
  const normalizedToolName = toCanonicalToolName(toolName || "tool");
  return normalizeToolResultOutput(normalizedToolName, output, input, {
    mode: "canonical",
  }).output;
}

