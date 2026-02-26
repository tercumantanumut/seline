/**
 * Progress Content Limiter
 *
 * Prevents oversized progressContent from entering the task event system.
 * This is a safety net that truncates tool-result parts in content arrays
 * before they are emitted via TaskRegistry.emitProgress() and serialized
 * over SSE to clients.
 *
 * Background: The OutputLimiter in lib/ai/output-limiter.ts only guards the
 * AI context path (via normalizeToolResultOutput). The streaming progress path
 * in chat/route.ts bypasses that guard entirely, passing raw tool results
 * (which can be 400K+ tokens) into progressContent. This module closes that gap.
 */

import {
  estimateTokens,
  CHARS_PER_TOKEN,
} from "@/lib/ai/output-limiter";

// ============================================================================
// Configuration
// ============================================================================

/**
 * Max tokens for the entire progressContent payload.
 * This is intentionally lower than the tool output limit (25K) because
 * progressContent is serialized to JSON for SSE and may contain multiple
 * tool results plus text parts.
 */
const MAX_PROGRESS_CONTENT_TOKENS = 20_000;
const DEBUG_PROGRESS_LIMITER = process.env.DEBUG_PROGRESS_LIMITER === "true";

/**
 * Max characters for any single tool-result's `result` field.
 * Individual tool results are capped more aggressively to leave room
 * for other parts in the same progressContent array.
 */
const MAX_SINGLE_RESULT_CHARS = 50_000; // ~12,500 tokens

// ============================================================================
// Types
// ============================================================================

export interface ProgressLimitResult {
  /** The (possibly truncated) content array */
  content: unknown[];
  /** Whether any truncation was applied */
  wasTruncated: boolean;
  /** Original estimated token count */
  originalTokens: number;
  /** Final estimated token count */
  finalTokens: number;
  /** Number of tool-result parts that were truncated */
  truncatedParts: number;
  /** Whether a final hard-cap summary fallback was required */
  hardCapped: boolean;
}

// ============================================================================
// Implementation
// ============================================================================

/**
 * Check if a part looks like a tool-result with a large result payload
 */
function isToolResultPart(part: unknown): part is {
  type: "tool-result";
  toolCallId: string;
  toolName?: string;
  result: unknown;
  [key: string]: unknown;
} {
  if (!part || typeof part !== "object") return false;
  const obj = part as Record<string, unknown>;
  return obj.type === "tool-result" && "result" in obj;
}

function isGetSkillToolResult(part: unknown): boolean {
  if (!isToolResultPart(part)) return false;
  return part.toolName === "runSkill" || part.toolName === "getSkill";
}

/**
 * Truncate a single tool-result's `result` field if it exceeds the limit.
 * Returns a new object (does not mutate the original).
 */
function truncateToolResult(
  part: { type: "tool-result"; toolCallId: string; toolName?: string; result: unknown; [key: string]: unknown },
): { truncated: boolean; part: Record<string, unknown> } {
  const resultStr =
    typeof part.result === "string"
      ? part.result
      : JSON.stringify(part.result);

  if (!resultStr || resultStr.length <= MAX_SINGLE_RESULT_CHARS) {
    return { truncated: false, part: part as unknown as Record<string, unknown> };
  }

  // Truncate the result field
  const truncatedResult = resultStr.slice(0, MAX_SINGLE_RESULT_CHARS);
  const originalTokens = Math.ceil(resultStr.length / CHARS_PER_TOKEN);
  const truncatedTokens = Math.ceil(truncatedResult.length / CHARS_PER_TOKEN);

  const toolName = part.toolName || "tool";
  const summary =
    `\n\n⚠️ [Progress display truncated] ${toolName} output: ` +
    `~${originalTokens.toLocaleString()} tokens → ~${truncatedTokens.toLocaleString()} tokens. ` +
    `Full result is available in the message history.`;

  // Build truncated result — if original was an object with a text/results/content field,
  // try to preserve the structure
  let newResult: unknown;
  if (typeof part.result === "string") {
    newResult = truncatedResult + summary;
  } else if (part.result && typeof part.result === "object") {
    const resultObj = { ...(part.result as Record<string, unknown>) };
    // Truncate common large text fields
    for (const field of ["results", "content", "text", "stdout", "output"]) {
      if (typeof resultObj[field] === "string" && (resultObj[field] as string).length > MAX_SINGLE_RESULT_CHARS) {
        resultObj[field] = (resultObj[field] as string).slice(0, MAX_SINGLE_RESULT_CHARS) + summary;
      }
    }
    resultObj._progressTruncated = true;
    newResult = resultObj;
  } else {
    newResult = truncatedResult + summary;
  }

  return {
    truncated: true,
    part: {
      ...part,
      result: newResult,
    },
  };
}

