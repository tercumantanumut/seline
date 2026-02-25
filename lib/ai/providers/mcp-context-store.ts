/**
 * Per-request MCP context store.
 *
 * AsyncLocalStorage propagates through async call trees, so setting a value
 * before streamText() / streamObject() makes it available deep inside the
 * fetch interceptor (createClaudeCodeFetch) without threading it through
 * every intermediate function signature.
 */

import { AsyncLocalStorage } from "async_hooks";

/**
 * Per-request context used to build the Seline platform MCP server that
 * exposes ToolRegistry tools and per-agent MCP tools to the Claude Agent SDK.
 */
export interface SelineMcpContext {
  /** Authenticated user ID */
  userId: string;
  /** Current chat session ID */
  sessionId: string;
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
  /** Filesystem paths to cached Seline plugins (for SDK plugin loading) */
  pluginPaths?: string[];
  /** Hook execution context for bridging Seline hooks into SDK callbacks */
  hookContext?: {
    allowedPluginNames: Set<string>;
    pluginRoots: Map<string, string>;
  };
}

export const mcpContextStore = new AsyncLocalStorage<SelineMcpContext>();
