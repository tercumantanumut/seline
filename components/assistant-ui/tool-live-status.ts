"use client";

import { useEffect, useMemo, useState } from "react";
import type { TaskEvent, TaskProgressEvent } from "@/lib/background-tasks/types";
import { getCanonicalToolName } from "./tool-name-utils";

export type LiveToolPhase = "preparing" | "running" | "completed" | "error";

export interface LiveToolStatus {
  toolCallId?: string;
  toolName: string;
  canonicalToolName: string;
  phase: LiveToolPhase;
  label: string;
  detail?: string;
  argsPreview?: string;
  outputPreview?: string;
  updatedAt: number;
}

interface ProgressToolPartLike {
  type?: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  status?: string;
  input?: unknown;
  args?: unknown;
  argsText?: string;
  result?: unknown;
  output?: unknown;
  errorText?: string;
}

function isProgressTruncatedMarker(value: unknown): value is {
  _progressTruncated: true;
  summary?: unknown;
} {
  return !!value && typeof value === "object" && (value as { _progressTruncated?: unknown })._progressTruncated === true;
}

function summarizeString(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) return compact;
  return `${compact.slice(0, Math.max(0, maxLength - 3))}...`;
}

export function summarizeToolValue(value: unknown, maxLength: number = 120): string | undefined {
  if (value === undefined || value === null) return undefined;

  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? summarizeString(trimmed, maxLength) : undefined;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    const first = summarizeToolValue(value[0], Math.max(32, Math.floor(maxLength / 2)));
    return first ? `${value.length} items - ${first}` : `${value.length} items`;
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (isProgressTruncatedMarker(record)) {
      if (typeof record.summary === "string" && record.summary.trim()) {
        return summarizeString(record.summary, maxLength);
      }
      return "Truncated for progress display";
    }
    if (Array.isArray(record.images)) return `${record.images.length} image${record.images.length === 1 ? "" : "s"}`;
    if (Array.isArray(record.videos)) return `${record.videos.length} video${record.videos.length === 1 ? "" : "s"}`;
    if (Array.isArray(record.sources)) return `${record.sources.length} source${record.sources.length === 1 ? "" : "s"}`;
    if (typeof record.message === "string") return summarizeString(record.message, maxLength);
    if (typeof record.summary === "string") return summarizeString(record.summary, maxLength);
    if (typeof record.text === "string") return summarizeString(record.text, maxLength);
    if (typeof record.stdout === "string") return summarizeString(record.stdout, maxLength);
    if (typeof record.error === "string") return summarizeString(record.error, maxLength);
    if (typeof record.errorText === "string") return summarizeString(record.errorText, maxLength);

    try {
      return summarizeString(JSON.stringify(value), maxLength);
    } catch {
      return summarizeString(String(value), maxLength);
    }
  }

  return summarizeString(String(value), maxLength);
}

/**
 * Extract a clean pill summary for known provider tool shapes (Claude Code, etc.).
 * Returns undefined if the tool isn't recognized, so callers can fall back
 * to the generic `summarizeToolInput`.
 */
export function summarizeToolInputByName(toolName: string, value: unknown): string | undefined {
  if (!value || typeof value !== "object") return summarizeToolInput(value);

  const args = value as Record<string, unknown>;

  switch (toolName) {
    case "Edit": {
      const fp = typeof args.file_path === "string" ? args.file_path : undefined;
      return fp ? fp.split("/").pop() || fp : summarizeToolInput(value);
    }
    case "Bash": {
      if (typeof args.description === "string" && args.description.trim()) {
        return summarizeString(args.description.trim(), 96);
      }
      if (typeof args.command === "string") {
        return summarizeString(args.command, 96);
      }
      return summarizeToolInput(value);
    }
    case "Read": {
      const fp = typeof args.file_path === "string" ? args.file_path : undefined;
      if (!fp) return summarizeToolInput(value);
      const name = fp.split("/").pop() || fp;
      if (typeof args.offset === "number" || typeof args.limit === "number") {
        return `${name} (L${args.offset ?? 1}${args.limit ? `–${(args.offset as number ?? 1) + (args.limit as number)}` : ""})`;
      }
      return name;
    }
    case "Write": {
      const fp = typeof args.file_path === "string" ? args.file_path : undefined;
      return fp ? fp.split("/").pop() || fp : summarizeToolInput(value);
    }
    case "Glob": {
      return typeof args.pattern === "string" ? args.pattern : summarizeToolInput(value);
    }
    case "Grep": {
      const pattern = typeof args.pattern === "string" ? args.pattern : undefined;
      if (!pattern) return summarizeToolInput(value);
      const path = typeof args.path === "string" ? args.path.split("/").pop() : undefined;
      return path ? `${pattern} in ${path}` : pattern;
    }
    case "Agent": {
      if (typeof args.description === "string" && args.description.trim()) {
        return summarizeString(args.description.trim(), 96);
      }
      return summarizeToolInput(value);
    }
    case "WebFetch": {
      if (typeof args.url === "string") {
        try { return new URL(args.url).hostname; } catch { /* ignore */ }
        return summarizeString(args.url, 96);
      }
      return summarizeToolInput(value);
    }
    case "WebSearch": {
      return typeof args.query === "string" ? summarizeString(args.query, 96) : summarizeToolInput(value);
    }
    case "NotebookEdit": {
      const fp = typeof args.notebook_path === "string" ? args.notebook_path : undefined;
      return fp ? fp.split("/").pop() || fp : summarizeToolInput(value);
    }
    case "TodoWrite": {
      return "Task list update";
    }
    case "EnterPlanMode": {
      return "Planning mode";
    }
    case "ExitPlanMode": {
      return "Plan approval";
    }
    case "EnterWorktree": {
      const name = typeof args.name === "string" ? args.name : undefined;
      return name ? `Worktree: ${name}` : "Create worktree";
    }
    case "AskUserQuestion": {
      return "Asking question";
    }
    case "Skill": {
      return typeof args.skill === "string" ? args.skill : summarizeToolInput(value);
    }
    default:
      return summarizeToolInput(value);
  }
}

