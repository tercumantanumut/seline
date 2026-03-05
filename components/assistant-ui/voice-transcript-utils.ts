export interface TranscriptInsertion {
  replacementText: string;
  nextValue: string;
  selectionStart: number;
  selectionEnd: number;
  nextCursor: number;
}

export interface BuildTranscriptInsertionParams {
  currentValue: string;
  transcript: string;
  selectionStart?: number | null;
  selectionEnd?: number | null;
}

export interface FinalizeTranscriptParams {
  transcript: string;
  postProcessingEnabled: boolean;
  enhancedText?: string | null;
}

export interface FinalizeTranscriptResult {
  transcript: string;
  finalText: string;
  fallbackText: string;
  usedEnhancedText: boolean;
}

const LEADING_PUNCTUATION = /^[.,!?;:)\]}]/;
const TRAILING_PUNCTUATION = /^[.,!?;:)\]}]/;

export function normalizeTranscriptText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function padTranscriptText(
  transcript: string,
  leftContext: string,
  rightContext: string,
): string {
  const normalizedTranscript = normalizeTranscriptText(transcript);
  if (!normalizedTranscript) {
    return "";
  }

  const leftChar = leftContext.slice(-1);
  const rightChar = rightContext.slice(0, 1);

  const addLeadingSpace =
    leftChar.length > 0 &&
    !/\s/.test(leftChar) &&
    !LEADING_PUNCTUATION.test(normalizedTranscript);

  const addTrailingSpace =
    rightChar.length > 0 &&
    !/\s/.test(rightChar) &&
    !TRAILING_PUNCTUATION.test(rightChar);

  return `${addLeadingSpace ? " " : ""}${normalizedTranscript}${addTrailingSpace ? " " : ""}`;
}

export function buildTranscriptInsertion({
  currentValue,
  transcript,
  selectionStart,
  selectionEnd,
}: BuildTranscriptInsertionParams): TranscriptInsertion | null {
  const value = typeof currentValue === "string" ? currentValue : "";
  const boundedStart = Math.max(0, Math.min(selectionStart ?? value.length, value.length));
  const boundedEnd = Math.max(boundedStart, Math.min(selectionEnd ?? boundedStart, value.length));

  const leftContext = value.slice(0, boundedStart);
  const rightContext = value.slice(boundedEnd);
  const replacementText = padTranscriptText(transcript, leftContext, rightContext);

  if (!replacementText) {
    return null;
  }

  const nextValue = `${leftContext}${replacementText}${rightContext}`;
  const nextCursor = leftContext.length + replacementText.length;

  return {
    replacementText,
    nextValue,
    selectionStart: boundedStart,
    selectionEnd: boundedEnd,
    nextCursor,
  };
}

export function finalizeTranscriptText({
  transcript,
  postProcessingEnabled,
  enhancedText,
}: FinalizeTranscriptParams): FinalizeTranscriptResult {
  const normalizedTranscript = normalizeTranscriptText(transcript);
  const fallbackText = normalizedTranscript;

  if (!postProcessingEnabled) {
    return {
      transcript: normalizedTranscript,
      finalText: fallbackText,
      fallbackText,
      usedEnhancedText: false,
    };
  }

  const normalizedEnhancedText = normalizeTranscriptText(enhancedText);
  const hasEnhancedText = normalizedEnhancedText.length > 0;

  return {
    transcript: normalizedTranscript,
    finalText: hasEnhancedText ? normalizedEnhancedText : fallbackText,
    fallbackText,
    usedEnhancedText: hasEnhancedText,
  };
}
