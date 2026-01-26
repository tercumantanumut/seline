import type { ToolResult } from "@/lib/ai/tool-registry/result-types";
import { isImageResult, isVideoResult } from "@/lib/ai/tool-registry/result-types";
import { calculateClaudeSonnet45Cost, type ClaudeCostBreakdown } from "./cost";

export interface SessionInput {
  id: string;
  title?: string | null;
  createdAt: string;
  updatedAt: string;
  metadata?: unknown;
}

export interface MessageInput {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: unknown;
  metadata?: unknown;
  tokenCount?: number | null;
  createdAt?: string | Date;
}

export interface TokenUsageSummary {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalTokens: number;
}

export interface CacheUsageSummary {
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedSavingsUsd: number;
  systemBlocksCached: number;
  messagesCached: number;
}

export interface ToolUsageEntry {
  toolName: string;
  callCount: number;
  totalTimeMs: number;
  averageTimeMs: number;
}

export interface ToolUsageSummary {
  totalToolCalls: number;
  totalExecutionTimeMs: number;
  tools: ToolUsageEntry[];
}

export interface MediaServiceBreakdown {
  service: string;
  imageCount: number;
  videoCount: number;
}

export interface MediaGenerationSummary {
  totalImages: number;
  totalVideos: number;
  byService: MediaServiceBreakdown[];
}

export interface SessionStats {
  messageCount: number;
  assistantMessageCount: number;
  userMessageCount: number;
  durationMs: number | null;
  startedAt: string;
  endedAt: string | null;
}

export interface SessionAnalytics {
  sessionId: string;
  tokenUsage: TokenUsageSummary;
  cache: CacheUsageSummary;
  cost: ClaudeCostBreakdown;
  tools: ToolUsageSummary;
  media: MediaGenerationSummary;
  stats: SessionStats;
}

function parseUsage(message: MessageInput) {
  const metadata = (message.metadata ?? {}) as { usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } };
  const usage = metadata.usage;
  const inputTokens = typeof usage?.inputTokens === "number" ? usage.inputTokens : 0;
  const outputTokens = typeof usage?.outputTokens === "number" ? usage.outputTokens : 0;
  const totalFromUsage = typeof usage?.totalTokens === "number" ? usage.totalTokens : undefined;
  const totalFromTokenCount = typeof message.tokenCount === "number" ? message.tokenCount : undefined;
  const totalTokens = totalFromUsage ?? totalFromTokenCount ?? inputTokens + outputTokens;
  return { inputTokens, outputTokens, totalTokens };
}

function parseCache(message: MessageInput) {
  const metadata = (message.metadata ?? {}) as {
    cache?: {
      cacheReadTokens?: number | string;
      cacheWriteTokens?: number | string;
      estimatedSavingsUsd?: number | string;
      systemBlocksCached?: number | string;
      messagesCached?: number | string;
    };
  };
  const cache = metadata.cache ?? {};
  const toNumber = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  };
  return {
    cacheReadTokens: toNumber(cache.cacheReadTokens),
    cacheWriteTokens: toNumber(cache.cacheWriteTokens),
    estimatedSavingsUsd: toNumber(cache.estimatedSavingsUsd),
    systemBlocksCached: toNumber(cache.systemBlocksCached),
    messagesCached: toNumber(cache.messagesCached),
  };
}

function toTimestamp(value: string | Date | undefined, fallback?: string): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return fallback ?? null;
}

function inferMediaService(toolName: string): string {
  if (toolName === "generateImageFlux2") return "Flux2 Image";
  if (toolName === "generateImageWan22") return "WAN 2.2 Image";
  if (toolName === "generateVideoWan22") return "WAN 2.2 Video";
  if (toolName === "editRoomImage") return "Gemini Image Edit";
  if (toolName === "assembleVideo") return "Video Assembly";
  return toolName || "Unknown";
}

