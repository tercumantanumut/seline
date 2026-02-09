/**
 * Token Tracker
 *
 * Provides accurate token counting and usage tracking for context window management.
 * Tracks tokens by category (system, user, assistant, tools) for detailed analysis.
 *
 * @see docs/CONTEXT_WINDOW_MANAGEMENT_DESIGN.md
 */

import { estimateMessageTokens } from "@/lib/utils";
import type { Message } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TokenUsage {
  /** Tokens used by system prompt */
  systemPromptTokens: number;
  /** Tokens used by user messages */
  userMessageTokens: number;
  /** Tokens used by assistant messages */
  assistantMessageTokens: number;
  /** Tokens used by tool call definitions/invocations */
  toolCallTokens: number;
  /** Tokens used by tool results */
  toolResultTokens: number;
  /** Tokens used by session summary (compacted history) */
  summaryTokens: number;
  /** Total tokens across all categories */
  totalTokens: number;
}

export interface TokenBreakdown extends TokenUsage {
  /** Percentage breakdown by category */
  percentages: {
    systemPrompt: number;
    userMessages: number;
    assistantMessages: number;
    toolCalls: number;
    toolResults: number;
    summary: number;
  };
  /** Human-readable formatted totals */
  formatted: {
    total: string;
    systemPrompt: string;
    userMessages: string;
    assistantMessages: string;
    tools: string;
    summary: string;
  };
}