/**
 * Limit progressContent array to prevent oversized payloads in the task event system.
 *
 * Strategy:
 * 1. First pass: truncate individual tool-result parts that exceed per-part limits
 * 2. Second pass: if total still exceeds limit, progressively drop tool-result details
 * 3. Final fallback: replace entire content with a summary placeholder
 *
 * @param content - The progressContent array (typically DBContentPart[])
 * @returns ProgressLimitResult with truncated content and metadata
 */
export function limitProgressContent(content: unknown[] | undefined): ProgressLimitResult {
  if (!content || content.length === 0) {
    return {
      content: content ?? [],
      wasTruncated: false,
      originalTokens: 0,
      finalTokens: 0,
      truncatedParts: 0,
      hardCapped: false,
    };
  }

  const originalTokens = estimateTokens(content);
  const originalBytes = Buffer.byteLength(JSON.stringify(content), "utf8");

  // Preserve full getSkill payloads in progress projection to avoid silently
  // clipping skill content returned by action=inspect/action=run.
  if (content.some(isGetSkillToolResult)) {
    return {
      content,
      wasTruncated: false,
      originalTokens,
      finalTokens: originalTokens,
      truncatedParts: 0,
      hardCapped: false,
    };
  }

  // Fast path: content is within limits
  if (originalTokens <= MAX_PROGRESS_CONTENT_TOKENS) {
    return {
      content,
      wasTruncated: false,
      originalTokens,
      finalTokens: originalTokens,
      truncatedParts: 0,
      hardCapped: false,
    };
  }

  console.warn(
    `[ProgressLimiter] Content exceeds limit: ~${originalTokens.toLocaleString()} tokens ` +
    `(limit: ${MAX_PROGRESS_CONTENT_TOKENS.toLocaleString()}). ` +
    `Truncating tool-result parts for progress projection only (canonical history is unchanged).`
  );

  // Pass 1: Truncate individual oversized tool-result parts
  let truncatedParts = 0;
  const limitedContent = content.map((part) => {
    if (isToolResultPart(part)) {
      const { truncated, part: newPart } = truncateToolResult(part);
      if (truncated) {
        truncatedParts++;
      }
      return newPart;
    }
    return part;
  });

  const afterPass1Tokens = estimateTokens(limitedContent);

  if (afterPass1Tokens <= MAX_PROGRESS_CONTENT_TOKENS) {
    if (DEBUG_PROGRESS_LIMITER) {
      const afterPass1Bytes = Buffer.byteLength(JSON.stringify(limitedContent), "utf8");
      console.log("[ProgressLimiter] pass-1", {
        originalTokens,
        originalBytes,
        afterPass1Tokens,
        afterPass1Bytes,
        truncatedParts,
      });
    }

    return {
      content: limitedContent,
      wasTruncated: true,
      originalTokens,
      finalTokens: afterPass1Tokens,
      truncatedParts,
      hardCapped: false,
    };
  }

  // Pass 2: Still too large — strip tool-result `result` fields entirely,
  // replacing with a summary string
  const strippedContent = limitedContent.map((part) => {
    if (isToolResultPart(part)) {
      const toolName = part.toolName || "tool";
      return {
        ...part,
        result: {
          status: "success",
          summary: `${toolName} completed (output too large for progress display)`,
          _progressTruncated: true,
        },
      };
    }
    return part;
  });

  const afterPass2Tokens = estimateTokens(strippedContent);

  if (afterPass2Tokens <= MAX_PROGRESS_CONTENT_TOKENS) {
    if (DEBUG_PROGRESS_LIMITER) {
      const afterPass2Bytes = Buffer.byteLength(JSON.stringify(strippedContent), "utf8");
      console.log("[ProgressLimiter] pass-2", {
        originalTokens,
        originalBytes,
        afterPass2Tokens,
        afterPass2Bytes,
        truncatedParts,
      });
    }

    return {
      content: strippedContent,
      wasTruncated: true,
      originalTokens,
      finalTokens: afterPass2Tokens,
      truncatedParts: content.filter(isToolResultPart).length,
      hardCapped: false,
    };
  }

  const summaryText =
    "Progress update is available, but detailed content was omitted to keep the stream stable.";
  const hardCappedContent = [
    {
      type: "text",
      text: summaryText,
    },
  ];
  const finalTokens = estimateTokens(hardCappedContent);

  if (DEBUG_PROGRESS_LIMITER) {
    const hardCappedBytes = Buffer.byteLength(JSON.stringify(hardCappedContent), "utf8");
    console.warn("[ProgressLimiter] pass-3 hard-cap", {
      originalTokens,
      originalBytes,
      finalTokens,
      hardCappedBytes,
      truncatedParts,
    });
  }

  return {
    content: hardCappedContent,
    wasTruncated: true,
    originalTokens,
    finalTokens,
    truncatedParts: content.filter(isToolResultPart).length,
    hardCapped: true,
  };
}
