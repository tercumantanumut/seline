import { storeFullContent } from "@/lib/ai/truncated-content-store";

// Maximum length for any single text content to prevent base64 data from leaking into context
// Maximum text content length before smart truncation kicks in
// Content exceeding this limit is truncated, with full content stored for on-demand retrieval
export const MAX_TEXT_CONTENT_LENGTH = 10000;

// Limit how many missing tool results we attempt to re-fetch per request
export const MAX_TOOL_REFETCH = 6;

export const WEB_SEARCH_NO_RESULT_GUARD = {
  maxConsecutiveZeroResultCalls: 3,
  maxZeroResultRepeatsPerQuery: 2,
} as const;

export function normalizeWebSearchQuery(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function getWebSearchSourceCount(value: unknown): number | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as { sources?: unknown };
  return Array.isArray(candidate.sources) ? candidate.sources.length : null;
}

export function buildWebSearchLoopGuardResult(query: string | null, reason: string) {
  const normalizedQuery = query ?? "unknown query";
  const message =
    `Web search returned no results repeatedly (${reason}). ` +
    "To prevent loops, do not call webSearch again in this response. " +
    "Continue with a best-effort answer and clearly note uncertainty.";

  return {
    status: "success" as const,
    query: normalizedQuery,
    sources: [],
    iterationPerformed: false,
    provider: "loop-guard",
    message,
    formattedResults: message,
  };
}

/**
 * Check if a string looks like base64 image data that shouldn't be in text context
 * This is a safeguard against accidentally including base64 in conversation
 */
export function looksLikeBase64ImageData(text: string): boolean {
  // Base64 image data is typically very long and contains specific patterns
  if (text.length < 1000) return false;

  // Check for data URL pattern
  if (text.includes("data:image/") && text.includes(";base64,")) return true;

  // Check for long base64-like strings (mostly alphanumeric with + and /)
  // A typical base64 image would have very high ratio of base64 chars
  const base64Chars = text.match(/[A-Za-z0-9+/=]/g);
  if (base64Chars && base64Chars.length / text.length > 0.95 && text.length > 5000) {
    return true;
  }

  return false;
}

/**
 * Strip fake tool call JSON from model text output.
 * The LLM sometimes outputs raw JSON like {"type":"tool-call",...} or {"type":"tool-result",...}
 * as plain text instead of using structured tool calls. This creates a feedback loop where
 * the next turn sees this text and mimics it. Stripping it breaks the cycle.
 *
 * Also strips [SYSTEM: Tool ...] markers that the model may echo from previous context.
 */
export function stripFakeToolCallJson(text: string): string {
  // Pattern 1: Multi-line JSON objects with type:tool-call or type:tool-result
  // Uses lazy matching with [\s\S] to handle newlines within JSON
  const multilineJsonPattern = /\{\s*"type"\s*:\s*"tool-(call|result)"[\s\S]*?\}/g;
  let cleaned = text.replace(multilineJsonPattern, '');

  // Pattern 2: [SYSTEM: Tool ...] markers that the model may echo
  // These are internal markers injected into context - the model should never output them
  const systemMarkerPattern = /\[SYSTEM:\s*Tool\s+[^\]]+\]/gi;
  cleaned = cleaned.replace(systemMarkerPattern, '');

  // Pattern 3: Legacy single-line patterns (kept as fallback)
  const linePattern = /^\s*\{[^}]*"type"\s*:\s*"tool-(call|result)"[^\n]*\}\s*$/gm;
  cleaned = cleaned.replace(linePattern, '');

  // Pattern 4: Inline tool JSON without newlines
  const inlinePattern = /\{"type"\s*:\s*"tool-(call|result)"\s*,\s*"toolCallId"\s*:\s*"[^"]*"[^}]*\}/g;
  cleaned = cleaned.replace(inlinePattern, '');

  return cleaned.trim();
}

/**
 * Sanitize text content with smart truncation:
 * - Detects and removes base64 image data (safety mechanism)
 * - Strips [SYSTEM: ...] markers that the model may have echoed from context
 * - Strips fake tool call JSON that may have been output as text
 * - When content exceeds MAX_TEXT_CONTENT_LENGTH:
 *   - Stores full content in session store with unique ID
 *   - Returns truncated content with instructions on how to retrieve full content
 *
 * @param text - The text content to sanitize
 * @param context - Description of where this content came from (for logging)
 * @param sessionId - Optional session ID for storing full content (enables smart truncation)
 */
