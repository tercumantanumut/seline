import type { LivePromptEntry } from "./live-prompt-queue-registry";

const STOP_INTENT_PATTERNS = [
  /^stop\b/i,
  /^cancel\b/i,
  /^halt\b/i,
  /^abort\b/i,
  /^wait\b/i,
  /^pause\b/i,
  /^nevermind\b/i,
  /^never mind\b/i,
];

/** Returns true if the message content signals the user wants to stop the current run. */
export function hasStopIntent(content: string): boolean {
  const trimmed = content.trim();
  return STOP_INTENT_PATTERNS.some(pattern => pattern.test(trimmed));
}

/**
 * Sanitize user-provided content before injecting into the model context.
 * Strips prompt-injection attempts and caps length.
 */
export function sanitizeLivePromptContent(content: string): string {
  return content
    .replace(/\[SYSTEM:/gi, "[USER-INJECTED:")
    .replace(/<\/?system>/gi, "")
    .trim()
    .slice(0, 2000);
}

/**
 * Build the text injected as a user message when the user sends mid-run instructions.
 * Formatted so the model understands these arrived while it was working.
 */
export function buildUserInjectionContent(entries: LivePromptEntry[]): string {
  if (entries.length === 0) return "";

  const lines = entries
    .map(e => `- ${sanitizeLivePromptContent(e.content)}`)
    .join("\n");

  return [
    "[Mid-run instruction(s) from user — received while you were processing a tool step]",
    lines,
    "Please acknowledge and incorporate these into your current work.",
  ].join("\n");
}

/**
 * Build a system-level stop message for when the user requests the run to halt.
 * Returned as the `system` field in prepareStep to signal the model to wrap up.
 */
export function buildStopSystemMessage(entries: LivePromptEntry[]): string {
  const stopMessages = entries
    .filter(e => e.stopIntent)
    .map(e => sanitizeLivePromptContent(e.content))
    .join("; ");

  return [
    "[STOP REQUESTED BY USER]",
    `The user has asked you to stop: "${stopMessages || "stop"}"`,
    "Please wrap up gracefully. Do not start any new tasks or tool calls.",
  ].join("\n");
}
