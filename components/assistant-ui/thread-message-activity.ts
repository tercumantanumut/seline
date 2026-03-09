import type { LiveToolStatus } from "./tool-live-status";
import {
  getFallbackToolPhase,
  summarizeToolInput,
  summarizeToolOutputByName,
} from "./tool-live-status";
import { getCanonicalToolName } from "./tool-name-utils";

export const SYNTHETIC_THINKING_IDLE_DELAY_MS = 10_000;

type MessageStatusLike = { type?: string } | null | undefined;

type ToolBadgeStatus = "running" | "completed" | "error";

interface MessagePartLike {
  type?: string;
  text?: string;
}

interface ToolCallPartLike extends MessagePartLike {
  toolCallId?: string;
  toolName?: string;
  status?: { type?: string };
  result?: unknown;
  input?: unknown;
  args?: unknown;
  argsText?: string;
  isError?: boolean;
}

function asParts(parts: unknown): MessagePartLike[] {
  if (!Array.isArray(parts)) return [];
  return parts.filter(
    (part): part is MessagePartLike => !!part && typeof part === "object"
  );
}

function getToolBadgeStatus(part: ToolCallPartLike): ToolBadgeStatus {
  if (part.status?.type === "incomplete") return "error";
  if (part.status?.type === "running" || part.status?.type === "requires-action") {
    return "running";
  }

  const result = part.result as Record<string, unknown> | undefined;
  const status = typeof result?.status === "string" ? result.status.toLowerCase() : undefined;

  if (
    part.isError ||
    status === "error" ||
    status === "failed" ||
    status === "denied" ||
    typeof result?.error === "string"
  ) {
    return "error";
  }
  if (part.result === undefined || status === "processing") return "running";
  return "completed";
}

function getResultCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const record = result as Record<string, unknown>;

  if (Array.isArray(record.sources)) return record.sources.length;
  if (Array.isArray(record.results)) return record.results.length;
  if (Array.isArray(record.images)) return record.images.length;
  if (Array.isArray(record.videos)) return record.videos.length;
  if (typeof record.matchCount === "number") return record.matchCount;

  return null;
}

export function hasVisibleText(parts: unknown): boolean {
  return asParts(parts).some(
    (part) => part.type === "text" && typeof part.text === "string" && part.text.length > 0
  );
}

export function isMessageInitiallyThinking(
  status: MessageStatusLike,
  parts: unknown
): boolean {
  if (status?.type !== "running") return false;
  return !hasVisibleText(parts);
}

export function getVisibleTextSignature(parts: unknown): string {
  return asParts(parts)
    .filter(
      (part): part is MessagePartLike & { type: "text"; text: string } =>
        part.type === "text" && typeof part.text === "string"
    )
    .map((part) => {
      const text = part.text;
      return `${text.length}:${text.slice(-120)}`;
    })
    .join("|");
}

export function getVisibleToolSignature(
  parts: unknown,
  liveStatuses: Record<string, LiveToolStatus | undefined> = {}
): string {
  return asParts(parts)
    .filter((part): part is ToolCallPartLike => part.type === "tool-call")
    .map((part, index) => {
      const canonicalToolName = getCanonicalToolName(part.toolName || "unknown");
      const badgeStatus = getToolBadgeStatus(part);
      const liveStatus = part.toolCallId ? liveStatuses[part.toolCallId] : undefined;
      const phase = liveStatus?.phase ?? getFallbackToolPhase(part.result, badgeStatus === "running");
      const detail = liveStatus?.detail ?? "";
      const inputPreview =
        liveStatus?.argsPreview ??
        summarizeToolInput(part.input ?? part.args ?? part.argsText) ??
        "";
      const outputPreview = liveStatus?.outputPreview ?? summarizeToolOutputByName(canonicalToolName, part.result) ?? "";
      const count = getResultCount(part.result);

      return [
        part.toolCallId ?? `tool-${index}`,
        canonicalToolName,
        phase,
        detail,
        inputPreview,
        outputPreview,
        count ?? "",
      ].join(":");
    })
    .join("||");
}

export function getVisibleActivitySignature(
  parts: unknown,
  liveStatuses: Record<string, LiveToolStatus | undefined> = {}
): string {
  return [getVisibleTextSignature(parts), getVisibleToolSignature(parts, liveStatuses)].join("@@");
}

export function shouldShowIdleThinking(
  status: MessageStatusLike,
  lastVisibleActivityAt: number | null,
  now: number,
  delayMs: number = SYNTHETIC_THINKING_IDLE_DELAY_MS
): boolean {
  if (status?.type !== "running") return false;
  if (lastVisibleActivityAt === null) return false;
  return now - lastVisibleActivityAt >= delayMs;
}
