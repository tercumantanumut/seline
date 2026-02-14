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
  id: string;
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

  const retrievalCommand =
    idType === "logId"
      ? `executeCommand({ command: "readLog", logId: "${id}" })`
      : `retrieveFullContent({ contentId: "${id}" })`;

  return `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️  OUTPUT TRUNCATED TO PREVENT CONTEXT OVERFLOW

Original: ~${estimatedTokens.toLocaleString()} tokens (${originalLength.toLocaleString()} chars)
Showing: ~${maxTokens.toLocaleString()} tokens (${truncatedLength.toLocaleString()} chars)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 FULL OUTPUT AVAILABLE
   Reference ID: ${id}

🔧 TO RETRIEVE FULL OUTPUT:
   ${retrievalCommand}

💡 RECOMMENDATION:
   Only retrieve full output if the truncated portion above is
   insufficient for your task. Consider using grep/filtering
   commands to get specific information instead.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
