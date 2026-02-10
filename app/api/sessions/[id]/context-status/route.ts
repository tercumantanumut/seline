/**
 * Context Status API Endpoint
 *
 * Returns the current context window status for a session.
 * Used by the UI to display context usage indicators.
 *
 * GET /api/sessions/[id]/context-status
 *
 * @returns {
 *   percentage: number;      // Usage percentage (0-100)
 *   status: string;          // "safe" | "warning" | "critical" | "exceeded"
 *   currentTokens: number;   // Current token count
 *   maxTokens: number;       // Maximum tokens for the model
 *   formatted: {
 *     current: string;       // e.g., "150.2K"
 *     max: string;           // e.g., "200K"
 *     percentage: string;    // e.g., "75.1%"
 *   };
 *   thresholds: {
 *     warning: number;
 *     critical: number;
 *     hardLimit: number;
 *   };
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { ContextWindowManager } from "@/lib/context-window";
import { getSession } from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { getSessionModelId, getSessionProvider } from "@/lib/ai/session-model-resolver";

type RouteParams = {
  params: Promise<{ id: string }>;
};

export async function GET(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    await requireAuth(request);
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get model info from session metadata
    const sessionMetadata = (session.metadata as Record<string, unknown>) || {};
    const modelId = getSessionModelId(sessionMetadata);
    const provider = getSessionProvider(sessionMetadata);

    // Estimate system prompt length (approximate)
    const estimatedSystemPromptLength = 5000;

    // Get context window status
    const status = await ContextWindowManager.checkContextWindow(
      sessionId,
      modelId,
      estimatedSystemPromptLength,
      provider
    );

    return NextResponse.json({
      percentage: status.usagePercentage * 100,
      status: status.status,
      currentTokens: status.currentTokens,
      maxTokens: status.maxTokens,
      formatted: status.formatted,
      thresholds: status.thresholds,
      shouldCompact: status.shouldCompact,
      mustCompact: status.mustCompact,
      recommendedAction: status.recommendedAction,
      model: {
        id: modelId,
        provider,
      },
    });
  } catch (error) {
    console.error("[Context Status API] Error:", error);
    return NextResponse.json(
      { error: "Failed to get context status" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/sessions/[id]/context-status
 *
 * Trigger manual compaction for a session.
 */
export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  try {
    await requireAuth(request);
    const { id: sessionId } = await params;

    const session = await getSession(sessionId);
    if (!session) {
      return NextResponse.json(
        { error: "Session not found" },
        { status: 404 }
      );
    }

    // Get model info from session metadata
    const sessionMetadata = (session.metadata as Record<string, unknown>) || {};
    const modelId = getSessionModelId(sessionMetadata);
    const provider = getSessionProvider(sessionMetadata);

    // Estimate system prompt length
    const estimatedSystemPromptLength = 5000;

    // Force compaction
    const compacted = await ContextWindowManager.compactIfNeeded(
      sessionId,
      modelId,
      estimatedSystemPromptLength,
      provider
    );

    // Get updated status
    const status = await ContextWindowManager.checkContextWindow(
      sessionId,
      modelId,
      estimatedSystemPromptLength,
      provider
    );

    return NextResponse.json({
      success: true,
      compacted,
      status: {
        percentage: status.usagePercentage * 100,
        status: status.status,
        currentTokens: status.currentTokens,
        maxTokens: status.maxTokens,
        formatted: status.formatted,
      },
    });
  } catch (error) {
    console.error("[Context Status API] Compaction error:", error);
    return NextResponse.json(
      { error: "Failed to compact session" },
      { status: 500 }
    );
  }
}
