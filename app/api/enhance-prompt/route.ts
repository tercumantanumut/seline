/**
 * Prompt Enhancement API
 *
 * Endpoint for manually enhancing prompts with context from synced folders.
 * Called by the "Enhance" button in the chat composer.
 *
 * Supports two modes:
 * - LLM-driven (useLLM: true): Uses secondary LLM to synthesize context
 * - Heuristic (useLLM: false): Uses rule-based enhancement
 */

import { NextRequest, NextResponse } from "next/server";
import { enhancePrompt, type PromptEnhancementResult, type EnhancedPromptOptions } from "@/lib/ai/prompt-enhancement";
import { enhancePromptWithLLM, type LLMEnhancementOptions, type LLMEnhancementResult } from "@/lib/ai/prompt-enhancement-v2";
import { requireAuth, getLocalUser } from "@/lib/auth/local-auth";
import {
  createAgentRun,
  completeAgentRun,
  withRunContext,
} from "@/lib/observability";
import { getOrCreateCharacterSession, createSession } from "@/lib/db/queries";

interface EnhancePromptRequestBody {
  input?: string;
  characterId?: string;
  /** Use LLM-driven enhancement (default: true) */
  useLLM?: boolean;
  /** Recent conversation messages for context */
  conversationContext?: Array<{ role: string; content: string }>;
  /** Options for heuristic enhancement (legacy) */
  options?: EnhancedPromptOptions;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Authenticate the request
    await requireAuth(req);
    const user = await getLocalUser();
    const userId = user.id;

    const body = await req.json() as EnhancePromptRequestBody;
    const { input, characterId, useLLM = true, conversationContext, options } = body;

    // Validate required fields
    if (!input || typeof input !== "string") {
      return NextResponse.json(
        { error: "Input text is required" },
        { status: 400 }
      );
    }

    // characterId is now optional - we can enhance prompts without agent context
    const validCharacterId = characterId && typeof characterId === "string" ? characterId : null;

    // Get or create a session for observability
    // If we have a characterId, use character session; otherwise create a generic session
    let sessionId: string;
    if (validCharacterId) {
      const { session } = await getOrCreateCharacterSession(userId, validCharacterId, "Prompt Enhancement");
      sessionId = session.id;
    } else {
      const session = await createSession({
        title: "Prompt Enhancement",
        userId,
        metadata: { type: "prompt-enhancement" },
      });
      sessionId = session.id;
    }

    // Create agent run for observability
    const agentRun = await createAgentRun({
      sessionId,
      userId,
      pipelineName: "enhance-prompt",
      triggerType: "api",
      characterId: validCharacterId || undefined,
      metadata: {
        inputLength: input.length,
        useLLM,
        hasConversationContext: !!conversationContext?.length,
        hasAgentContext: !!validCharacterId,
      },
    });

    try {
      // Use LLM-driven enhancement by default
      if (useLLM) {
        const result = await withRunContext(
          { runId: agentRun.id, sessionId, pipelineName: "enhance-prompt" },
          async () => {
            const llmOptions: LLMEnhancementOptions = {
              timeoutMs: 45000, // 45s — search + LLM synthesis pipeline needs headroom
              conversationContext,
              userId,
              includeFileTree: true,
              includeMemories: true,
            };
            return enhancePromptWithLLM(input, validCharacterId, llmOptions);
          }
        );

        await completeAgentRun(agentRun.id, "succeeded", {
          enhanced: result.enhanced,
          filesFound: result.filesFound,
          chunksRetrieved: result.chunksRetrieved,
          usedLLM: result.usedLLM,
        });

        return NextResponse.json({
          success: result.enhanced,
          enhancedPrompt: result.prompt,
          originalQuery: result.originalQuery,
          filesFound: result.filesFound,
          chunksRetrieved: result.chunksRetrieved,
          usedLLM: result.usedLLM,
          skipReason: result.skipReason,
          error: result.error,
        });
      }

      // Fallback to heuristic enhancement
      const result = await withRunContext(
        { runId: agentRun.id, sessionId, pipelineName: "enhance-prompt" },
        async () => enhancePrompt(input, validCharacterId, options)
      );

      await completeAgentRun(agentRun.id, "succeeded", {
        enhanced: result.enhanced,
        filesFound: result.filesFound,
        chunksRetrieved: result.chunksRetrieved,
        usedLLM: false,
      });

      return NextResponse.json({
        success: result.enhanced,
        enhancedPrompt: result.prompt,
        originalQuery: result.originalQuery,
        filesFound: result.filesFound,
        chunksRetrieved: result.chunksRetrieved,
        expandedConcepts: result.expandedConcepts,
        dependenciesResolved: result.dependenciesResolved,
        skipReason: result.skipReason,
        usedLLM: false,
      });
    } catch (enhanceError) {
      await completeAgentRun(agentRun.id, "failed", {
        error: enhanceError instanceof Error ? enhanceError.message : "Unknown error",
      });
      throw enhanceError;
    }
  } catch (error) {
    console.error("[EnhancePrompt API] Error:", error);

    // Handle authentication errors
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to enhance prompt" },
      { status: 500 }
    );
  }
}

