const INTERNAL_TOOL_HISTORY_PREFIX = "[Previous ";

export function isInternalToolHistoryLeakText(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed.startsWith(INTERNAL_TOOL_HISTORY_PREFIX)) {
    return false;
  }

  if (!trimmed.includes("call_id=")) {
    return false;
  }

  return (
    trimmed.includes(" result;") ||
    trimmed.includes(" call omitted") ||
    trimmed.includes("result; call_id=") ||
    trimmed.includes("missing output")
  );
}
