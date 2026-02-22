import { nowISO } from "@/lib/utils/timestamp";

export const LIVE_PROMPT_QUEUE_METADATA_KEY = "livePromptQueue";

const MAX_QUEUE_ITEMS = 50;
const MAX_PROMPT_LENGTH = 8000;

export interface LivePromptQueueEntry {
  id: string;
  runId: string;
  content: string;
  createdAt: string;
  source?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function sanitizeLivePromptContent(content: unknown): string {
  if (typeof content !== "string") return "";
  return content.trim().slice(0, MAX_PROMPT_LENGTH);
}

export function getLivePromptQueueEntries(metadata: unknown): LivePromptQueueEntry[] {
  if (!isRecord(metadata)) return [];

  const rawQueue = metadata[LIVE_PROMPT_QUEUE_METADATA_KEY];
  if (!Array.isArray(rawQueue)) return [];

  const parsed: LivePromptQueueEntry[] = [];

  for (const item of rawQueue) {
    if (!isRecord(item)) continue;

    const id = typeof item.id === "string" ? item.id.trim() : "";
    const runId = typeof item.runId === "string" ? item.runId.trim() : "";
    const content = sanitizeLivePromptContent(item.content);
    const createdAt = typeof item.createdAt === "string" && item.createdAt.trim().length > 0
      ? item.createdAt
      : nowISO();
    const source = typeof item.source === "string" ? item.source : undefined;

    if (!id || !runId || !content) continue;

    parsed.push({ id, runId, content, createdAt, source });
  }

  parsed.sort((a, b) => {
    const aMs = Date.parse(a.createdAt);
    const bMs = Date.parse(b.createdAt);
    if (Number.isNaN(aMs) || Number.isNaN(bMs)) return 0;
    return aMs - bMs;
  });

  return parsed;
}

export function appendLivePromptQueueEntry(
  metadata: Record<string, unknown> | null | undefined,
  entry: LivePromptQueueEntry
): Record<string, unknown> {
  const base: Record<string, unknown> = isRecord(metadata) ? { ...metadata } : {};
  const queue = getLivePromptQueueEntries(base);

  queue.push({
    id: entry.id,
    runId: entry.runId,
    content: sanitizeLivePromptContent(entry.content),
    createdAt: entry.createdAt || nowISO(),
    source: entry.source,
  });

  const trimmedQueue = queue.slice(-MAX_QUEUE_ITEMS);
  base[LIVE_PROMPT_QUEUE_METADATA_KEY] = trimmedQueue;

  return base;
}

export function getUnseenLivePromptEntries(
  metadata: unknown,
  runId: string,
  seenEntryIds: Set<string>
): LivePromptQueueEntry[] {
  const queue = getLivePromptQueueEntries(metadata);
  if (queue.length === 0 || !runId) return [];

  const unseen = queue.filter((entry) => entry.runId === runId && !seenEntryIds.has(entry.id));
  for (const entry of unseen) {
    seenEntryIds.add(entry.id);
  }

  return unseen;
}

export function buildLivePromptInjectionMessage(entries: LivePromptQueueEntry[]): string | null {
  if (!Array.isArray(entries) || entries.length === 0) {
    return null;
  }

  const lines = entries.map((entry, index) => {
    const sourceLabel = entry.source ? `source=${entry.source}` : "source=chat";
    return `${index + 1}. (${sourceLabel}, at ${entry.createdAt}) ${entry.content}`;
  });

  return [
    "Live user instructions were submitted while this run was already in progress.",
    "Apply them immediately when deciding the next tool calls and response.",
    ...lines,
  ].join("\n");
}