export interface TokenEstimate {
  /** Estimated tokens for the content */
  tokens: number;
  /** Confidence level of the estimate */
  confidence: "high" | "medium" | "low";
  /** Method used for estimation */
  method: "cached" | "calculated" | "estimated";
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Average characters per token for estimation.
 * Based on empirical analysis of Claude/GPT tokenizers.
 * English text averages ~4 chars/token, code ~3.5 chars/token.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Overhead tokens per message for role markers, formatting, etc.
 */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Overhead tokens per tool call for schema, markers, etc.
 */
const TOOL_CALL_OVERHEAD_TOKENS = 10;

// ---------------------------------------------------------------------------
// Token Estimation Helpers
// ---------------------------------------------------------------------------

/**
 * Estimate tokens for a string of text.
 *
 * @param text - The text to estimate
 * @returns Estimated token count
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for JSON content.
 *
 * @param content - The content to estimate (will be stringified if not string)
 * @returns Estimated token count
 */
export function estimateContentTokens(content: unknown): number {
  if (!content) return 0;

  if (typeof content === "string") {
    return estimateTextTokens(content);
  }

  if (Array.isArray(content)) {
    let tokens = 0;
    for (const part of content) {
      if (typeof part === "object" && part !== null) {
        const typedPart = part as { type?: string; text?: string; image?: string };

        // Text parts
        if (typedPart.type === "text" && typedPart.text) {
          tokens += estimateTextTokens(typedPart.text);
        }
        // Image parts - estimate based on typical image token costs
        else if (typedPart.type === "image" || typedPart.image) {
          // Images typically cost ~1000-2000 tokens depending on size
          // Using conservative estimate
          tokens += 1500;
        }
        // Tool calls
        else if (typedPart.type === "tool-call") {
          tokens += estimateContentTokens(part) + TOOL_CALL_OVERHEAD_TOKENS;
        }
        // Tool results
        else if (typedPart.type === "tool-result") {
          tokens += estimateContentTokens(part);
        }
        // Other object types
        else {
          tokens += estimateTextTokens(JSON.stringify(part));
        }
      } else if (typeof part === "string") {
        tokens += estimateTextTokens(part);
      }
    }
    return tokens;
  }

  // Object content
  return estimateTextTokens(JSON.stringify(content));
}

// ---------------------------------------------------------------------------
// TokenTracker Class
// ---------------------------------------------------------------------------

export class TokenTracker {
  /**
   * Calculate detailed token usage breakdown for a session.
   *
   * @param sessionId - The session identifier
   * @param messages - Array of messages in the session
   * @param systemPromptLength - Length of the system prompt in characters
   * @param sessionSummary - Optional session summary from previous compaction
   * @returns Detailed token usage breakdown
   */
  static async calculateUsage(
    sessionId: string,
    messages: Message[],
    systemPromptLength: number,
    sessionSummary?: string | null
  ): Promise<TokenUsage> {
    const usage: TokenUsage = {
      systemPromptTokens: Math.ceil(systemPromptLength / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS,
      userMessageTokens: 0,
      assistantMessageTokens: 0,
      toolCallTokens: 0,
      toolResultTokens: 0,
      summaryTokens: sessionSummary
        ? estimateMessageTokens({ content: sessionSummary }) + MESSAGE_OVERHEAD_TOKENS
        : 0,
      totalTokens: 0,
    };

    for (const msg of messages) {
      // Skip compacted messages - they're represented in the summary
      if (msg.isCompacted) continue;

      // Use cached token count if available, otherwise estimate
      const baseTokens = msg.tokenCount ?? estimateMessageTokens({ content: msg.content });
      const messageTokens = baseTokens + MESSAGE_OVERHEAD_TOKENS;

      switch (msg.role) {
        case "user":
          usage.userMessageTokens += messageTokens;
          break;

        case "assistant":
          usage.assistantMessageTokens += messageTokens;
          // Also count tool calls within assistant messages
          if (Array.isArray(msg.content)) {
            for (const part of msg.content as Array<{ type?: string }>) {
              if (part.type === "tool-call") {
                usage.toolCallTokens += TOOL_CALL_OVERHEAD_TOKENS;
              }
            }
          }
          break;

        case "tool":
          usage.toolResultTokens += messageTokens;
          break;

        case "system":
          // System messages (other than main prompt) counted separately
          usage.systemPromptTokens += messageTokens;
          break;
      }
    }

    // Calculate total
    usage.totalTokens =
      usage.systemPromptTokens +
      usage.userMessageTokens +
      usage.assistantMessageTokens +
      usage.toolCallTokens +
      usage.toolResultTokens +
      usage.summaryTokens;

    return usage;
  }

  /**
   * Get detailed breakdown with percentages and formatted strings.
   *
   * @param usage - Token usage from calculateUsage
   * @returns Extended breakdown with percentages and formatting
   */
  static getBreakdown(usage: TokenUsage): TokenBreakdown {
    const total = usage.totalTokens || 1; // Avoid division by zero

    const toolsTotal = usage.toolCallTokens + usage.toolResultTokens;

    return {
      ...usage,
      percentages: {
        systemPrompt: (usage.systemPromptTokens / total) * 100,
        userMessages: (usage.userMessageTokens / total) * 100,
        assistantMessages: (usage.assistantMessageTokens / total) * 100,
        toolCalls: (usage.toolCallTokens / total) * 100,
        toolResults: (usage.toolResultTokens / total) * 100,
        summary: (usage.summaryTokens / total) * 100,
      },
      formatted: {
        total: formatTokenCount(usage.totalTokens),
        systemPrompt: formatTokenCount(usage.systemPromptTokens),
        userMessages: formatTokenCount(usage.userMessageTokens),
        assistantMessages: formatTokenCount(usage.assistantMessageTokens),
        tools: formatTokenCount(toolsTotal),
        summary: formatTokenCount(usage.summaryTokens),
      },
    };
  }

  /**
   * Estimate tokens for a new message before sending.
   *
   * @param content - The message content
   * @returns Token estimate with confidence
   */
  static estimateNewMessageTokens(content: unknown): TokenEstimate {
    const tokens = estimateContentTokens(content) + MESSAGE_OVERHEAD_TOKENS;

    return {
      tokens,
      confidence: typeof content === "string" ? "high" : "medium",
      method: "estimated",
    };
  }

  /**
   * Estimate tokens for a complete request (messages + system prompt).
   *
   * @param messages - Array of messages to send
   * @param systemPromptLength - Length of system prompt
   * @param sessionSummary - Optional session summary
   * @returns Total estimated tokens
   */
  static estimateRequestTokens(
    messages: Array<{ role: string; content: unknown }>,
    systemPromptLength: number,
    sessionSummary?: string | null
  ): number {
    let total = Math.ceil(systemPromptLength / CHARS_PER_TOKEN) + MESSAGE_OVERHEAD_TOKENS;

    if (sessionSummary) {
      total += estimateTextTokens(sessionSummary) + MESSAGE_OVERHEAD_TOKENS;
    }

    for (const msg of messages) {
      total += estimateContentTokens(msg.content) + MESSAGE_OVERHEAD_TOKENS;
    }

    return total;
  }

  /**
   * Calculate how many tokens would be freed by compacting messages.
   *
   * @param messagesToCompact - Messages that would be compacted
   * @param estimatedSummaryTokens - Estimated tokens for the summary
   * @returns Net tokens that would be freed
   */
  static calculatePotentialSavings(
    messagesToCompact: Message[],
    estimatedSummaryTokens: number = 500
  ): number {
    let currentTokens = 0;

    for (const msg of messagesToCompact) {
      if (!msg.isCompacted) {
        currentTokens += msg.tokenCount ?? estimateMessageTokens({ content: msg.content });
        currentTokens += MESSAGE_OVERHEAD_TOKENS;
      }
    }

    // Savings = current tokens - summary tokens
    return Math.max(0, currentTokens - estimatedSummaryTokens);
  }

  /**
   * Find optimal compaction boundary to free target tokens.
   *
   * @param messages - All messages in session
   * @param targetTokensToFree - How many tokens we need to free
   * @param keepRecentCount - Minimum recent messages to keep
   * @returns Index of last message to compact, or -1 if not possible
   */
  static findCompactionBoundary(
    messages: Message[],
    targetTokensToFree: number,
    keepRecentCount: number = 6
  ): number {
    if (messages.length <= keepRecentCount) {
      return -1; // Not enough messages to compact
    }

    const maxCompactIndex = messages.length - keepRecentCount - 1;
    let accumulatedTokens = 0;

    for (let i = 0; i <= maxCompactIndex; i++) {
      const msg = messages[i];
      if (!msg.isCompacted) {
        accumulatedTokens += msg.tokenCount ?? estimateMessageTokens({ content: msg.content });
        accumulatedTokens += MESSAGE_OVERHEAD_TOKENS;
      }

      // Account for summary overhead (estimate ~500 tokens for summary)
      const netSavings = accumulatedTokens - 500;

      if (netSavings >= targetTokensToFree) {
        return i;
      }
    }

    // Return max possible boundary even if target not fully met
    return maxCompactIndex >= 0 ? maxCompactIndex : -1;
  }
}

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Format token count for display.
 *
 * @param tokens - Number of tokens
 * @returns Formatted string (e.g., "15.2K", "1.5M")
 */
export function formatTokenCount(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Calculate percentage of context window used.
 *
 * @param currentTokens - Current token count
 * @param maxTokens - Maximum allowed tokens
 * @returns Percentage (0-100)
 */
export function calculateUsagePercentage(currentTokens: number, maxTokens: number): number {
  if (maxTokens <= 0) return 0;
  return (currentTokens / maxTokens) * 100;
}
