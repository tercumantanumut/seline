# Context Window Management System - Design Document

**Version:** 1.0  
**Date:** 2026-02-09  
**Status:** Implementation Ready

---

## Executive Summary

This document outlines a comprehensive context window management system for Seline, a multi-provider LLM application that currently hits Anthropic's 200K token limit and becomes unresponsive. The solution implements provider-agnostic token tracking, intelligent message compaction, and graceful error handling across all 7 supported LLM providers (Anthropic, OpenRouter, Antigravity, Codex, Kimi, Ollama, Claude Code) and 4 model roles (chat, research, vision, utility).

---

## 1. Problem Statement

### Current Issues
1. **Hard Limit Failures**: Application hits 200K token limit during chat sessions, displays a toast error, then becomes unresponsive
2. **No Proactive Detection**: No token counting logic to detect approaching limits before hitting hard stop
3. **Missing Compaction Logic**: Existing `compactIfNeeded()` triggers at 70% (140K tokens) but lacks:
   - Real-time token tracking per conversation turn
   - Integration with error handling flow
   - Provider-specific context window awareness
4. **Provider-Agnostic Gap**: System doesn't account for varying context limits across providers:
   - Anthropic Claude: 200K tokens
   - Gemini models: 1M tokens
   - Codex/Kimi models: 128K-256K tokens
5. **Poor User Experience**: When limits are exceeded, users cannot continue conversation—no recovery path

### Impact
- Conversations abruptly freeze at token limit
- Loss of conversation continuity
- User frustration and workflow interruption
- Wasted API calls attempting to send over-limit requests

---

## 2. Research: OpenCode's Compaction Strategy

### Key Findings from OpenCode DCP (Dynamic Context Pruning)

**GitHub Source**: [Opencode-DCP/opencode-dynamic-context-pruning](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning)

#### 2.1 Multi-Strategy Approach

OpenCode uses three complementary strategies:

1. **Automatic Pruning** (Zero LLM cost):
   - **Deduplication**: Removes repeated tool calls (e.g., reading same file multiple times), keeps most recent
   - **Supersede Writes**: Prunes write operations for files subsequently read (current state captured in read)
   - **Purge Errors**: Removes tool inputs for errored tools after N turns (default: 4), preserves error messages

2. **AI-Driven Compaction** (LLM-powered):
   - **Distill Tool**: AI distills valuable context into concise summaries before removing tool content
   - **Compress Tool**: Collapses conversation ranges into single summary
   - **Prune Tool**: AI manually removes completed/noisy tool content

3. **Intelligent Boundary Selection**:
   - **Last N Turns Preservation**: Keeps last 6-10 messages uncompacted (configurable)
   - **Rules Preservation**: Ensures user constraints survive compaction via explicit "Rules & Constraints" section
   - **Session ID Validation**: Defensive checks prevent cross-session contamination

#### 2.2 Token Management