export function sanitizeTextContent(text: string, context: string, sessionId?: string): string {
  // Strip [SYSTEM: ...] markers that the model may have echoed from previous context
  // These are internal markers and should never be in the model's output
  const systemMarkerPattern = /\[SYSTEM:\s*Tool\s+[^\]]+\]/gi;
  text = text.replace(systemMarkerPattern, '');

  // Strip fake tool call JSON that may have been output as text
  text = stripFakeToolCallJson(text);

  if (looksLikeBase64ImageData(text)) {
    console.warn(`[CHAT API] Detected base64 image data in ${context}, stripping to prevent token overflow`);
    return `[Base64 image data removed - use image URL instead]`;
  }

  // Smart truncation: store full content and provide retrieval instructions
  if (text.length > MAX_TEXT_CONTENT_LENGTH) {
    console.warn(`[CHAT API] Truncating long text in ${context}: ${text.length} chars`);

    // If sessionId is provided, store full content for later retrieval
    if (sessionId) {
      const contentId = storeFullContent(sessionId, context, text, MAX_TEXT_CONTENT_LENGTH);

      const truncatedText = text.slice(0, MAX_TEXT_CONTENT_LENGTH);
      const truncationNotice = `

---
⚠️ CONTENT TRUNCATED: This content was truncated at ${MAX_TEXT_CONTENT_LENGTH.toLocaleString()} characters (original: ${text.length.toLocaleString()} chars).
📦 FULL CONTENT AVAILABLE: Reference ID: ${contentId}
🔧 TO RETRIEVE FULL CONTENT: Use the "retrieveFullContent" tool with contentId="${contentId}"
💡 Only retrieve full content if the truncated portion above is insufficient for your task.
---`;

      return truncatedText + truncationNotice;
    } else {
      // No sessionId - simple truncation without storage (fallback behavior)
      return text.slice(0, MAX_TEXT_CONTENT_LENGTH) + `\n\n[Content truncated at ${MAX_TEXT_CONTENT_LENGTH.toLocaleString()} chars - sessionId not available for full content retrieval]`;
    }
  }

  return text;
}

// ─── Paste content helpers ───────────────────────────────────────────────────
// Large pasted text is sent from the frontend as:
//   [PASTE_CONTENT:N:M]\n{full content}\n[/PASTE_CONTENT:N]
// where N = paste index, M = line count.
//
// For DB storage: strip back to compact placeholder "[Pasted text #N +M lines]"
// For AI: extract blocks before sanitization, re-insert after to bypass truncation

export function stripPasteContentForStorage(text: string): string {
  return text.replace(
    /\[PASTE_CONTENT:(\d+):(\d+)\]\n[\s\S]*?\n\[\/PASTE_CONTENT:\1\]/g,
    (_match, n, m) => `[Pasted text #${n} +${m} lines]`
  );
}

export interface PasteBlock {
  placeholder: string; // e.g. "<<<PASTE_BLOCK_0>>>"
  expanded: string;    // e.g. "[Pasted text #1]:\n{content}"
}

// Extract paste delimiter blocks from text, replacing them with lightweight placeholders.
// The returned cleanedText is safe to pass through sanitizeTextContent without triggering
// truncation on the (large) paste content. Call reinsertPasteBlocks afterwards.
export function extractPasteBlocks(text: string): { cleanedText: string; pasteBlocks: PasteBlock[] } {
  const pasteBlocks: PasteBlock[] = [];
  let blockIndex = 0;
  const cleanedText = text.replace(
    /\[PASTE_CONTENT:(\d+):\d+\]\n([\s\S]*?)\n\[\/PASTE_CONTENT:\1\]/g,
    (_match, n, content) => {
      const placeholder = `<<<PASTE_BLOCK_${blockIndex}>>>`;
      pasteBlocks.push({
        placeholder,
        expanded: `[Pasted text #${n}]:\n${content}`,
      });
      blockIndex++;
      return placeholder;
    }
  );
  return { cleanedText, pasteBlocks };
}

// Re-insert previously extracted paste blocks into sanitized text.
export function reinsertPasteBlocks(text: string, pasteBlocks: PasteBlock[]): string {
  let result = text;
  for (const block of pasteBlocks) {
    result = result.replace(block.placeholder, block.expanded);
  }
  return result;
}

// Strip paste content from a message's text fields before saving to DB.
// Produces a shallow copy of the message with paste delimiters collapsed back to placeholders.
export function stripPasteFromMessageForDB<T extends { content?: unknown; parts?: Array<{ type: string; text?: string; [key: string]: unknown }> }>(msg: T): T {
  if (typeof msg.content === "string") {
    return { ...msg, content: stripPasteContentForStorage(msg.content) };
  }
  if (msg.parts) {
    return {
      ...msg,
      parts: msg.parts.map(part =>
        part.type === "text" && typeof part.text === "string"
          ? { ...part, text: stripPasteContentForStorage(part.text) }
          : part
      ),
    };
  }
  return msg;
}
// ─────────────────────────────────────────────────────────────────────────────
