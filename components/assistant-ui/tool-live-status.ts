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

function buildLiveStatusFromProgress(event: TaskProgressEvent): LiveToolStatus | null {
  const part = getLatestToolPart(event);
  if (!part?.toolName || typeof part.toolName !== "string") return null;

  const canonicalToolName = getCanonicalToolName(part.toolName);
  const progressLabel = typeof event.progressText === "string" ? event.progressText.trim() : "";
  const fallbackDetail = progressLabel || undefined;

  if (part.type === "tool-result") {
    const rawStatus = typeof part.status === "string" ? part.status.toLowerCase() : "";
    const isError = rawStatus === "error" || rawStatus === "failed" || rawStatus === "denied" || typeof part.errorText === "string";
    return {
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      canonicalToolName,
      phase: isError ? "error" : "completed",
      label: isError ? "Failed" : "Completed",
      detail: typeof part.errorText === "string" ? summarizeString(part.errorText, 120) : fallbackDetail,
      outputPreview: summarizeToolOutput(part.result ?? part.output),
      updatedAt: Date.now(),
    };
  }

  const rawState = typeof part.state === "string" ? part.state : "";
  const phase: LiveToolPhase = rawState === "input-streaming" || rawState === "input-available"
    ? "preparing"
    : "running";

  return {
    toolCallId: part.toolCallId,
    toolName: part.toolName,
    canonicalToolName,
    phase,
    label: phase === "preparing" ? "Preparing" : "Running",
    detail: fallbackDetail,
    argsPreview: summarizeToolInput(part.input ?? part.args ?? part.argsText),
    updatedAt: Date.now(),
  };
}

export function getFallbackToolPhase(result: unknown, isRunning: boolean): LiveToolPhase {
  if (isRunning) return "running";
  const record = result && typeof result === "object" ? (result as Record<string, unknown>) : undefined;
  if (record?.status === "error") return "error";
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
