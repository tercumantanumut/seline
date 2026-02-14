/**
 * Shared Truncation Utilities
 *
 * Provides unified formatting for truncation markers across all tools.
 */

export type TruncationIdType = "logId" | "contentId";

export interface TruncationMarkerParams {
  originalLength: number;
  truncatedLength: number;
  estimatedTokens: number;
  maxTokens: number;
  /** Optional ID for retrieval. If omitted or "unknown", no retrieval instructions are shown. */
  id?: string;
  idType: TruncationIdType;
}

/**
 * Generate a consistent, high-visibility truncation marker for AI context.
 */
export function generateTruncationMarker(params: TruncationMarkerParams): string {
  const {
    originalLength,
    truncatedLength,
    estimatedTokens,
    maxTokens,
    id,
    idType,
  } = params;

  // Only show retrieval instructions if we have a valid ID
  const hasValidId = id && id !== "unknown";
  
  const retrievalSection = hasValidId
    ? `📦 FULL OUTPUT AVAILABLE
   Reference ID: ${id}

🔧 TO RETRIEVE FULL OUTPUT:
   ${idType === "logId" 
     ? `executeCommand({ command: "readLog", logId: "${id}" })` 
     : `retrieveFullContent({ contentId: "${id}" })`}

💡 RECOMMENDATION:
   Only retrieve full output if the truncated portion above is
   insufficient for your task. Consider using grep/filtering
   commands to get specific information instead.`
    : `⚠️  FULL OUTPUT NOT STORED
   No session context available for storage.
   
💡 TIP:
   Re-run the command with proper session context if you need
   the complete output, or use filtering commands (grep, head, tail)
   to reduce output size.`;

  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  OUTPUT TRUNCATED TO PREVENT CONTEXT OVERFLOW

Original: ~${estimatedTokens.toLocaleString()} tokens (${originalLength.toLocaleString()} chars)
Showing: ~${maxTokens.toLocaleString()} tokens (${truncatedLength.toLocaleString()} chars)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${retrievalSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
