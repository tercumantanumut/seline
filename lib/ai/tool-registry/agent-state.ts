/**
 * Agent Tool State Management
 *
 * Tracks tool usage across a conversation to enable:
 * - Tool call counting (enforce webSearch limits)
 * - Cache marker tracking (prioritize docsSearch over re-fetching)
 * - Prior query deduplication (avoid redundant searches)
 * - Image analysis state (ensure describeImage-first workflow)
 *
 * This state is per-session and resets on new conversations.
 */

/**
 * Analysis result from describeImage tool
 */
export interface ImageAnalysisState {
  /** URL of the analyzed image */
  url: string;
  /** Analysis type used */
  type: "person" | "room" | "product" | "general";
  /** Generated description */
  description: string;
  /** Timestamp of analysis */
  analyzedAt: number;
}

/**
 * Tracked tool state per conversation session
 */
export interface AgentToolState {
  /** Count of each tool call in this session */
  toolCounts: Record<string, number>;

  /**
   * Extracted cache markers from tool results
   * Format: "[PREVIOUSLY FOUND ...]" or "[GENERATED ...]"
   */
  cachedMarkers: string[];

  /** Set of previously executed queries to avoid redundant searches */
  priorQueries: Set<string>;

  /** Most recent image analysis result (for virtual try-on workflows) */
  imageAnalysis?: ImageAnalysisState;

  /** URLs of reference images fetched via webSearch */
  fetchedReferenceUrls: Map<string, string>;
}

/**
 * Tool usage limits configuration
 */
export interface ToolLimits {
  /** Maximum webSearch calls per session (default: unlimited) */
  maxWebSearchCalls: number;
}

// Tool limits set to effectively unlimited (Number.MAX_SAFE_INTEGER).
export const DEFAULT_TOOL_LIMITS: ToolLimits = {
  maxWebSearchCalls: Number.MAX_SAFE_INTEGER,
};

/**
 * Create initial empty agent tool state
 */
export function createAgentToolState(): AgentToolState {
  return {
    toolCounts: {},
    cachedMarkers: [],
    priorQueries: new Set(),
    imageAnalysis: undefined,
    fetchedReferenceUrls: new Map(),
  };
}

/**
 * Increment tool call count and return new count
 */
export function incrementToolCount(
  state: AgentToolState,
  toolName: string
): number {
  state.toolCounts[toolName] = (state.toolCounts[toolName] || 0) + 1;
  return state.toolCounts[toolName];
}

/**
 * Get current call count for a tool
 */
export function getToolCount(state: AgentToolState, toolName: string): number {
  return state.toolCounts[toolName] || 0;
}

/**
 * Check if tool has exceeded its limit
 */
export function isToolLimitExceeded(
  state: AgentToolState,
  toolName: string,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS
): boolean {
  if (toolName !== "webSearch") {
    return false;
  }

  const count = getToolCount(state, toolName);
  return count >= limits.maxWebSearchCalls;
}

/**
 * Add a cached marker from tool result
 */
export function addCachedMarker(state: AgentToolState, marker: string): void {
  if (!state.cachedMarkers.includes(marker)) {
    state.cachedMarkers.push(marker);
  }
}

/**
 * Check if a query was already executed
 */
export function wasQueryExecuted(
  state: AgentToolState,
  query: string
): boolean {
  // Normalize query for comparison
  const normalized = query.toLowerCase().trim();
  return state.priorQueries.has(normalized);
}

/**
 * Record an executed query
 */
export function recordQuery(state: AgentToolState, query: string): void {
  const normalized = query.toLowerCase().trim();
  state.priorQueries.add(normalized);
}

/**
 * Set the image analysis result
 */
export function setImageAnalysis(
  state: AgentToolState,
  url: string,
  type: ImageAnalysisState["type"],
  description: string
): void {
  state.imageAnalysis = {
    url,
    type,
    description,
    analyzedAt: Date.now(),
  };
}

/**
 * Cache a fetched reference URL
 */
export function cacheReferenceUrl(
  state: AgentToolState,
  itemDescription: string,
  url: string
): void {
  state.fetchedReferenceUrls.set(itemDescription.toLowerCase().trim(), url);
}

/**
 * Get a cached reference URL
 */
export function getCachedReferenceUrl(
  state: AgentToolState,
  itemDescription: string
): string | undefined {
  return state.fetchedReferenceUrls.get(itemDescription.toLowerCase().trim());
}

