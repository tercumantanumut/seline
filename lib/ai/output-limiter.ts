/**
 * Token-Aware Output Limiter
 *
 * Enforces token limits on tool outputs to prevent context bloat.
 * Stores full content for on-demand retrieval.
 *
 * This module provides a universal token limiting mechanism that applies to
 * ALL tool outputs (bash commands, MCP tools, web tools, etc.) to prevent
 * context overflow from massive outputs like `ls -R`, `pip freeze`.
 */

import { storeFullContent } from "./truncated-content-store";
import { generateTruncationMarker } from "./truncation-utils";

// ============================================================================
// Configuration
// ============================================================================

// Default guardrail for tool outputs included in chat context.
// Keep this conservative so one noisy tool call cannot crowd out conversation context.
// ~3,000 tokens = ~12,000 characters (4 chars/token estimate)
export const MAX_TOOL_OUTPUT_TOKENS = 3000;
export const CHARS_PER_TOKEN = 4;
export const MAX_TOOL_OUTPUT_CHARS = MAX_TOOL_OUTPUT_TOKENS * CHARS_PER_TOKEN; // 12,000

// ============================================================================
// Types
// ============================================================================

export interface LimitResult {
  /** Whether the output was limited/truncated */
  limited: boolean;
  /** The output (truncated if limited, original if not) */
  output: string;
  /** Original content length in characters */
  originalLength: number;
  /** Truncated content length in characters */
  truncatedLength: number;
  /** Reference ID for retrieving full content (if stored) */
  contentId?: string;
  /** Estimated token count of original output */
  estimatedTokens: number;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for arbitrary content
 * Handles strings, objects, arrays
 * Uses 4 chars/token heuristic (conservative estimate)
 */
export function estimateTokens(content: unknown): number {
  if (typeof content === "string") {
    return Math.ceil(content.length / CHARS_PER_TOKEN);
  }

  if (Array.isArray(content)) {
    return content.reduce((total, item) => total + estimateTokens(item), 0);
  }

  if (content && typeof content === "object") {
    return Math.ceil(JSON.stringify(content).length / CHARS_PER_TOKEN);
  }

  return 10; // Default minimum
}

// ============================================================================
// Content Extraction
// ============================================================================

/**
 * Extract primary text content from tool output
 * Returns the main text that would be sent to context
 *
 * Handles various output formats:
 * - String outputs (return as-is)
 * - Object outputs with common text fields (content, text, stdout, result, output)
 * - MCP tool results with content arrays
 * - Combined stdout/stderr outputs
 */
function extractPrimaryText(output: unknown): string | null {
  // Handle string output
  if (typeof output === "string") {
    return output;
  }

  if (!output || typeof output !== "object") {
    return null;
  }

  const obj = output as Record<string, unknown>;

  // Special case: MCP tool results with content array
  // Format: { content: [{ type: "text", text: "..." }, ...] }
  if (obj.content && Array.isArray(obj.content)) {
    const textParts: string[] = [];
    for (const item of obj.content) {
      if (item && typeof item === "object" && "text" in item) {
        textParts.push(String(item.text));
      }
    }
    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  // Special case: Concatenate stdout and stderr
  // Common for executeCommand tool results
  if (obj.stdout || obj.stderr) {
    const parts: string[] = [];
    if (typeof obj.stdout === "string") parts.push(obj.stdout);
    if (typeof obj.stderr === "string") parts.push(obj.stderr);
    return parts.join("\n");
  }

  // Check common text fields in priority order
  const textFields = ["content", "text", "result", "output"];
  for (const field of textFields) {
    if (typeof obj[field] === "string") {
      return obj[field] as string;
    }
  }

  return null;
}

// ============================================================================
// Main Limiting Function
// ============================================================================

/**
 * Apply token limit to tool output
 *
 * If output exceeds limit:
 * - Truncates to maxTokens (~10,000 tokens = ~40,000 chars)
 * - Stores full content for retrieval (if sessionId provided)
 * - Adds clear truncation notice with retrieval instructions
 *
 * This is the universal safety net that applies to ALL tools.
 *
 * @param output - The tool output to limit (string, object, or unknown)
 * @param toolName - Name of the tool (for logging and context)
 * @param sessionId - Optional session ID for storing full content
 * @param options - Optional configuration overrides
 * @returns LimitResult with limited output and metadata
 */
export function limitToolOutput(
  output: unknown,
  toolName: string,
  sessionId?: string,
  options: {
    maxTokens?: number;
    charsPerToken?: number;
  } = {}
): LimitResult {
  const maxTokens = options.maxTokens ?? MAX_TOOL_OUTPUT_TOKENS;
  const charsPerToken = options.charsPerToken ?? CHARS_PER_TOKEN;
  const maxChars = maxTokens * charsPerToken;

  // Detect if the tool already provides a logId (common for executeCommand)
  // We prefer the tool's own logId over generating a new trunc_ ID
  const obj = (output && typeof output === "object") ? (output as Record<string, any>) : null;
  const existingLogId = obj?.logId;
  const alreadyTruncated = obj?.isTruncated || obj?.truncated;

  // Estimate tokens for entire output
  const estimatedTokens = estimateTokens(output);

  // No limiting needed BY THIS TOOL - but check if it was already truncated by the caller
  if (estimatedTokens <= maxTokens) {
    if (alreadyTruncated && (existingLogId || obj?.truncatedContentId)) {
      // It was already truncated by lines or something else, but it fits in tokens.
      // Extract the actual text content to preserve the real tool result
      const text = extractPrimaryText(output) ?? JSON.stringify(output);
      return {
        limited: false,
        output: text,
        originalLength: text.length,
        truncatedLength: text.length,
        estimatedTokens,
      };
    }

    // For non-truncated outputs, extract text properly
    const text = extractPrimaryText(output);
    if (text !== null) {
      return {
        limited: false,
        output: text,
        originalLength: text.length,
        truncatedLength: text.length,
        estimatedTokens,
      };
    }

    // Fallback: serialize object outputs to avoid "[object Object]"
    const serialized = typeof output === "string" ? output : JSON.stringify(output);
    return {
      limited: false,
      output: serialized,
      originalLength: serialized.length,
      truncatedLength: serialized.length,
      estimatedTokens,
    };
  }

  console.warn(
    `[OutputLimiter] Tool "${toolName}" output exceeds limit: ` +
      `~${estimatedTokens.toLocaleString()} tokens (limit: ${maxTokens.toLocaleString()})`
  );

  // Extract primary text content to truncate
  const primaryText = extractPrimaryText(output);

  if (!primaryText) {
    // Can't extract text - return as-is (rare case for binary/unknown formats)
    console.warn(`[OutputLimiter] Could not extract text from ${toolName} output`);
    return {
      limited: false,
      output: output as string,
      originalLength: 0,
      truncatedLength: 0,
      estimatedTokens,
    };
  }

  // Truncate to character limit
  const truncatedText = primaryText.slice(0, maxChars);

  // Store full content if session provided AND no existing logId
  let contentId: string | undefined = existingLogId;
  let idType: "logId" | "contentId" = existingLogId ? "logId" : "contentId";

  if (!existingLogId && sessionId) {
    contentId = storeFullContent(
      sessionId,
      `${toolName} output`,
      primaryText,
      truncatedText.length
    );
  }

  // Build truncation notice using unified utility
  const truncationNotice = generateTruncationMarker({
    originalLength: primaryText.length,
    truncatedLength: truncatedText.length,
    estimatedTokens,
    maxTokens,
    id: contentId, // Will be undefined if no storage available
    idType,
  });

  const finalOutput = truncatedText + truncationNotice;

  return {
    limited: true,
    output: finalOutput,
    originalLength: primaryText.length,
    truncatedLength: truncatedText.length,
    contentId,
    estimatedTokens,
  };
}
