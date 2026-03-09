/**
 * Shared text extraction for Claude Code tool results.
 *
 * After normalizeToolResultOutput, results arrive in one of these shapes:
 *   1. Raw string (rare – only during streaming before normalization)
 *   2. MCP content array: { content: [{ type: "text", text: "..." }] }
 *   3. Normalized wrapper: { status: "success", content: "the text" }
 *   4. Text field: { text: "..." }
 *   5. Stdout field: { stdout: "..." }
 *
 * Shape (3) was introduced by unwrapMcpTextWrappedToolResult – the MCP array
 * gets unwrapped to a plain string, then normalizeToolResultOutput wraps it
 * as { content: string }.  All Claude Code tool UIs must handle this shape.
 */
export function parseTextResult(result: unknown): string | undefined {
  if (!result) return undefined;
  if (typeof result === "string") return result;

  if (typeof result === "object") {
    const r = result as Record<string, unknown>;

    if (Array.isArray(r.content)) {
      // MCP content array: [{ type: "text", text: "..." }, ...]
      const textItem = r.content.find(
        (item: unknown) =>
          item && typeof item === "object" && (item as { type?: string }).type === "text"
      ) as { text?: string } | undefined;
      if (textItem?.text) return textItem.text;
    }

    // Normalized wrapper: { content: "the text" }
    if (typeof r.content === "string") return r.content;

    if (typeof r.text === "string") return r.text;
    if (typeof r.stdout === "string") return r.stdout;
    if (typeof r.message === "string") return r.message;
  }

  return undefined;
}
