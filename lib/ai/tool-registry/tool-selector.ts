/**
 * Tool Selector
 *
 * Decision logic for intelligent tool selection that enforces:
 * - Search deduplication and lightweight loop prevention
 * - describeImage-first workflow for image uploads
 * - Reference image caching for virtual try-on
 *
 * This module provides validation and suggestion functions that can be
 * called before executing tools to ensure optimal tool usage patterns.
 */

import {
  type AgentToolState,
  type ToolLimits,
  DEFAULT_TOOL_LIMITS,
  getToolCount,
  isToolLimitExceeded,
  wasQueryExecuted,
} from "./agent-state";

/**
 * Tool selection recommendation
 */
export interface ToolRecommendation {
  /** Should the requested tool be used? */
  allow: boolean;
  /** Alternative tool to use instead (if allow=false) */
  alternativeTool?: string;
  /** Reason for the recommendation */
  reason: string;
  /** Suggested parameters for alternative tool */
  alternativeParams?: Record<string, unknown>;
}

/**
 * Context for tool selection decisions
 */
export interface ToolSelectionContext {
  /** The tool being requested */
  toolName: string;
  /** Parameters being passed to the tool */
  params: Record<string, unknown>;
  /** Whether user has uploaded an image in this conversation */
  hasUserUploadedImage: boolean;
  /** Whether describeImage has been called on the uploaded image */
  hasAnalyzedUserImage: boolean;
  /** The query/search term (for search-related tools) */
  query?: string;
}

/**
 * Check if a search-related tool should be used and suggest alternatives
 */
export function evaluateSearchToolUsage(
  context: ToolSelectionContext,
  state: AgentToolState,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS
): ToolRecommendation {
  const { toolName, query } = context;

  // If no query, allow the call (can't do cache check)
  if (!query) {
    return { allow: true, reason: "No query to evaluate" };
  }

  // Check if this exact query was already executed
  if (wasQueryExecuted(state, query)) {
    return {
      allow: false,
      alternativeTool: "docsSearch",
      reason: `Query "${query}" was already executed. Use docsSearch to retrieve cached results.`,
      alternativeParams: { query },
    };
  }

  // For webSearch specifically, check optional limits
  if (toolName === "webSearch" && isToolLimitExceeded(state, "webSearch", limits)) {
    return {
      allow: false,
      alternativeTool: "docsSearch",
      reason: `webSearch limit (${limits.maxWebSearchCalls}) reached. Use docsSearch to find relevant cached content.`,
      alternativeParams: { query },
    };
  }

  return { allow: true, reason: "Tool usage approved" };
}

/**
 * Check if virtual try-on workflow prerequisites are met
 */
export function evaluateVirtualTryOnWorkflow(
  context: ToolSelectionContext,
  state: AgentToolState
): ToolRecommendation {
  const { toolName, hasUserUploadedImage, hasAnalyzedUserImage, params } =
    context;

  // Only applies to editImage tool
  if (toolName !== "editImage") {
    return { allow: true, reason: "Not an editImage call" };
  }

  // If user uploaded an image but hasn't analyzed it
  if (hasUserUploadedImage && !hasAnalyzedUserImage && !state.imageAnalysis) {
    return {
      allow: false,
      alternativeTool: "describeImage",
      reason:
        "MANDATORY: Call describeImage first to analyze user's uploaded image before editImage.",
      alternativeParams: {
        imageUrl: params.image_url,
        analysisType: "person", // Default to person for virtual try-on
      },
    };
  }

  // Check if second_image_url is provided for try-on scenarios
  const hasSecondImage = !!params.second_image_url;
  const promptLower = String(params.prompt || "").toLowerCase();
  const isTryOnScenario =
    promptLower.includes("try on") ||
    promptLower.includes("wearing") ||
    promptLower.includes("dress") ||
    promptLower.includes("outfit");

  if (isTryOnScenario && !hasSecondImage) {
    return {
      allow: false,
      reason:
        "Virtual try-on requires both image_url (user) AND second_image_url (reference). Fetch reference image first.",
    };
  }

  return { allow: true, reason: "Workflow prerequisites met" };
}

/**
 * Main tool selection evaluation combining all checks
 */
export function evaluateToolSelection(
  context: ToolSelectionContext,
  state: AgentToolState,
  limits: ToolLimits = DEFAULT_TOOL_LIMITS
): ToolRecommendation {
  // Check virtual try-on workflow first (highest priority)
  const tryOnResult = evaluateVirtualTryOnWorkflow(context, state);
  if (!tryOnResult.allow) {
    return tryOnResult;
  }

  // Check search tool usage patterns
  if (["webSearch", "docsSearch"].includes(context.toolName)) {
    const searchResult = evaluateSearchToolUsage(context, state, limits);
    if (!searchResult.allow) {
      return searchResult;
    }
  }

  return { allow: true, reason: "All checks passed" };
}

