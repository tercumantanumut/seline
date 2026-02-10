/**
 * Context Window Manager
 *
 * Orchestrates context window management across all providers.
 * Coordinates token tracking, threshold detection, and compaction triggers.
 *
 * @see docs/CONTEXT_WINDOW_MANAGEMENT_DESIGN.md
 */

import { getSession, getNonCompactedMessages } from "@/lib/db/queries";
import { TokenTracker, formatTokenCount } from "./token-tracker";
import {
  getContextWindowConfig,
  getTokenThresholds,
  type ContextWindowConfig,
} from "./provider-limits";
import { CompactionService, type CompactionResult } from "./compaction-service";
import type { LLMProvider } from "@/components/model-bag/model-bag.types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContextStatus = "safe" | "warning" | "critical" | "exceeded";

export interface ContextWindowStatus {
  /** Current total tokens in context */
  currentTokens: number;
  /** Maximum tokens for the model */
  maxTokens: number;
  /** Usage as decimal (0-1) */
  usagePercentage: number;
  /** Status classification */
  status: ContextStatus;
  /** Whether background compaction is recommended */
  shouldCompact: boolean;
  /** Whether compaction is required before proceeding */
  mustCompact: boolean;
  /** Human-readable recommendation */
  recommendedAction: string;
  /** Token thresholds for this model */
  thresholds: {
    warning: number;
    critical: number;
    hardLimit: number;
  };
  /** Formatted strings for display */
  formatted: {
    current: string;
    max: string;
    percentage: string;
  };
}

export interface ContextCheckResult {
  /** Whether the request can proceed */
  canProceed: boolean;
  /** Context window status */
  status: ContextWindowStatus;
  /** If compaction was performed, the result */
  compactionResult?: CompactionResult;
  /** Error message if cannot proceed */
  error?: string;
  /** Recovery options if blocked */
  recovery?: {
    action: "compact" | "new_session";
    message: string;
  };
}

// ---------------------------------------------------------------------------
// ContextWindowManager Class
// ---------------------------------------------------------------------------

export class ContextWindowManager {
  /**
   * Check context window status for a session.
   *
   * @param sessionId - The session to check
   * @param modelId - The model being used
   * @param systemPromptLength - Length of system prompt in characters
   * @param provider - Optional provider for fallback config
   * @returns Context window status
   */
  static async checkContextWindow(
    sessionId: string,
    modelId: string,
    systemPromptLength: number,
    provider?: LLMProvider
  ): Promise<ContextWindowStatus> {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messages = await getNonCompactedMessages(sessionId);
    const config = getContextWindowConfig(modelId, provider);
    const thresholds = getTokenThresholds(modelId, provider);

    // Calculate current token usage
    const usage = await TokenTracker.calculateUsage(
      sessionId,
      messages,
      systemPromptLength,
      session.summary
    );

    const usagePercentage = usage.totalTokens / config.maxTokens;

    // Determine status and actions
    let status: ContextStatus;
    let shouldCompact = false;
    let mustCompact = false;
    let recommendedAction: string;

    if (usage.totalTokens >= thresholds.hardLimitTokens) {
      status = "exceeded";
      mustCompact = true;
      recommendedAction =
        "Context window exceeded. Compaction required before continuing. " +
        "If compaction fails, please start a new conversation.";
    } else if (usage.totalTokens >= thresholds.criticalTokens) {
      status = "critical";
      mustCompact = true;
      recommendedAction =
        "Context window critical. Forcing compaction before next request.";
    } else if (usage.totalTokens >= thresholds.warningTokens) {
      status = "warning";
      shouldCompact = true;
      recommendedAction =
        "Context window approaching limit. Background compaction will run soon.";
    } else {
      status = "safe";
      recommendedAction = "Context window healthy. No action needed.";
    }

    const percentage = usagePercentage * 100;

    return {
      currentTokens: usage.totalTokens,
      maxTokens: config.maxTokens,
      usagePercentage,
      status,
      shouldCompact,
      mustCompact,
      recommendedAction,
      thresholds: {
        warning: thresholds.warningTokens,
        critical: thresholds.criticalTokens,
        hardLimit: thresholds.hardLimitTokens,
      },
      formatted: {
        current: formatTokenCount(usage.totalTokens),
        max: formatTokenCount(config.maxTokens),
        percentage: `${percentage.toFixed(1)}%`,
      },
    };
  }