- **Context Limit**: Default 100,000 tokens (configurable, supports "X%" of model's context window)
- **Nudge Frequency**: Reminds AI to use prune tools every 10 tool results
- **Protected Tools**: Never pruned: `task`, `todowrite`, `todoread`, `distill`, `compress`, `prune`, `batch`, `plan_enter`, `plan_exit`
- **Turn Protection**: Optional N-turn protection for recent tool calls

#### 2.3 Observability

- `/dcp context`: Token breakdown by category (system, user, assistant, tools) + savings from pruning
- `/dcp stats`: Cumulative pruning statistics across sessions
- `/dcp sweep`: Manual pruning of tools since last user message

#### 2.4 Key Lessons for Seline

✅ **Adopt**:
- Multi-strategy approach (automatic + AI-driven)
- Preserve last N messages uncompacted
- Track token usage by category
- Protect critical system messages (plans, tasks)

❌ **Avoid**:
- Exposing manual pruning tools to AI (adds complexity)
- Hard-cut boundary selection (loses context)
- Ignoring user constraints in summaries

---

## 3. Proposed Architecture

### 3.1 System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat API Route                           │
│  (app/api/chat/route.ts)                                    │
│                                                              │
│  1. Pre-flight Token Check ─────────┐                       │
│  2. Streaming Response              │                       │
│  3. Error Handling                  │                       │
└──────────────────────────┬──────────┴───────────────────────┘
                           │
                           ↓
┌─────────────────────────────────────────────────────────────┐
│            Context Window Manager                           │
│  (lib/context-window/manager.ts) - NEW                      │
│                                                              │
│  • checkContextWindow(sessionId, provider, model)           │
│  • shouldTriggerCompaction(sessionId, threshold)            │
│  • getContextWindowStatus(sessionId)                        │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ↓                  ↓                  ↓
┌──────────────┐  ┌────────────────┐  ┌──────────────────┐
│ Token        │  │ Provider       │  │ Compaction       │
│ Tracker      │  │ Config         │  │ Service          │
│              │  │                │  │                  │
│ • count()    │  │ • getLimit()   │  │ • compact()      │
│ • estimate() │  │ • getThreshold │  │ • prune()        │
│ • track()    │  │ • isSupported()│  │ • distill()      │
└──────────────┘  └────────────────┘  └──────────────────┘
```

### 3.2 Data Flow

```
User Message
    ↓
1. Load Session + Messages
    ↓
2. Estimate Total Tokens
    ↓
3. Check Context Window
    ├─ < 75% → Proceed normally
    ├─ 75-90% → Trigger background compaction
    ├─ 90-95% → Force compaction, wait for completion
    └─ > 95% → Return error with recovery options
    ↓
4. Apply Compaction (if needed)
    ├─ Automatic Pruning (dedup, supersede writes)
    ├─ AI Summarization (older messages)
    └─ Update session.summary + mark messages compacted
    ↓
5. Build Message Array
    ├─ System prompt (if injection threshold met)
    ├─ Session summary (if exists)
    └─ Non-compacted messages
    ↓
6. Stream Response
    ↓
7. Update Token Tracking
```

---

## 4. Implementation Plan

### Phase 1: Provider Context Window Configuration

**File**: `lib/context-window/provider-limits.ts` (NEW)

```typescript
export interface ContextWindowConfig {
  maxTokens: number;
  warningThreshold: number; // Percentage (e.g., 0.75 = 75%)
  criticalThreshold: number; // Percentage (e.g., 0.90 = 90%)
  hardLimit: number; // Percentage (e.g., 0.95 = 95%)
  supportsStreaming: boolean;
}

export const PROVIDER_CONTEXT_LIMITS: Record<string, ContextWindowConfig> = {
  // Anthropic models
  "claude-sonnet-4-5-20250929": {
    maxTokens: 200000,
    warningThreshold: 0.75,
    criticalThreshold: 0.90,
    hardLimit: 0.95,
    supportsStreaming: true,
  },
  "claude-haiku-4-5-20251001": {
    maxTokens: 200000,
    warningThreshold: 0.75,
    criticalThreshold: 0.90,
    hardLimit: 0.95,
    supportsStreaming: true,
  },
  // ... (all models from model-catalog.ts)
};

export function getContextWindowConfig(modelId: string): ContextWindowConfig {
  return PROVIDER_CONTEXT_LIMITS[modelId] || DEFAULT_CONTEXT_CONFIG;
}
```

**Integration Points**:
- Import context window data from `lib/config/model-catalog.ts`
- Parse string values ("200K", "1M", "256K") to numeric tokens
- Provide fallback for unknown models (128K default)

---

### Phase 2: Token Tracking Service

**File**: `lib/context-window/token-tracker.ts` (NEW)

```typescript
import { estimateMessageTokens } from "@/lib/utils";
import type { Message } from "@/lib/db/schema";

export interface TokenUsage {
  systemPromptTokens: number;
  userMessageTokens: number;
  assistantMessageTokens: number;
  toolCallTokens: number;
  toolResultTokens: number;
  summaryTokens: number;
  totalTokens: number;
}

export class TokenTracker {
  /**
   * Calculate token usage breakdown for a session
   */
  static async calculateUsage(
    sessionId: string,
    messages: Message[],
    systemPromptLength: number,
    sessionSummary?: string | null
  ): Promise<TokenUsage> {
    const usage: TokenUsage = {
      systemPromptTokens: Math.ceil(systemPromptLength / 4), // Rough estimate
      userMessageTokens: 0,
      assistantMessageTokens: 0,
      toolCallTokens: 0,
      toolResultTokens: 0,
      summaryTokens: sessionSummary ? estimateMessageTokens({ content: sessionSummary }) : 0,
      totalTokens: 0,
    };

    for (const msg of messages) {
      if (msg.isCompacted) continue; // Skip compacted messages

      const tokens = msg.tokenCount ?? estimateMessageTokens({ content: msg.content });

      switch (msg.role) {
        case "user":
          usage.userMessageTokens += tokens;
          break;
        case "assistant":
          usage.assistantMessageTokens += tokens;
          break;
        case "tool":
          usage.toolResultTokens += tokens;
          break;
      }

      // Track tool calls separately
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part.type === "tool-call") {
            usage.toolCallTokens += Math.ceil(JSON.stringify(part).length / 4);
          }
        }
      }
    }

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
   * Estimate tokens for a new message before sending
   */
  static estimateNewMessageTokens(content: unknown): number {
    return estimateMessageTokens({ content });
  }
}
```

---

### Phase 3: Enhanced Compaction Service

**File**: `lib/context-window/compaction-service.ts` (NEW - replaces `lib/sessions/compaction.ts`)

```typescript
import { generateText } from "ai";
import { getUtilityModel } from "@/lib/ai/providers";
import {
  getNonCompactedMessages,
  updateSessionSummary,
  markMessagesAsCompacted,
  getSession,
} from "@/lib/db/queries";
import type { Message } from "@/lib/db/schema";
import { TokenTracker } from "./token-tracker";

