/**
 * Prompt Enhancement Memory Optimization Helpers
 *
 * Session-scoped helpers that deduplicate approved memory payloads and
 * avoid re-sending unchanged memory blocks across repeated enhancements.
 */

import { createHash } from "crypto";

const CHARS_PER_TOKEN_ESTIMATE = 4;

export interface MemoryInjectionDecision {
  normalizedMarkdown: string;
  signature: string | null;
  shouldInject: boolean;
  injectedMarkdown: string;
  tokenEstimateBeforeDedup: number;
  tokenEstimateAfterDedup: number;
  tokenEstimateInjected: number;
  dedupedMemoryLineCount: number;
}

export function estimateTokenCount(text: string): number {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN_ESTIMATE);
}

/**
 * Remove duplicate approved memory bullet lines while preserving order.
 * Non-bullet lines (headers/blank lines) are preserved as-is.
 */
export function normalizeApprovedMemoryMarkdown(markdown: string): {
  markdown: string;
  dedupedMemoryLineCount: number;
} {
  const trimmed = markdown.trim();
  if (!trimmed) {
    return { markdown: "", dedupedMemoryLineCount: 0 };
  }

  const seen = new Set<string>();
  const output: string[] = [];
  let dedupedMemoryLineCount = 0;

  for (const line of markdown.split("\n")) {
    const trimmedLine = line.trim();
    if (/^-\s+/.test(trimmedLine)) {
      if (seen.has(trimmedLine)) {
        dedupedMemoryLineCount += 1;
        continue;
      }
      seen.add(trimmedLine);
    }
    output.push(line);
  }

  return {
    markdown: output.join("\n").trim(),
    dedupedMemoryLineCount,
  };
}

export function getMemorySignature(markdown: string): string {
  return createHash("sha256").update(markdown).digest("hex");
}

export function decideMemoryInjection(
  markdown: string,
  previousSignature: string | null | undefined
): MemoryInjectionDecision {
  const tokenEstimateBeforeDedup = estimateTokenCount(markdown);
  const normalized = normalizeApprovedMemoryMarkdown(markdown);
  const tokenEstimateAfterDedup = estimateTokenCount(normalized.markdown);

  if (!normalized.markdown) {
    return {
      normalizedMarkdown: "",
      signature: null,
      shouldInject: false,
      injectedMarkdown: "",
      tokenEstimateBeforeDedup,
      tokenEstimateAfterDedup,
      tokenEstimateInjected: 0,
      dedupedMemoryLineCount: normalized.dedupedMemoryLineCount,
    };
  }

  const signature = getMemorySignature(normalized.markdown);
  const shouldInject = signature !== previousSignature;

  return {
    normalizedMarkdown: normalized.markdown,
    signature,
    shouldInject,
    injectedMarkdown: shouldInject ? normalized.markdown : "",
    tokenEstimateBeforeDedup,
    tokenEstimateAfterDedup,
    tokenEstimateInjected: shouldInject ? tokenEstimateAfterDedup : 0,
    dedupedMemoryLineCount: normalized.dedupedMemoryLineCount,
  };
}