export function summarizeToolInput(value: unknown): string | undefined {
  return summarizeToolValue(value, 96);
}

export function summarizeToolOutput(value: unknown): string | undefined {
  return summarizeToolValue(value, 120);
}

function asProgressToolPart(part: unknown): ProgressToolPartLike | null {
  if (!part || typeof part !== "object") return null;
  return part as ProgressToolPartLike;
}

function getLatestToolPart(event: TaskProgressEvent): ProgressToolPartLike | null {
  const parts = Array.isArray(event.progressContent) ? event.progressContent : [];
  for (let index = parts.length - 1; index >= 0; index -= 1) {
    const part = asProgressToolPart(parts[index]);
    if (part?.type === "tool-result" || part?.type === "tool-call") {
      return part;
    }
  }
  return null;
}

function getToolScopedProgressDetail(event: TaskProgressEvent, toolName: string): string | undefined {
  const progressLabel = typeof event.progressText === "string" ? event.progressText.trim() : "";
  if (!progressLabel) return undefined;

  const lower = progressLabel.toLowerCase();
  const canonicalToolName = getCanonicalToolName(toolName).toLowerCase();
  const rawToolName = toolName.toLowerCase();

  // Ignore generic assistant prose snapshots; they often represent the final
  // response body rather than the active tool state.
  if (
    lower.startsWith("running ") ||
    lower.startsWith("preparing ") ||
    lower.includes(rawToolName) ||
    lower.includes(canonicalToolName)
  ) {
    return progressLabel;
  }

  return undefined;
}

function buildLiveStatusFromProgress(event: TaskProgressEvent): LiveToolStatus | null {
  const part = getLatestToolPart(event);
  if (!part?.toolName || typeof part.toolName !== "string") return null;

  const canonicalToolName = getCanonicalToolName(part.toolName);
  const scopedDetail = getToolScopedProgressDetail(event, part.toolName);

  if (part.type === "tool-result") {
    const rawStatus = typeof part.status === "string" ? part.status.toLowerCase() : "";
    const resultRecord = part.result && typeof part.result === "object"
      ? (part.result as Record<string, unknown>)
      : undefined;
    const isError =
      rawStatus === "error" ||
      rawStatus === "failed" ||
      rawStatus === "denied" ||
      typeof part.errorText === "string" ||
      typeof resultRecord?.error === "string";
    return {
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      canonicalToolName,
      phase: isError ? "error" : "completed",
      label: isError ? "Failed" : "Completed",
      detail: typeof part.errorText === "string" ? summarizeString(part.errorText, 120) : scopedDetail,
      outputPreview: summarizeToolOutput(part.result ?? part.output),
      updatedAt: Date.now(),
    };
  }

  const rawState = typeof part.state === "string" ? part.state : "";
  const phase: LiveToolPhase = rawState === "input-streaming" || rawState === "input-available"
    ? "preparing"
    : "running";
  const inputPreviewValue = part.input ?? part.args ?? part.argsText;
  const isTruncatedPreview = isProgressTruncatedMarker(inputPreviewValue);

  return {
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    canonicalToolName,
    phase,
    label: phase === "preparing" ? "Preparing" : "Running",
    detail: scopedDetail,
    argsPreview: isTruncatedPreview ? undefined : summarizeToolInput(inputPreviewValue),
    updatedAt: Date.now(),
  };
}

export function getFallbackToolPhase(result: unknown, isRunning: boolean): LiveToolPhase {
  if (isRunning) return "running";
  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : undefined;
  const status = typeof record?.status === "string" ? record.status.toLowerCase() : undefined;
  if (status === "error" || status === "failed" || status === "denied" || typeof record?.error === "string") {
    return "error";
  }
  return "completed";
}

export function useLiveToolStatuses(sessionId: string | undefined) {
  const [statusByToolCallId, setStatusByToolCallId] = useState<Record<string, LiveToolStatus>>({});

  useEffect(() => {
    if (!sessionId || typeof window === "undefined") return;

    const handleProgress = (event: Event) => {
      const detail = (event as CustomEvent<TaskEvent>).detail;
      if (!detail || detail.eventType !== "task:progress" || detail.sessionId !== sessionId) return;

      const status = buildLiveStatusFromProgress(detail);
      if (!status || !status.toolCallId) return;
      if (detail.progressContentProjectionOnly && detail.progressContentLimited && status.phase !== "completed" && status.phase !== "error") {
        return;
      }

      setStatusByToolCallId((previous) => {
        const existing = previous[status.toolCallId!];
        if (
          existing &&
          existing.phase === status.phase &&
          existing.label === status.label &&
          existing.detail === status.detail &&
          existing.argsPreview === status.argsPreview &&
          existing.outputPreview === status.outputPreview
        ) {
          return previous;
        }
        return {
          ...previous,
          [status.toolCallId!]: status,
        };
      });
    };

    window.addEventListener("background-task-progress", handleProgress as EventListener);
    return () => window.removeEventListener("background-task-progress", handleProgress as EventListener);
  }, [sessionId]);

  return useMemo(() => statusByToolCallId, [statusByToolCallId]);
}