export function computeSessionAnalytics(
  session: SessionInput,
  messages: MessageInput[]
): SessionAnalytics {
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalTokens = 0;
  let cacheReadTokens = 0;
  let cacheWriteTokens = 0;
  let estimatedSavingsUsd = 0;
  let systemBlocksCached = 0;
  let messagesCached = 0;

  let messageCount = messages.length;
  let assistantMessageCount = 0;
  let userMessageCount = 0;

  let earliestTs: string | null = session.createdAt;
  let latestTs: string | null = session.updatedAt;

  const toolAgg = new Map<string, { toolName: string; callCount: number; totalTimeMs: number }>();
  const mediaAgg = new Map<string, { service: string; imageCount: number; videoCount: number }>();
  let totalToolCalls = 0;
  let totalExecutionTimeMs = 0;
  let totalImages = 0;
  let totalVideos = 0;

  for (const msg of messages) {
    const createdTs = toTimestamp(msg.createdAt, session.createdAt);
    if (createdTs) {
      if (!earliestTs || createdTs < earliestTs) earliestTs = createdTs;
      if (!latestTs || createdTs > latestTs) latestTs = createdTs;
    }

    if (msg.role === "assistant") {
      assistantMessageCount += 1;
      const usage = parseUsage(msg);
      totalInputTokens += usage.inputTokens;
      totalOutputTokens += usage.outputTokens;
      totalTokens += usage.totalTokens;
      const cache = parseCache(msg);
      cacheReadTokens += cache.cacheReadTokens;
      cacheWriteTokens += cache.cacheWriteTokens;
      estimatedSavingsUsd += cache.estimatedSavingsUsd;
      systemBlocksCached += cache.systemBlocksCached;
      messagesCached += cache.messagesCached;
    } else if (msg.role === "user") {
      userMessageCount += 1;
    }

    // Tool + media metrics come from assistant messages with tool-call / tool-result parts
    if (msg.role !== "assistant") continue;
    const parts = Array.isArray(msg.content) ? (msg.content as unknown[]) : [];
    if (!parts.length) continue;

    const toolCallsById = new Map<string, { toolName: string }>();
    for (const part of parts) {
      const p = part as any;
      if (p && p.type === "tool-call" && typeof p.toolCallId === "string") {
        const toolName = typeof p.toolName === "string" ? p.toolName : "unknown";
        toolCallsById.set(p.toolCallId, { toolName });
      }
    }

    for (const part of parts) {
      const p = part as any;
      if (!p || p.type !== "tool-result") continue;
      const toolCallId: string | undefined = p.toolCallId;
      const callMeta = toolCallId ? toolCallsById.get(toolCallId) : undefined;
      const toolName = callMeta?.toolName ?? "unknown";
      const result = p.result as ToolResult | undefined;

      totalToolCalls += 1;

      const timeTaken =
        result && typeof result === "object" && typeof (result as any).metadata?.timeTaken === "number"
          ? (result as any).metadata.timeTaken
          : 0;

      totalExecutionTimeMs += timeTaken;
      const toolKey = toolName || "unknown";
      const existingTool = toolAgg.get(toolKey) ?? {
        toolName: toolKey,
        callCount: 0,
        totalTimeMs: 0,
      };
      existingTool.callCount += 1;
      existingTool.totalTimeMs += timeTaken;
      toolAgg.set(toolKey, existingTool);

      if (!result || typeof result !== "object") continue;

      const service = inferMediaService(toolKey);
      const mediaKey = service;
      const existingMedia = mediaAgg.get(mediaKey) ?? {
        service,
        imageCount: 0,
        videoCount: 0,
      };

      if (isImageResult(result)) {
        const count = Array.isArray(result.images) ? result.images.length : 0;
        totalImages += count;
        existingMedia.imageCount += count;
      }

      if (isVideoResult(result)) {
        const count = Array.isArray(result.videos) ? result.videos.length : 0;
        totalVideos += count;
        existingMedia.videoCount += count;
      }

      mediaAgg.set(mediaKey, existingMedia);
    }
  }

  const durationMs = earliestTs && latestTs ? Date.parse(latestTs) - Date.parse(earliestTs) : null;

  const tokenUsage: TokenUsageSummary = {
    totalInputTokens,
    totalOutputTokens,
    totalTokens,
  };

  const cache: CacheUsageSummary = {
    cacheReadTokens,
    cacheWriteTokens,
    estimatedSavingsUsd,
    systemBlocksCached,
    messagesCached,
  };

  const cost = calculateClaudeSonnet45Cost(totalInputTokens, totalOutputTokens);

  const tools: ToolUsageEntry[] = Array.from(toolAgg.values()).map((entry) => ({
    toolName: entry.toolName,
    callCount: entry.callCount,
    totalTimeMs: entry.totalTimeMs,
    averageTimeMs: entry.callCount > 0 ? entry.totalTimeMs / entry.callCount : 0,
  }));

  tools.sort((a, b) => b.callCount - a.callCount || a.toolName.localeCompare(b.toolName));

  const media: MediaGenerationSummary = {
    totalImages,
    totalVideos,
    byService: Array.from(mediaAgg.values()).sort((a, b) => (b.imageCount + b.videoCount) - (a.imageCount + a.videoCount)),
  };

  const stats: SessionStats = {
    messageCount,
    assistantMessageCount,
    userMessageCount,
    durationMs,
    startedAt: earliestTs ?? session.createdAt,
    endedAt: latestTs,
  };

  return {
    sessionId: session.id,
    tokenUsage,
    cache,
    cost,
    tools: {
      totalToolCalls,
      totalExecutionTimeMs,
      tools,
    },
    media,
    stats,
  };
}
