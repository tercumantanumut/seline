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

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isDelegatedToolName(raw: unknown): boolean {
  const normalized = normalizePassthroughToolName(normalizeToolName(raw));
  if (!normalized) return false;
  return DELEGATED_TOOL_NAMES.has(normalized);
}

export function isDelegatedSubagentIntermediateResult(part: unknown): boolean {
  if (!isObjectLike(part)) return false;
  if (part.type !== "tool-result") return false;
  if (part.toolName !== "delegateToSubagent") return false;
  if (!isObjectLike(part.result)) return false;
  return part.result.running === true && part.result.completed !== true;
}

export function getDefaultScopeFromSessionMetadata(
  sessionMetadata: Record<string, unknown> | null | undefined
): ContextScope {
  return sessionMetadata?.isDelegation === true ? "delegated" : "main";
}
