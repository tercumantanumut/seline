/**
 * Per-request MCP context store.
 *
 * AsyncLocalStorage propagates through async call trees, so setting a value
 * before streamText() / streamObject() makes it available deep inside the
 * fetch interceptor (createClaudeCodeFetch) without threading it through
 * every intermediate function signature.
 */

import { AsyncLocalStorage } from "async_hooks";
import type { LivePromptEntry } from "@/lib/background-tasks/live-prompt-queue-registry";

export interface SdkToolResultRecord {
  output: unknown;
  toolName?: string;
}

export interface SdkToolResultBridge {
  /**
   * Publish a resolved SDK tool result (keyed by tool_use_id / toolCallId).
   */
  publish: (toolCallId: string, output: unknown, toolName?: string) => void;
  /**
   * Wait for a published result for this tool call.
   * Returns undefined on timeout/cancel.
   */
  waitFor: (
    toolCallId: string,
    options?: { timeoutMs?: number | null; abortSignal?: AbortSignal }
  ) => Promise<SdkToolResultRecord | undefined>;
  /**
   * Resolve and clear all pending waiters/results for request teardown.
   */
  dispose?: () => void;
}

/**
 * Per-request context used to build the Selene platform MCP server that
 * exposes ToolRegistry tools and per-agent MCP tools to the Claude Agent SDK.
 */
export interface SeleneMcpContext {
  /** Authenticated user ID */
  userId: string;
  /** Current chat session ID */
  sessionId: string;
  /** Current agent run ID (used for live prompt injection into SDK sessions). */
  runId?: string;
  /** Active character / agent ID (null for the default assistant) */
  characterId: string | null;
  /**
   * Tool names that are explicitly enabled for this agent.
   * When set, only these tools (plus alwaysLoad utility tools) are exposed.
   * When undefined, all environment-enabled tools are exposed.
   */
  enabledTools?: string[];
  /** Agent working directory (primary sync folder path) */
  cwd?: string;
  /** Filesystem paths to cached Selene plugins (for SDK plugin loading) */
  pluginPaths?: string[];
  /** Hook execution context for bridging Selene hooks into SDK callbacks */
  hookContext?: {
    allowedPluginNames: Set<string>;
    pluginRoots: Map<string, string>;
  };

  // ── SDK-specific tool loading and isolation fields ─────────────────────────

  /**
   * Tool loading mode for the Agent SDK — mirrors the app-level setting.
   * When "deferred", non-alwaysLoad tools require searchTools discovery first.
   * When "always", all enabled tools are active immediately.
   */
  toolLoadingMode?: "deferred" | "always";

  /**
   * Tool names previously discovered via searchTools in earlier turns.
   * Seeds the SDK session's activated-tools set so discoveries from prior
   * requests persist (Agent SDK runs one full session per request).
   */
  previouslyDiscoveredTools?: string[];

  /**
   * MCP server names enabled for this agent (from character metadata).
   * Scopes MCPClientManager tool exposure to only this agent's servers.
   * When undefined + no enabledMcpTools, all connected servers are accessible.
   */
  enabledMcpServers?: string[];

  /**
   * Specific MCP tool IDs (format: "serverName:toolName") enabled for this agent.
   * Takes precedence over enabledMcpServers when set.
   */
  enabledMcpTools?: string[];

  /**
   * MCP tool IDs (in getMCPToolId format, e.g. "mcp_server_tool") that are
   * alwaysLoad (active immediately without searchTools). Populated from
   * mcpToolPreferences in character metadata.
   */
  alwaysLoadMcpToolIds?: string[];

  /**
   * Callback fired when an SDK MCP tool produces rich output (image URL, video URL, etc.).
   * Route.ts wires this into the Selene streaming state so image/video chips
   * appear in the UI even when using the Agent SDK provider.
   */
  onRichOutput?: (toolCallId: string, toolName: string, output: unknown) => void;

  /**
   * Bridge for resolving real Claude Agent SDK tool outputs (tool_use_result)
   * back into Vercel AI SDK tool execution lifecycle.
   */
  sdkToolResultBridge?: SdkToolResultBridge;

  /**
   * Callback fired before queued live-prompt entries are injected into an active
   * Claude Agent SDK session, so the chat route can split/persist messages.
   */
  onQueueMessages?: (entries: LivePromptEntry[]) => Promise<void>;
}

export const mcpContextStore = new AsyncLocalStorage<SeleneMcpContext>();