export interface CompactionResult {
  success: boolean;
  tokensFreed: number;
  messagesCompacted: number;
  newSummary: string;
  error?: string;
}

export interface CompactionOptions {
  keepRecentMessages: number; // Default: 6
  maxSummaryTokens: number; // Default: 2000
  preserveRules: boolean; // Default: true
  preserveToolResults: string[]; // Tool names to never compact
}

const DEFAULT_OPTIONS: CompactionOptions = {
  keepRecentMessages: 6,
  maxSummaryTokens: 2000,
  preserveRules: true,
  preserveToolResults: ["updatePlan", "executeCommand"], // Critical tools
};

const ENHANCED_COMPACTION_PROMPT = `You are a conversation summarizer for an AI coding assistant. Create a structured summary that enables seamless continuation.

**REQUIRED SECTIONS:**

1. **Primary Intent**: What is the user trying to accomplish?
2. **Files & Code**: Which files were discussed/modified? Include key code snippets.
3. **Decisions Made**: Important technical decisions and rationale.
4. **Current State**: What's working, what's in progress, what's broken?
5. **Rules & Constraints**: User preferences, restrictions, or requirements that MUST be preserved.
6. **Next Steps**: Pending tasks or planned actions.

**FORMATTING RULES:**
- Be concise but preserve critical details
- Use bullet points for readability
- Include file paths and function names exactly
- Preserve error messages and stack traces if relevant
- DO NOT lose user constraints or preferences

Previous conversation summary (if any):
{previousSummary}

New messages to incorporate:
{conversationText}

Generate the structured summary:`;

export class CompactionService {
  /**
   * Automatic pruning strategies (zero LLM cost)
   */
  static async autoPrune(sessionId: string, messages: Message[]): Promise<number> {
    let tokensFreed = 0;

    // Strategy 1: Deduplicate tool results
    tokensFreed += await this.deduplicateToolResults(sessionId, messages);

    // Strategy 2: Supersede writes with subsequent reads
    tokensFreed += await this.supersedeWrites(sessionId, messages);

    // Strategy 3: Purge old error results
    tokensFreed += await this.purgeOldErrors(sessionId, messages);

    return tokensFreed;
  }

  /**
   * AI-driven compaction (LLM-powered summarization)
   */
  static async compact(
    sessionId: string,
    options: Partial<CompactionOptions> = {}
  ): Promise<CompactionResult> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const session = await getSession(sessionId);
    if (!session) {
      return { success: false, tokensFreed: 0, messagesCompacted: 0, newSummary: "", error: "Session not found" };
    }

    const messages = await getNonCompactedMessages(sessionId);
    if (messages.length < opts.keepRecentMessages + 2) {
      return { success: false, tokensFreed: 0, messagesCompacted: 0, newSummary: "", error: "Not enough messages to compact" };
    }

    // Step 1: Run auto-pruning first
    const autoPrunedTokens = await this.autoPrune(sessionId, messages);

    // Step 2: Identify messages to compact (keep recent N)
    const messagesToCompact = messages.slice(0, -opts.keepRecentMessages);
    const lastMessageToCompact = messagesToCompact[messagesToCompact.length - 1];

    // Step 3: Format for summarization
    const conversationText = this.formatMessagesForSummary(messagesToCompact, opts.preserveRules);

    // Step 4: Build prompt
    const prompt = ENHANCED_COMPACTION_PROMPT
      .replace("{previousSummary}", session.summary || "None")
      .replace("{conversationText}", conversationText);

