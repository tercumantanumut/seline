/**
 * Think-Tag Stream Filter
 *
 * Strips `<think>...</think>` and `<thinking>...</thinking>` reasoning blocks
 * from streaming LLM text output. Many non-Anthropic providers (MiniMax,
 * DeepSeek via OpenRouter, Ollama models like deepseek-r1/qwq) emit raw
 * think tags in their text stream. Anthropic handles reasoning natively
 * through its API, so this filter is a no-op for the Anthropic provider.
 *
 * Designed as a pure, stateful state-machine that processes text chunks
 * incrementally — safe for streaming where a single `<think>` tag may be
 * split across multiple chunks.
 */

import type { LLMProvider } from "@/lib/ai/providers";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Possible states of the tag-stripping state machine. */
export type ThinkTagFilterState =
  | "NORMAL"
  | "POTENTIAL_TAG_OPEN"
  | "INSIDE_THINK"
  | "POTENTIAL_TAG_CLOSE";

/** Configuration for the think-tag filter. */
export interface ThinkTagFilterConfig {
  /** Tag names to strip (without angle brackets). Defaults to `["think", "thinking"]`. */
  tagNames?: string[];
  /** When true, captured thinking content is stored in `capturedThinking`. */
  captureThinking?: boolean;
}

/** Internal mutable state for a single filter instance. */
export interface ThinkTagFilterInstance {
  state: ThinkTagFilterState;
  /** Accumulated characters that *might* be a partial opening or closing tag. */
  buffer: string;
  /** The tag name matched during POTENTIAL_TAG_OPEN (e.g. "think" or "thinking"). */
  matchedOpenTag: string;
  /** Captured thinking content (only populated when `captureThinking` is true). */
  capturedThinking: string;
  /** Resolved config with defaults applied. */
  config: Required<ThinkTagFilterConfig>;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_TAG_NAMES = ["think", "thinking"];

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Create a new think-tag filter instance.
 *
 * Returns an object with a `process(chunk)` method that accepts a text chunk
 * and returns the filtered output string. Call `flush()` at the end of the
 * stream to emit any buffered trailing content.
 *
 * Usage:
 * ```ts
 * const filter = createThinkTagFilter();
 * for await (const chunk of textStream) {
 *   const filtered = filter.process(chunk);
 *   if (filtered) emit(filtered);
 * }
 * const remaining = filter.flush();
 * if (remaining) emit(remaining);
 * ```
 */
export function createThinkTagFilter(config?: ThinkTagFilterConfig) {
  const resolvedConfig: Required<ThinkTagFilterConfig> = {
    tagNames: config?.tagNames ?? DEFAULT_TAG_NAMES,
    captureThinking: config?.captureThinking ?? false,
  };

  // Pre-compute tag arrays once per filter instance instead of per-character.
  const openingTags = resolvedConfig.tagNames.map((name) => `<${name}>`);

  const instance: ThinkTagFilterInstance = {
    state: "NORMAL",
    buffer: "",
    matchedOpenTag: "",
    capturedThinking: "",
    config: resolvedConfig,
  };

  return {
    /** Process a text chunk and return the filtered output. */
    process(chunk: string): string {
      return processChunk(instance, chunk, openingTags);
    },

    /** Flush any remaining buffered content at the end of the stream. */
    flush(): string {
      return flushBuffer(instance);
    },

    /** Access captured thinking content (only populated when captureThinking is true). */
    get capturedThinking(): string {
      return instance.capturedThinking;
    },

    /** Access current internal state (useful for debugging/testing). */
    get state(): ThinkTagFilterState {
      return instance.state;
    },
  };
}

// ---------------------------------------------------------------------------
// Core processing
// ---------------------------------------------------------------------------

/**
 * Build the closing tag for the currently matched open tag.
 */
function getClosingTag(matchedOpenTag: string): string {
  return `</${matchedOpenTag}>`;
}

/**
 * Check if `candidate` is a valid prefix of any of the provided `targets`.
 */
function isPrefixOfAny(candidate: string, targets: string[]): boolean {
  return targets.some(
    (target) => target.startsWith(candidate) && candidate.length <= target.length
  );
}

/**
 * Check if `candidate` exactly matches any of the provided `targets`.
 */
function matchesAny(candidate: string, targets: string[]): string | null {
  for (const target of targets) {
    if (candidate === target) {
      // Extract the tag name from `<tagname>`
      return target.slice(1, -1);
    }
  }
  return null;
}

/**
 * Process a single text chunk through the state machine.
 *
 * Returns the filtered text that should be emitted to the consumer.
 */
function processChunk(inst: ThinkTagFilterInstance, chunk: string, openingTags: string[]): string {
  let output = "";

  for (let i = 0; i < chunk.length; i++) {
    const char = chunk[i];

    switch (inst.state) {
      case "NORMAL": {
        if (char === "<") {
          // Could be the start of an opening think tag.
          inst.buffer = "<";
          inst.state = "POTENTIAL_TAG_OPEN";
        } else {
          output += char;
        }
        break;
      }

      case "POTENTIAL_TAG_OPEN": {
        inst.buffer += char;

        if (isPrefixOfAny(inst.buffer, openingTags)) {
          // Still building a potential opening tag.
          const matched = matchesAny(inst.buffer, openingTags);
          if (matched) {
            // Full opening tag matched — transition to INSIDE_THINK.
            inst.matchedOpenTag = matched;
            inst.buffer = "";
            inst.state = "INSIDE_THINK";
          }
          // else: keep accumulating in POTENTIAL_TAG_OPEN
        } else {
          // Not a valid tag prefix. If the char that broke the match is `<`,
          // re-examine it as the start of a new potential tag instead of
          // blindly emitting it back to NORMAL.
          if (char === "<") {
            // Emit everything before the trailing `<`, then restart matching.
            output += inst.buffer.slice(0, -1);
            inst.buffer = "<";
            // Stay in POTENTIAL_TAG_OPEN with the new buffer.
          } else {
            output += inst.buffer;
            inst.buffer = "";
            inst.state = "NORMAL";
          }
        }
        break;
      }

      case "INSIDE_THINK": {
        if (char === "<") {
          // Could be the start of a closing tag.
          inst.buffer = "<";
          inst.state = "POTENTIAL_TAG_CLOSE";
        } else {
          // Inside think block — discard (or capture).
          if (inst.config.captureThinking) {
            inst.capturedThinking += char;
          }
        }
        break;
      }

      case "POTENTIAL_TAG_CLOSE": {
        inst.buffer += char;
        const closingTag = getClosingTag(inst.matchedOpenTag);

        if (closingTag.startsWith(inst.buffer)) {
          if (inst.buffer === closingTag) {
            // Full closing tag matched — back to NORMAL.
            inst.buffer = "";
            inst.matchedOpenTag = "";
            inst.state = "NORMAL";
          }
          // else: keep accumulating in POTENTIAL_TAG_CLOSE
        } else {
          // Not a valid closing tag. If the char that broke the match is `<`,
          // re-examine it as the start of a new potential closing tag.
          if (char === "<") {
            if (inst.config.captureThinking) {
              inst.capturedThinking += inst.buffer.slice(0, -1);
            }
            inst.buffer = "<";
            // Stay in POTENTIAL_TAG_CLOSE with the new buffer.
          } else {
            if (inst.config.captureThinking) {
              inst.capturedThinking += inst.buffer;
            }
            inst.buffer = "";
            inst.state = "INSIDE_THINK";
          }
        }
        break;
      }
    }
  }

  return output;
}

/**
 * Flush any remaining buffered content at the end of the stream.
 *
 * In NORMAL or POTENTIAL_TAG_OPEN state, whatever is buffered is normal text
 * that was being cautiously held back. In INSIDE_THINK or POTENTIAL_TAG_CLOSE,
 * the stream ended with an unclosed think tag — we discard it gracefully.
 */
function flushBuffer(inst: ThinkTagFilterInstance): string {
  const { state, buffer } = inst;

  // Reset instance state.
  inst.buffer = "";
  inst.state = "NORMAL";
  inst.matchedOpenTag = "";

  switch (state) {
    case "NORMAL":
      // Nothing buffered in NORMAL state.
      return "";

    case "POTENTIAL_TAG_OPEN":
      // The buffer holds something like `<thi` that never completed —
      // it's actually normal text.
      return buffer;

    case "INSIDE_THINK":
      // Unclosed think tag — discard remaining content.
      return "";

    case "POTENTIAL_TAG_CLOSE":
      // Inside a think block and we were building a potential close tag
      // that never completed — discard it.
      return "";
  }
}

// ---------------------------------------------------------------------------
// Provider helper
// ---------------------------------------------------------------------------

/**
 * Models known to emit raw `<think>` / `<thinking>` tags in their output.
 * Case-insensitive substring matching against the model ID.
 */
const THINK_TAG_MODEL_PATTERNS = [
  "deepseek",
  "minimax",
  "qwq",
  "qwen",
  "r1",
];

/**
 * Determine whether think-tag filtering should be enabled for a given
 * provider and model combination.
 *
 * Returns true for providers that route through OpenAI-compatible APIs
 * (OpenRouter, Ollama) when the model is known to emit think tags, and
 * always false for Anthropic (which handles reasoning natively).
 */
export function shouldFilterThinkTags(
  providerId: LLMProvider,
  modelId?: string,
): boolean {
  // Anthropic and Claude Code handle reasoning natively — never filter.
  if (providerId === "anthropic" || providerId === "claudecode") {
    return false;
  }

  // Codex (OpenAI) doesn't emit think tags.
  if (providerId === "codex") {
    return false;
  }

  // For providers that might route to thinking models:
  // OpenRouter, Ollama, Antigravity, Kimi
  if (providerId === "ollama") {
    // Ollama frequently runs local thinking models — always filter.
    return true;
  }

  if (!modelId) {
    // Without a model ID, be conservative — filter for OpenRouter-like providers.
    return providerId === "openrouter";
  }

  const lowerModel = modelId.toLowerCase();
  return THINK_TAG_MODEL_PATTERNS.some((pattern) => lowerModel.includes(pattern));
}
