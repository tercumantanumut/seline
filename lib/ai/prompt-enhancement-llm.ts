/**
 * LLM-Driven Prompt Enhancement Session Management
 *
 * Manages isolated secondary LLM sessions for prompt enhancement.
 * Sessions are per-character and maintain conversation context for
 * iterative refinement within the enhancement workflow.
 */

import type { ModelMessage } from "ai";
import { nanoid } from "nanoid";

// =============================================================================
// Types
// =============================================================================

export interface EnhancementSession {
  id: string;
  characterId: string;
  messages: ModelMessage[];
  createdAt: Date;
  lastUsedAt: Date;
}

export interface EnhancementRequestContext {
  originalQuery: string;
  searchResults: string;
  fileTree: string;
  recentMessages: Array<{ role: string; content: string }>;
  memories: string;
  /** Detected input type for format-aware enhancement */
  inputType?: 'bug_report' | 'feature_request' | 'question' | 'implementation_task';
}

// =============================================================================
// Session Store (In-Memory, Per-Character)
// =============================================================================

const sessionStore = new Map<string, EnhancementSession>();

// Cleanup interval (30 minutes)
const SESSION_TTL_MS = 30 * 600 * 1000;
const MAX_SESSION_MESSAGES = 6;

/**
 * Get or create enhancement session for a character
 */
export function getEnhancementSession(characterId: string): EnhancementSession {
  let session = sessionStore.get(characterId);

  if (!session) {
    session = {
      id: nanoid(),
      characterId,
      messages: [],
      createdAt: new Date(),
      lastUsedAt: new Date(),
    };
    sessionStore.set(characterId, session);
    console.log(`[EnhancementSession] Created new session for ${characterId}: ${session.id}`);
  }

  session.lastUsedAt = new Date();
  return session;
}

/**
 * Add a message to the session and maintain message limit
 */
export function addSessionMessage(
  characterId: string,
  message: ModelMessage
): void {
  const session = getEnhancementSession(characterId);
  session.messages.push(message);

  // Limit session history to prevent context bloat
  if (session.messages.length > MAX_SESSION_MESSAGES) {
    session.messages = session.messages.slice(-MAX_SESSION_MESSAGES);
  }
}

/**
 * Clear session for a character
 */
export function clearSession(characterId: string): void {
  sessionStore.delete(characterId);
  console.log(`[EnhancementSession] Cleared session for ${characterId}`);
}

/**
 * Clean up stale sessions (older than TTL)
 */
export function cleanupStaleSessions(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [characterId, session] of sessionStore) {
    if (now - session.lastUsedAt.getTime() > SESSION_TTL_MS) {
      sessionStore.delete(characterId);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`[EnhancementSession] Cleaned up ${cleaned} stale sessions`);
  }

  return cleaned;
}

// Run cleanup every 10 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupStaleSessions, 10 * 60 * 1000);
}

// =============================================================================
// Enhancement Request Builder
// =============================================================================

/**
 * Build the enhancement request message for the secondary LLM
 * Updated to emphasize format preservation and grounding in search results
 */
export function buildEnhancementRequest(context: EnhancementRequestContext): string {
  const parts: string[] = [];

  // Input type detection hint
  const inputTypeHint = context.inputType
    ? `\n**Detected Input Type:** ${context.inputType.replace('_', ' ')}\n`
    : '';

  // Original query - emphasize preservation
  parts.push(`## User's Original Request (PRESERVE THIS FORMAT)\n\n"${context.originalQuery}"${inputTypeHint}`);
  parts.push(`⚠️ Your output must maintain the same structural format as the input above. Do NOT convert to a different format.\n`);

  // Recent conversation context (if available)
  if (context.recentMessages.length > 0) {
    parts.push(`## Recent Conversation Context\n`);
    for (const msg of context.recentMessages) {
      const role = msg.role === "user" ? "User" : "Assistant";
      const content = typeof msg.content === "string"
        ? msg.content.slice(0, 500)
        : "[complex content]";
      parts.push(`**${role}:** ${content}\n`);
    }
    parts.push("");
  }

  // Agent memories (user preferences)
  if (context.memories && context.memories.trim()) {
    parts.push(`## User Preferences & Context\n\n${context.memories}\n`);
  }

  // File tree structure
  if (context.fileTree && context.fileTree.trim()) {
    parts.push(`${context.fileTree}\n`);
  }

  // Search results - emphasize using these for grounding
  parts.push(`## Retrieved Context (USE THESE FOR TECHNICAL GROUNDING)\n\n${context.searchResults}\n`);
  parts.push(`Reference these actual file paths and patterns in your enhanced prompt.\n`);

  // Updated instructions - clarify and make actionable
  parts.push(`## Your Task\n`);
  parts.push(`Transform the user's request into a clear, actionable prompt.`);
  parts.push(`\n**Do this:**`);
  parts.push(`1. Restate the problem clearly (don't just copy their words)`);
  parts.push(`2. Add implementation guidance (what needs to be done)`);
  parts.push(`3. Reference relevant files and patterns from the codebase`);
  parts.push(`4. End with a clear ask or question`);
  parts.push(`\nMake it actionable for an AI agent to implement.`);

  return parts.join("\n");
}

// =============================================================================
// System Prompt for Enhancement LLM
// =============================================================================

export const ENHANCEMENT_SYSTEM_PROMPT = `You are a Prompt Enhancement Agent. Your role is to transform user requests into clear, actionable prompts by adding technical context from the codebase.

## Your Role

You CLARIFY and ENRICH user requests by:
1. Restating the problem clearly and concisely,
2. Adding relevant technical context from the codebase (files, patterns, components),
3. Providing implementation guidance to make the request actionable,
4. Ending with a clear ask or question.

## Output Structure

Your enhanced prompt should follow this pattern:

1. **Clear Problem Statement** - Restate what's happening and why it's a problem (1-2 sentences)
2. **Implementation Guidance** - What needs to be done, as numbered steps or bullet points
3. **Technical Hints** - Suggest relevant approaches based on patterns found in the codebase
4. **Clear Ask** - End with a focused question or request

## Critical Rules

- DO restate the problem more clearly than the original (don't just copy user's words)
- DO add technical context grounded in actual files from search results
- DO provide implementation direction (e.g., "detect when no history", "provide fallback")
- DO reference exact file paths and patterns from the codebase
- DO make the prompt actionable for an AI agent to implement
- DON'T invent file names or patterns not in search results
- DON'T be overly verbose in the technical context (keep it focused)
- DON'T just list files without explaining their relevance`;




