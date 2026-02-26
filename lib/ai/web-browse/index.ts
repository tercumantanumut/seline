/**
 * Web Browse Module
 *
 * Session-based web browsing with secondary LLM synthesis.
 * Replaces the old pattern of fetchWebpage → embed → docsSearch.
 *
 * Key features:
 * - Session-scoped content storage (not in permanent embeddings)
 * - Secondary LLM for content synthesis
 * - Automatic TTL-based cleanup
 * - Single consolidated response (no visible sub-tool calls)
 *
 * Usage:
 * ```typescript
 * import { browseAndSynthesize, createWebBrowseTool } from "@/lib/ai/web-browse";
 *
 * // Direct API usage
 * const result = await browseAndSynthesize({
 *   urls: ["https://example.com"],
 *   query: "What is the main topic?",
 *   options: { sessionId, userId, characterId },
 * });
 *
 * // Or use as a tool
 * const tool = createWebBrowseTool({ sessionId, userId, characterId });
 * ```
 */

// Export types
export type {
  WebContentEntry,
  WebBrowseSession,
  WebBrowseOptions,
  WebBrowseResult,
  WebBrowsePhase,
  WebBrowseEvent,
  WebBrowseEventEmitter,
  WebBrowseProgressEvent,
  WebBrowseContentEvent,
  WebBrowseSynthesisEvent,
  WebBrowseErrorEvent,
  SynthesisRequest,
  SynthesisResult,
} from "./types";

// Export session store functions
export {
  getWebBrowseSession,
  addWebContent,
  getSessionContent,
  getContentByUrls,
  getSessionRecentUrls,
  setSessionRecentUrls,
  clearSession,
  cleanupExpiredEntries,
} from "./session-store";

// Export synthesizer
export { synthesizeWebContent } from "./synthesizer";

// Export orchestrator
export {
  browseAndSynthesize,
  querySessionContent,
  type BrowseAndSynthesizeParams,
  type BrowseAndSynthesizeResult,
} from "./orchestrator";

// Export tools
export { createWebBrowseTool } from "./tool";

