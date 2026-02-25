import { tool, jsonSchema } from "ai";
import { listSessionsPaginated } from "@/lib/db/queries";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

interface SearchSessionsToolOptions {
  sessionId: string;
  userId: string;
}

interface SearchSessionsArgs {
  query?: string;
  characterName?: string;
  channelType?: "app" | "whatsapp" | "telegram" | "slack" | "discord";
  dateRange?: "today" | "week" | "month" | "all";
  includeMessageContent?: boolean;
  limit?: number;
}

const searchSessionsSchema = jsonSchema<SearchSessionsArgs>({
  type: "object",
  title: "SearchSessionsInput",
  description: "Search and filter past conversation sessions",
  properties: {
    query: {
      type: "string",
      description:
        "Search term to match against session titles and recent message content (e.g., 'authentication', 'deploy')",
    },
    characterName: {
      type: "string",
      description:
        "Filter by agent/character name. Matched against session metadata.",
    },
    channelType: {
      type: "string",
      enum: ["app", "whatsapp", "telegram", "slack", "discord"],
      description: "Filter by the channel where the conversation happened",
    },
    dateRange: {
      type: "string",
      enum: ["today", "week", "month", "all"],
      description: "Filter by recency. Defaults to 'all'.",
    },
    includeMessageContent: {
      type: "boolean",
      description:
        "Also match the query against non-compacted user/assistant message content. Defaults to true.",
    },
    limit: {
      type: "number",
      description: "Max sessions to return (1-50). Defaults to 20.",
    },
  },
  additionalProperties: false,
});

const MAX_SUMMARY_LENGTH = 300;

function shapeSessionResults(
  sessions: Array<Record<string, unknown>>
): Array<Record<string, unknown>> {
  return sessions.map((s) => {
    const meta = (s.metadata ?? {}) as Record<string, unknown>;
    const summary = typeof s.summary === "string" && s.summary.length > MAX_SUMMARY_LENGTH
      ? s.summary.slice(0, MAX_SUMMARY_LENGTH) + "…"
      : s.summary;

    return {
      id: s.id,
      title: s.title,
      ...(summary ? { summary } : {}),
      ...(meta.characterName ? { agent: meta.characterName } : {}),
      ...(s.channelType ? { channel: s.channelType } : {}),
      messageCount: s.messageCount,
      lastMessageAt: s.lastMessageAt,
      ...(meta.pinned ? { pinned: true } : {}),
    };
  });
}

async function executeSearchSessions(
  options: SearchSessionsToolOptions,
  args: SearchSessionsArgs
) {
  const safeLimit = Math.min(Math.max(args.limit ?? 20, 1), 50);

  const result = await listSessionsPaginated({
    userId: options.userId,
    characterName: args.characterName,
    search: args.query,
    // Default to message-content matching so "what we did yesterday" finds non-title sessions.
    searchInMessages: args.includeMessageContent ?? true,
    channelType: args.channelType,
    dateRange: args.dateRange ?? "all",
    limit: safeLimit,
    status: "active",
  });

  const shaped = shapeSessionResults(
    result.sessions as unknown as Array<Record<string, unknown>>
  );

  return {
    status: "success" as const,
    totalCount: result.totalCount,
    returned: shaped.length,
    sessions: shaped,
  };
}

export function createSearchSessionsTool(options: SearchSessionsToolOptions) {
  const executeWithLogging = withToolLogging(
    "searchSessions",
    options.sessionId,
    (args: SearchSessionsArgs) => executeSearchSessions(options, args)
  );

  return tool({
    description: `Search past conversation sessions by title, message content, channel, agent, or date range. Returns session metadata and summaries — not message dumps.`,
    inputSchema: searchSessionsSchema,
    execute: executeWithLogging,
  });
}
