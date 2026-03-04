import type { ContextScope } from "./scoped-counting-contract";

const DELEGATED_TOOL_NAMES = new Set([
  "Task",
  "Agent",
  "TaskCreate",
  "TaskGet",
  "TaskUpdate",
  "TaskList",
  "TaskOutput",
  "TaskStop",
  "EnterWorktree",
]);

function normalizeToolName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.trim();
}

function normalizePassthroughToolName(raw: string): string {
  if (!raw) return "";
  if (raw.startsWith("tool-")) {
    return raw.slice("tool-".length);
  }
  if (raw.startsWith("mcp__seline-platform__")) {
    return raw.slice("mcp__seline-platform__".length);
  }
  return raw;
}

export function isDelegatedToolName(raw: unknown): boolean {
  const normalized = normalizePassthroughToolName(normalizeToolName(raw));
  if (!normalized) return false;
  return DELEGATED_TOOL_NAMES.has(normalized);
}

export function getDefaultScopeFromSessionMetadata(
  sessionMetadata: Record<string, unknown> | null | undefined
): ContextScope {
  return sessionMetadata?.isDelegation === true ? "delegated" : "main";
}
