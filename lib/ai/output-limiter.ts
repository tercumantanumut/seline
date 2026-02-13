/**
 * Token-Aware Output Limiter
 *
 * Enforces token limits on tool outputs to prevent context bloat.
 * Stores full content for on-demand retrieval.
 *
 * This module provides a universal token limiting mechanism that applies to
 * ALL tool outputs (bash commands, MCP tools, web tools, etc.) to prevent
 * context overflow from massive outputs like `ls -R`, `pip freeze`, etc.
 */

import { storeFullContent } from "./truncated-content-store";

// ============================================================================
// Configuration
// ============================================================================

// ~25,000 tokens = ~100,000 characters (4 chars/token estimate)
export const MAX_TOOL_OUTPUT_TOKENS = 25000;
export const CHARS_PER_TOKEN = 4;
export const MAX_TOOL_OUTPUT_CHARS = MAX_TOOL_OUTPUT_TOKENS * CHARS_PER_TOKEN; // 100,000

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
// Truncation Notice
// ============================================================================

/**
 * Build truncation notice with retrieval instructions
 */
function buildTruncationNotice(
  originalLength: number,
  truncatedLength: number,
  estimatedTokens: number,
  maxTokens: number,
  contentId: string | undefined,
  hasSession: boolean
): string {
  const notice = `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  OUTPUT TRUNCATED TO PREVENT CONTEXT OVERFLOW

Original: ~${estimatedTokens.toLocaleString()} tokens (${originalLength.toLocaleString()} chars)
Showing: ~${maxTokens.toLocaleString()} tokens (${truncatedLength.toLocaleString()} chars)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;

  if (hasSession && contentId) {
    return (
      notice +
      `

📦 FULL OUTPUT AVAILABLE
   Reference ID: ${contentId}

🔧 TO RETRIEVE FULL OUTPUT:
   retrieveFullContent({ contentId: "${contentId}" })

💡 RECOMMENDATION:
   Only retrieve full output if the truncated portion above is
   insufficient for your task. Consider using grep/filtering
   commands to get specific information instead.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
    );
  }

  return (
    notice +
    `

⚠️  Full output not available for retrieval.
   Consider using more specific commands or filters.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`
  );
}

// ============================================================================
// Main Limiting Function
// ============================================================================

/**
 * Apply token limit to tool output
 *
 * If output exceeds limit:
 * - Truncates to maxTokens (~25,000 tokens = ~100,000 chars)
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

  // Estimate tokens for entire output
  const estimatedTokens = estimateTokens(output);

  // No limiting needed - output is within limit
  if (estimatedTokens <= maxTokens) {
    return {
      limited: false,
      output: output as string,
      originalLength: 0,
      truncatedLength: 0,
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

  // Store full content if session provided
  let contentId: string | undefined;
  if (sessionId) {
    contentId = storeFullContent(
      sessionId,
      `${toolName} output`,
      primaryText,
      truncatedText.length
    );
  }

  // Build truncation notice
  const truncationNotice = buildTruncationNotice(
    primaryText.length,
    truncatedText.length,
    estimatedTokens,
    maxTokens,
    contentId,
    !!sessionId
  );

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