    try {
      // Step 5: Generate summary
      const { text: newSummary } = await generateText({
        model: getUtilityModel(),
        prompt,
        maxOutputTokens: opts.maxSummaryTokens,
      });

      // Step 6: Calculate tokens freed
      const tokensBeforeCompaction = messagesToCompact.reduce(
        (sum, msg) => sum + (msg.tokenCount ?? 0),
        0
      );
      const summaryTokens = Math.ceil(newSummary.length / 4);
      const tokensFreed = tokensBeforeCompaction - summaryTokens + autoPrunedTokens;

      // Step 7: Update database
      await updateSessionSummary(sessionId, newSummary, lastMessageToCompact.id);
      await markMessagesAsCompacted(sessionId, lastMessageToCompact.id);

      return {
        success: true,
        tokensFreed,
        messagesCompacted: messagesToCompact.length,
        newSummary,
      };
    } catch (error) {
      console.error("[CompactionService] Failed to compact:", error);
      return {
        success: false,
        tokensFreed: autoPrunedTokens,
        messagesCompacted: 0,
        newSummary: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Format messages for summarization with rule extraction
   */
  private static formatMessagesForSummary(messages: Message[], preserveRules: boolean): string {
    const formatted: string[] = [];
    const userRules: string[] = [];

    for (const msg of messages) {
      const role = msg.role.toUpperCase();
      let content: string;

      if (typeof msg.content === "string") {
        content = msg.content;
        // Extract rules from user messages
        if (preserveRules && msg.role === "user") {
          const rulePatterns = [
            /don't|do not|never|always|must|should|prefer/i,
            /constraint|requirement|rule|policy/i,
          ];
          if (rulePatterns.some(pattern => pattern.test(content))) {
            userRules.push(content);
          }
        }
      } else if (Array.isArray(msg.content)) {
        content = (msg.content as Array<{ type: string; text?: string }>)
          .map((part) => {
            if (part.type === "text" && part.text) return part.text;
            if (part.type === "image") return "[Image]";
            if (part.type === "tool-call") return `[Tool: ${msg.toolName || "unknown"}]`;
            return "[Content]";
          })
          .join(" ");
      } else {
        content = JSON.stringify(msg.content);
      }

      formatted.push(`${role}: ${content}`);
    }

    let result = formatted.join("\n\n");
    if (userRules.length > 0) {
      result += `\n\n**DETECTED USER RULES (MUST PRESERVE):**\n${userRules.map(r => `- ${r}`).join("\n")}`;
    }

    return result;
  }

  /**
   * Deduplicate repeated tool calls (keep most recent)
   */
  private static async deduplicateToolResults(sessionId: string, messages: Message[]): Promise<number> {
    // Implementation: Track tool calls by (toolName + args hash), mark older duplicates as compacted
    // Return estimated tokens freed
    return 0; // Placeholder
  }

  /**
   * Supersede write operations with subsequent reads
   */
  private static async supersedeWrites(sessionId: string, messages: Message[]): Promise<number> {
    // Implementation: Find write operations followed by reads of same file, mark writes as compacted
    return 0; // Placeholder
  }

  /**
   * Purge error results older than N turns
   */
  private static async purgeOldErrors(sessionId: string, messages: Message[], maxAge: number = 4): Promise<number> {
    // Implementation: Find tool results with errors, check age, mark as compacted if > maxAge turns
    return 0; // Placeholder
  }
}
```

---

### Phase 4: Context Window Manager

**File**: `lib/context-window/manager.ts` (NEW)

```typescript
import { getSession, getNonCompactedMessages } from "@/lib/db/queries";
import { TokenTracker } from "./token-tracker";
import { getContextWindowConfig } from "./provider-limits";
import { CompactionService } from "./compaction-service";
import type { LLMProvider } from "@/components/model-bag/model-bag.types";

export interface ContextWindowStatus {
  currentTokens: number;
  maxTokens: number;
  usagePercentage: number;
  status: "safe" | "warning" | "critical" | "exceeded";
  shouldCompact: boolean;
  mustCompact: boolean;
  recommendedAction: string;
}

export class ContextWindowManager {
  /**
   * Check context window status for a session
   */
  static async checkContextWindow(
    sessionId: string,
    modelId: string,
    systemPromptLength: number
  ): Promise<ContextWindowStatus> {
    const session = await getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const messages = await getNonCompactedMessages(sessionId);
    const config = getContextWindowConfig(modelId);

    // Calculate current token usage
    const usage = await TokenTracker.calculateUsage(
      sessionId,
      messages,
      systemPromptLength,
      session.summary
    );

    const usagePercentage = usage.totalTokens / config.maxTokens;

    // Determine status and actions
    let status: ContextWindowStatus["status"];
    let shouldCompact = false;
    let mustCompact = false;
    let recommendedAction = "";

    if (usagePercentage >= config.hardLimit) {
      status = "exceeded";
      mustCompact = true;
      recommendedAction = "Context window exceeded. Compaction required before continuing.";
    } else if (usagePercentage >= config.criticalThreshold) {
      status = "critical";
      mustCompact = true;
      recommendedAction = "Context window critical. Forcing compaction.";
    } else if (usagePercentage >= config.warningThreshold) {
      status = "warning";
      shouldCompact = true;
      recommendedAction = "Context window approaching limit. Compaction recommended.";
    } else {
      status = "safe";
      recommendedAction = "Context window healthy.";
    }

    return {
      currentTokens: usage.totalTokens,
      maxTokens: config.maxTokens,
      usagePercentage,
      status,
      shouldCompact,
      mustCompact,
      recommendedAction,
    };
  }

  /**
   * Perform compaction if needed based on status
   */
  static async compactIfNeeded(sessionId: string, modelId: string, systemPromptLength: number): Promise<boolean> {
    const status = await this.checkContextWindow(sessionId, modelId, systemPromptLength);

    if (status.mustCompact || status.shouldCompact) {
      console.log(`[ContextWindowManager] Compaction triggered for session ${sessionId}: ${status.status}`);
      const result = await CompactionService.compact(sessionId);

      if (result.success) {
        console.log(
          `[ContextWindowManager] Compaction successful: ` +
          `${result.messagesCompacted} messages compacted, ${result.tokensFreed} tokens freed`
        );
        return true;
      } else {
        console.error(`[ContextWindowManager] Compaction failed: ${result.error}`);
        return false;
      }
    }

    return false;
  }

  /**
   * Get user-friendly status message
   */
  static getStatusMessage(status: ContextWindowStatus): string {
    const percentage = (status.usagePercentage * 100).toFixed(1);
    return `Context usage: ${status.currentTokens.toLocaleString()}/${status.maxTokens.toLocaleString()} tokens (${percentage}%)`;
  }
}
```

---

### Phase 5: Integration with Chat API

**File**: `app/api/chat/route.ts` (MODIFY)

**Changes**:

1. **Import new modules** (top of file):
```typescript
import { ContextWindowManager } from "@/lib/context-window/manager";
import { getContextWindowConfig } from "@/lib/context-window/provider-limits";
```

2. **Replace existing compaction call** (around line 1467):
```typescript
// OLD:
await compactIfNeeded(sessionId);

// NEW:
const contextStatus = await ContextWindowManager.checkContextWindow(
  sessionId,
  AI_CONFIG.model,
  systemPrompt.length
);

if (contextStatus.status === "exceeded") {
  // Return error with recovery options
  return new Response(
    JSON.stringify({
      error: "Context window limit exceeded",
      details: ContextWindowManager.getStatusMessage(contextStatus),
      recovery: {
        action: "compact",
        message: "Please wait while we compress the conversation history...",
      },
    }),
    { status: 413, headers: { "Content-Type": "application/json" } }
  );
}

if (contextStatus.mustCompact) {
  // Force compaction before proceeding
  const compacted = await ContextWindowManager.compactIfNeeded(
    sessionId,
    AI_CONFIG.model,
    systemPrompt.length
  );
  if (!compacted) {
    return new Response(
      JSON.stringify({
        error: "Failed to compact conversation history",
        details: "Please try starting a new conversation.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

// Background compaction for warning status
if (contextStatus.shouldCompact) {
  void ContextWindowManager.compactIfNeeded(sessionId, AI_CONFIG.model, systemPrompt.length);
}
```

3. **Add error handler for streaming** (around line 574):
```typescript
onError: (error) => {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorMessageLower = errorMessage.toLowerCase();
  
  // Detect context window errors
  const isContextError =
    errorMessageLower.includes("context") ||
    errorMessageLower.includes("token limit") ||
    errorMessageLower.includes("too many tokens") ||
    errorMessageLower.includes("maximum context length");
  
  const isCreditError =
    errorMessageLower.includes("insufficient") ||
    errorMessageLower.includes("quota") ||
    errorMessageLower.includes("credit") ||
    errorMessageLower.includes("429");
  
  if (isContextError) {
    console.error(`[CHAT API] Context window error: ${errorMessage}`);
    // Trigger emergency compaction
    void ContextWindowManager.compactIfNeeded(sessionId, AI_CONFIG.model, systemPrompt.length);
  }
  
  void finalizeFailedRun(errorMessage, isCreditError || isContextError);
},
```

---

### Phase 6: UI Enhancements

**File**: `components/chat/chat-interface.tsx` (MODIFY)

**Add context window status indicator**:

```typescript
// Add state for context status
const [contextStatus, setContextStatus] = useState<{
  percentage: number;
  status: "safe" | "warning" | "critical";
} | null>(null);

// Fetch context status periodically
useEffect(() => {
  if (!sessionId) return;
  
  const fetchContextStatus = async () => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/context-status`);
      if (response.ok) {
        const data = await response.json();
        setContextStatus(data);
      }
    } catch (error) {
      console.error("Failed to fetch context status:", error);
    }
  };
  
  fetchContextStatus();
  const interval = setInterval(fetchContextStatus, 30000); // Every 30s
  return () => clearInterval(interval);
}, [sessionId]);

// Render status bar
{contextStatus && contextStatus.percentage > 75 && (
  <div className={`px-4 py-2 text-sm ${
    contextStatus.status === "critical" ? "bg-red-500/10 text-red-500" :
    contextStatus.status === "warning" ? "bg-yellow-500/10 text-yellow-500" :
    "bg-blue-500/10 text-blue-500"
  }`}>
    Context usage: {contextStatus.percentage.toFixed(1)}%
    {contextStatus.status === "critical" && " - Compaction in progress"}
  </div>
)}
```

**File**: `app/api/sessions/[id]/context-status/route.ts` (NEW)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { ContextWindowManager } from "@/lib/context-window/manager";
import { getSession } from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  await requireAuth();
  const sessionId = params.id;

  const session = await getSession(sessionId);
  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  // Get model from session metadata or default
  const modelId = (session.metadata as any)?.sessionChatModel || "claude-sonnet-4-5-20250929";
  
  const status = await ContextWindowManager.checkContextWindow(
    sessionId,
    modelId,
    5000 // Approximate system prompt length
  );

  return NextResponse.json({
    percentage: status.usagePercentage * 100,
    status: status.status,
    currentTokens: status.currentTokens,
    maxTokens: status.maxTokens,
  });
}
```

---

### Phase 7: Database Schema Updates

**File**: `lib/db/sqlite-schema.ts` (MODIFY)

**Add context window tracking fields to sessions table**:

```typescript
export const sessions = sqliteTable(
  "sessions",
  {
    // ... existing fields ...
    
    // NEW: Context window tracking
    lastCompactionAt: text("last_compaction_at"),
    compactionCount: integer("compaction_count").default(0).notNull(),
    tokensFreedByCompaction: integer("tokens_freed_by_compaction").default(0).notNull(),
  },
  // ... indexes ...
);
```

**Migration**:
```sql
ALTER TABLE sessions ADD COLUMN last_compaction_at TEXT;
ALTER TABLE sessions ADD COLUMN compaction_count INTEGER DEFAULT 0 NOT NULL;
ALTER TABLE sessions ADD COLUMN tokens_freed_by_compaction INTEGER DEFAULT 0 NOT NULL;
```

---

## 5. Error Handling & Recovery

### 5.1 Error Detection Points

1. **Pre-flight Check** (before API call):
   - Check context status
   - If exceeded, return 413 with recovery instructions

2. **Streaming Error** (during API call):
   - Catch context window errors in `onError` handler
   - Trigger emergency compaction
   - Notify user via toast

3. **Post-processing** (after response):
   - Update token tracking
   - Check if approaching limits
   - Schedule background compaction

### 5.2 User-Facing Error Messages

**Toast Notifications**:

```typescript
// Warning (75-90%)
toast.warning("Context window approaching limit. Optimizing conversation history...");

// Critical (90-95%)
toast.error("Context window critical. Compacting conversation before continuing...");

// Exceeded (>95%)
toast.error("Context window limit reached. Please wait while we optimize the conversation.");

// Compaction Success
toast.success("Conversation optimized. You can continue chatting.");

// Compaction Failure
toast.error("Unable to optimize conversation. Consider starting a new chat.");
```

### 5.3 Recovery Actions

**Option 1: Automatic Compaction** (preferred)
- Trigger compaction automatically
- Show loading state
- Resume conversation after completion

**Option 2: Manual Compaction** (fallback)
- Show "Optimize Conversation" button
- User triggers compaction explicitly
- Display progress indicator

**Option 3: New Conversation** (last resort)
- Offer "Start Fresh" button
- Preserve current conversation (archived)
- Create new session with summary of previous context

---

## 6. Testing Strategy

### 6.1 Unit Tests

**File**: `tests/lib/context-window/token-tracker.test.ts` (NEW)

```typescript
describe("TokenTracker", () => {
  it("should calculate token usage accurately", async () => {
    const messages = [
      { role: "user", content: "Hello", tokenCount: 5 },
      { role: "assistant", content: "Hi there!", tokenCount: 8 },
    ];
    const usage = await TokenTracker.calculateUsage("session-1", messages, 1000, null);
    expect(usage.totalTokens).toBeGreaterThan(0);
  });
});
```

**File**: `tests/lib/context-window/compaction-service.test.ts` (NEW)

```typescript
describe("CompactionService", () => {
  it("should compact messages successfully", async () => {
    const result = await CompactionService.compact("session-1");
    expect(result.success).toBe(true);
    expect(result.tokensFreed).toBeGreaterThan(0);
  });
});
```

### 6.2 Integration Tests

**File**: `tests/integration/context-window.test.ts` (NEW)

```typescript
describe("Context Window Management", () => {
  it("should trigger compaction at warning threshold", async () => {
    // Create session with 150K tokens
    // Send new message
    // Verify compaction triggered
  });

  it("should block requests at hard limit", async () => {
    // Create session at 95% capacity
    // Attempt to send message
    // Verify 413 error returned
  });
});
```

### 6.3 End-to-End Tests

**Scenarios**:
1. **Normal conversation** (< 75% tokens): No compaction triggered
2. **Long conversation** (75-90% tokens): Background compaction triggered
3. **Very long conversation** (90-95% tokens): Forced compaction before response
4. **Limit exceeded** (>95% tokens): Error returned with recovery options
5. **Compaction failure**: Graceful degradation to "Start New Conversation"

---

## 7. Monitoring & Observability

### 7.1 Metrics to Track

1. **Session Metrics**:
   - Average tokens per session
   - Sessions hitting warning threshold
   - Sessions hitting critical threshold
   - Sessions exceeding hard limit

2. **Compaction Metrics**:
   - Compaction frequency per session
   - Average tokens freed per compaction
   - Compaction success rate
   - Compaction duration

3. **Provider Metrics**:
   - Context window usage by provider
   - Model-specific token consumption patterns

### 7.2 Logging

**Enhanced logging in ContextWindowManager**:

```typescript
console.log(`[ContextWindow] Session ${sessionId} status: ${status.status}`);
console.log(`[ContextWindow] Usage: ${status.currentTokens}/${status.maxTokens} (${(status.usagePercentage * 100).toFixed(1)}%)`);
console.log(`[ContextWindow] Action: ${status.recommendedAction}`);
```

**Compaction audit trail**:

```typescript
console.log(`[Compaction] Started for session ${sessionId}`);
console.log(`[Compaction] Messages to compact: ${messagesToCompact.length}`);
console.log(`[Compaction] Tokens before: ${tokensBeforeCompaction}`);
console.log(`[Compaction] Tokens after: ${summaryTokens}`);
console.log(`[Compaction] Tokens freed: ${tokensFreed}`);
```

---

## 8. Migration Path

### 8.1 Backward Compatibility

- Existing `compactIfNeeded()` in `lib/sessions/compaction.ts` will be deprecated but kept for 1 release cycle
- New system will coexist initially, then replace old system
- Database schema changes are additive (no breaking changes)

### 8.2 Rollout Plan

**Phase 1: Foundation** (Week 1)
- Implement provider limits configuration
- Implement token tracker
- Add database schema changes

**Phase 2: Core Logic** (Week 2)
- Implement enhanced compaction service
- Implement context window manager
- Add unit tests

**Phase 3: Integration** (Week 3)
- Integrate with chat API route
- Add UI status indicators
- Add error handling

**Phase 4: Testing & Polish** (Week 4)
- Integration tests
- End-to-end tests
- Performance optimization
- Documentation

**Phase 5: Deployment** (Week 5)
- Deploy to staging
- Monitor metrics
- Gradual rollout to production
- Remove old compaction system

---

## 9. Success Criteria

### 9.1 Functional Requirements

✅ **Must Have**:
- [ ] Proactive detection of approaching context limits (75% threshold)
- [ ] Automatic compaction at critical threshold (90%)
- [ ] Graceful error handling at hard limit (95%)
- [ ] Provider-agnostic implementation (works across all 7 providers)
- [ ] Preserve user constraints and rules in summaries
- [ ] UI indicator for context window status
- [ ] Recovery path when limits are exceeded

✅ **Should Have**:
- [ ] Automatic pruning strategies (deduplication, supersede writes)
- [ ] Token usage breakdown by category
- [ ] Compaction metrics and logging
- [ ] Background compaction (non-blocking)

✅ **Nice to Have**:
- [ ] Manual compaction trigger (user-initiated)
- [ ] Context window visualization
- [ ] Per-session compaction history
- [ ] Export conversation before compaction

### 9.2 Performance Requirements

- Compaction should complete in < 5 seconds for 100 messages
- Token tracking overhead < 50ms per request
- No blocking UI during background compaction
- Memory usage increase < 10% for tracking

### 9.3 User Experience Requirements

- No more "frozen" conversations at token limit
- Clear visibility into context window status
- Seamless continuation after compaction
- No loss of critical conversation context

---

## 10. Risks & Mitigations

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Compaction loses critical context | High | Medium | Enhanced prompt with structured sections, preserve rules |
| Compaction too slow (blocks conversation) | High | Low | Background compaction at warning threshold, not critical |
| Token estimation inaccurate | Medium | Medium | Use actual API token counts when available, calibrate estimator |
| Provider-specific edge cases | Medium | Medium | Comprehensive testing across all providers, fallback configs |
| Database migration issues | Low | Low | Additive schema changes, backward compatible |
| Compaction fails repeatedly | High | Low | Graceful degradation to "Start New Conversation" |

---

## 11. Future Enhancements

### 11.1 Phase 2 Features (Post-MVP)

1. **Smart Compaction**:
   - Use embeddings to identify semantically similar messages
   - Preserve unique information, merge repetitive content

2. **User-Controlled Compaction**:
   - Manual trigger via UI button
   - Configure compaction aggressiveness (conservative/aggressive)
   - Pin important messages to never compact

3. **Multi-Session Context**:
   - Share summaries across related sessions
   - "Continue from previous conversation" feature

4. **Advanced Pruning**:
   - LLM-driven tool result pruning (expose prune tool to AI)
   - Semantic deduplication (not just exact matches)

5. **Analytics Dashboard**:
   - Context window usage trends
   - Compaction efficiency metrics
   - Provider comparison

---

## 12. Appendix

### 12.1 Token Estimation Formula

Current implementation uses:
```typescript
tokens ≈ characters / 4
```

**Improvements**:
- Use `tiktoken` library for accurate token counting (OpenAI models)
- Use provider-specific tokenizers when available
- Cache token counts in database (avoid re-calculation)

### 12.2 Provider Context Limits Reference

| Provider | Model | Context Window | Source |
|----------|-------|----------------|--------|
| Anthropic | Claude Sonnet 4.5 | 200K | model-catalog.ts |
| Anthropic | Claude Haiku 4.5 | 200K | model-catalog.ts |
| Anthropic | Claude Opus 4.5 | 200K | model-catalog.ts |
| Antigravity | Gemini 3 Pro | 1M | model-catalog.ts |
| Antigravity | Gemini 3 Flash | 1M | model-catalog.ts |
| Codex | GPT-5.3 | 256K | model-catalog.ts |
| Codex | GPT-5.1 | 128K | model-catalog.ts |
| Kimi | Kimi K2.5 | 256K | model-catalog.ts |
| Kimi | Kimi K2 | 128K | model-catalog.ts |
| Claude Code | Claude Opus 4.6 | 200K | model-catalog.ts |

### 12.3 References

- [OpenCode DCP Plugin](https://github.com/Opencode-DCP/opencode-dynamic-context-pruning)
- [OpenCode Compaction Epic #4102](https://github.com/sst/opencode/issues/4102)
- [Context Compaction Research Gist](https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f)
- [Anthropic Context Window Best Practices](https://docs.anthropic.com/claude/docs/context-window-management)

---

## 13. Implementation Checklist

### Phase 1: Foundation
- [ ] Create `lib/context-window/provider-limits.ts`
- [ ] Parse context window strings from `model-catalog.ts`
- [ ] Add default fallback configuration
- [ ] Write unit tests for provider limits

### Phase 2: Token Tracking
- [ ] Create `lib/context-window/token-tracker.ts`
- [ ] Implement `calculateUsage()` method
- [ ] Implement `estimateNewMessageTokens()` method
- [ ] Write unit tests for token tracker

### Phase 3: Compaction Service
- [ ] Create `lib/context-window/compaction-service.ts`
- [ ] Implement `autoPrune()` method
- [ ] Implement `compact()` method with enhanced prompt
- [ ] Implement pruning strategies (dedup, supersede, purge errors)
- [ ] Write unit tests for compaction service

### Phase 4: Context Window Manager
- [ ] Create `lib/context-window/manager.ts`
- [ ] Implement `checkContextWindow()` method
- [ ] Implement `compactIfNeeded()` method
- [ ] Write unit tests for manager

### Phase 5: Chat API Integration
- [ ] Import new modules in `app/api/chat/route.ts`
- [ ] Replace old `compactIfNeeded()` call
- [ ] Add pre-flight context check
- [ ] Add streaming error handler for context errors
- [ ] Add background compaction trigger

### Phase 6: UI Enhancements
- [ ] Add context status state to `chat-interface.tsx`
- [ ] Implement status bar component
- [ ] Create `/api/sessions/[id]/context-status` endpoint
- [ ] Add toast notifications for compaction events

### Phase 7: Database Updates
- [ ] Add new fields to `sessions` table schema
- [ ] Create migration script
- [ ] Update database queries to include new fields
- [ ] Test migration on staging database

### Phase 8: Testing
- [ ] Write unit tests for all new modules
- [ ] Write integration tests for compaction flow
- [ ] Write E2E tests for user scenarios
- [ ] Manual testing across all 7 providers

### Phase 9: Documentation
- [ ] Update README with context window management info
- [ ] Create user guide for context window features
- [ ] Document compaction behavior for developers
- [ ] Add troubleshooting guide

### Phase 10: Deployment
- [ ] Deploy to staging environment
- [ ] Monitor metrics and logs
- [ ] Gradual rollout to production (10% → 50% → 100%)
- [ ] Deprecate old compaction system
- [ ] Post-deployment monitoring

---

**Document Status**: Ready for Implementation  
**Next Steps**: Begin Phase 1 (Foundation) implementation  
**Owner**: Development Team  
**Reviewers**: Architecture Team, QA Team