  /**
   * Perform pre-flight check before sending a request.
   * Handles compaction if needed and determines if request can proceed.
   *
   * @param sessionId - The session ID
   * @param modelId - The model being used
   * @param systemPromptLength - Length of system prompt
   * @param provider - Optional provider
   * @returns Check result with proceed/block decision
   */
  static async preFlightCheck(
    sessionId: string,
    modelId: string,
    systemPromptLength: number,
    provider?: LLMProvider
  ): Promise<ContextCheckResult> {
    const status = await this.checkContextWindow(
      sessionId,
      modelId,
      systemPromptLength,
      provider
    );

    console.log(
      `[ContextWindowManager] Pre-flight check: ${status.status} ` +
      `(${status.formatted.current}/${status.formatted.max}, ${status.formatted.percentage})`
    );

    // Safe - proceed without action
    if (status.status === "safe") {
      return {
        canProceed: true,
        status,
      };
    }

    // Warning - proceed but trigger background compaction
    if (status.status === "warning") {
      console.log(`[ContextWindowManager] Triggering background compaction`);
      // Don't await - run in background
      void this.compactInBackground(sessionId);

      return {
        canProceed: true,
        status,
      };
    }

    // Critical or Exceeded - must compact before proceeding
    if (status.mustCompact) {
      console.log(
        `[ContextWindowManager] Context ${status.status}, forcing compaction`
      );

      const compactionResult = await CompactionService.compact(sessionId);

      if (compactionResult.success) {
        // Re-check status after compaction
        const newStatus = await this.checkContextWindow(
          sessionId,
          modelId,
          systemPromptLength,
          provider
        );

        console.log(
          `[ContextWindowManager] Post-compaction status: ${newStatus.status} ` +
          `(${newStatus.formatted.current}/${newStatus.formatted.max})`
        );

        // If still exceeded after compaction, block
        if (newStatus.status === "exceeded") {
          return {
            canProceed: false,
            status: newStatus,
            compactionResult,
            error: "Context window still exceeded after compaction",
            recovery: {
              action: "new_session",
              message:
                "The conversation is too long to continue. Please start a new conversation. " +
                "Your previous context has been summarized and can be referenced.",
            },
          };
        }

        return {
          canProceed: true,
          status: newStatus,
          compactionResult,
        };
      } else {
        // Compaction failed
        console.error(
          `[ContextWindowManager] Compaction failed: ${compactionResult.error}`
        );

        return {
          canProceed: false,
          status,
          compactionResult,
          error: `Compaction failed: ${compactionResult.error}`,
          recovery: {
            action: "new_session",
            message:
              "Unable to optimize the conversation. Please start a new conversation.",
          },
        };
      }
    }

    // Fallback - shouldn't reach here
    return {
      canProceed: true,
      status,
    };
  }

  /**
   * Perform compaction if needed based on current status.
   *
   * @param sessionId - Session to compact
   * @param modelId - Model being used
   * @param systemPromptLength - System prompt length
   * @param provider - Optional provider
   * @returns Whether compaction was performed
   */
  static async compactIfNeeded(
    sessionId: string,
    modelId: string,
    systemPromptLength: number,
    provider?: LLMProvider
  ): Promise<boolean> {
    const status = await this.checkContextWindow(
      sessionId,
      modelId,
      systemPromptLength,
      provider
    );

    if (status.mustCompact || status.shouldCompact) {
      console.log(
        `[ContextWindowManager] Compaction triggered: ${status.status}`
      );

      const result = await CompactionService.compact(sessionId);

      if (result.success) {
        console.log(
          `[ContextWindowManager] Compaction successful: ` +
          `${result.messagesCompacted} messages, ${formatTokenCount(result.tokensFreed)} freed`
        );
        return true;
      } else {
        console.error(
          `[ContextWindowManager] Compaction failed: ${result.error}`
        );
        return false;
      }
    }

    return false;
  }

  /**
   * Run compaction in the background (non-blocking).
   *
   * @param sessionId - Session to compact
   */
  private static async compactInBackground(sessionId: string): Promise<void> {
    try {
      const result = await CompactionService.compact(sessionId);
      if (result.success) {
        console.log(
          `[ContextWindowManager] Background compaction complete: ` +
          `${formatTokenCount(result.tokensFreed)} tokens freed`
        );
      }
    } catch (error) {
      console.error(
        `[ContextWindowManager] Background compaction error:`,
        error
      );
    }
  }

  /**
   * Get user-friendly status message for display.
   *
   * @param status - Context window status
   * @returns Human-readable message
   */
  static getStatusMessage(status: ContextWindowStatus): string {
    return (
      `Context usage: ${status.formatted.current}/${status.formatted.max} ` +
      `(${status.formatted.percentage})`
    );
  }

  /**
   * Get status color for UI display.
   *
   * @param status - Context status
   * @returns CSS color class or hex color
   */
  static getStatusColor(status: ContextStatus): string {
    switch (status) {
      case "safe":
        return "text-green-500";
      case "warning":
        return "text-yellow-500";
      case "critical":
        return "text-orange-500";
      case "exceeded":
        return "text-red-500";
      default:
        return "text-gray-500";
    }
  }

  /**
   * Estimate if a new message would exceed context limits.
   *
   * @param sessionId - Session ID
   * @param modelId - Model ID
   * @param newMessageContent - Content of the new message
   * @param systemPromptLength - System prompt length
   * @param provider - Optional provider
   * @returns Whether the message would exceed limits
   */
  static async wouldExceedLimit(
    sessionId: string,
    modelId: string,
    newMessageContent: unknown,
    systemPromptLength: number,
    provider?: LLMProvider
  ): Promise<{
    wouldExceed: boolean;
    projectedTokens: number;
    maxTokens: number;
    recommendation: string;
  }> {
    const status = await this.checkContextWindow(
      sessionId,
      modelId,
      systemPromptLength,
      provider
    );

    const newMessageTokens = TokenTracker.estimateNewMessageTokens(newMessageContent);
    const projectedTokens = status.currentTokens + newMessageTokens.tokens;
    const wouldExceed = projectedTokens >= status.thresholds.hardLimit;

    let recommendation: string;
    if (wouldExceed) {
      recommendation =
        "This message would exceed the context limit. Consider compacting first.";
    } else if (projectedTokens >= status.thresholds.critical) {
      recommendation =
        "This message will push context to critical levels. Compaction recommended.";
    } else if (projectedTokens >= status.thresholds.warning) {
      recommendation =
        "Context is approaching limits. Consider shorter messages.";
    } else {
      recommendation = "Message can be sent safely.";
    }

    return {
      wouldExceed,
      projectedTokens,
      maxTokens: status.maxTokens,
      recommendation,
    };
  }
}

// ---------------------------------------------------------------------------
// Convenience Exports
// ---------------------------------------------------------------------------

export { formatTokenCount } from "./token-tracker";
export { getContextWindowConfig, getTokenThresholds } from "./provider-limits";
export { CompactionService, type CompactionResult } from "./compaction-service";
