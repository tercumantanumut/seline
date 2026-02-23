import fs from "fs/promises";
import path from "path";

// ============================================================================
// System Prompt Injection
// ============================================================================
// CRITICAL: System prompt is sent with EVERY request to prevent the model
// from "forgetting" critical instructions like "don't output [SYSTEM: markers".
// Previously we tried to optimize by only sending every 7 messages, but this
// caused the model to start echoing internal markers after the 7th message.
//
// NOTE: Tools CANNOT be optimized the same way. Unlike the system prompt (which
// the AI "remembers" from conversation history), tools are function definitions
// that must be present for the AI to actually invoke them. Without the tools
// parameter, the AI will just output fake tool call syntax as plain text.

export interface ContextInjectionTrackingMetadata {
  tokensSinceLastInjection: number;
  messagesSinceLastInjection: number;
  lastInjectedAt?: string;
  toolLoadingMode?: "deferred" | "always";
}

/**
 * Discovered tools tracking metadata.
 * Persists tools discovered via searchTools across requests so the model
 * can continue using them in subsequent turns.
 */
export interface DiscoveredToolsMetadata {
  /** Tool names discovered via searchTools */
  toolNames: string[];
  /** When the tools were last discovered */
  lastUpdatedAt?: string;
}

/**
 * ALWAYS inject context (system prompt + tools) on every request.
 * This prevents the model from "forgetting" critical negative constraints
 * like "never output [SYSTEM: markers" after N messages.
 *
 * Previously we tried to optimize by only injecting every 7 messages, but
 * this caused the model to start echoing internal markers and fake tool
 * call JSON after the threshold was exceeded.
 */
export function shouldInjectContext(
  _trackingMetadata: ContextInjectionTrackingMetadata | null,
  _isFirstMessage: boolean,
  _toolLoadingMode: "deferred" | "always"
): boolean {
  // ALWAYS return true - send system prompt with every request
  // This is critical to prevent the model from echoing [SYSTEM: markers
  return true;
}

/**
 * Extract context injection tracking metadata from session metadata
 */
export function getContextInjectionTracking(
  sessionMetadata: Record<string, unknown> | null
): ContextInjectionTrackingMetadata | null {
  if (!sessionMetadata) return null;

  const tracking = sessionMetadata.contextInjectionTracking as ContextInjectionTrackingMetadata | undefined;
  if (!tracking) return null;

  return {
    tokensSinceLastInjection: tracking.tokensSinceLastInjection ?? 0,
    messagesSinceLastInjection: tracking.messagesSinceLastInjection ?? 0,
    lastInjectedAt: tracking.lastInjectedAt,
    toolLoadingMode: tracking.toolLoadingMode ?? undefined,
  };
}

/**
 * Extract discovered tools from conversation history.
 * Ground truth for tool discovery - parses searchTools results from history.
 * This ensures tools discovered in previous turns remain active.
 */
export function getDiscoveredToolsFromMessages(messages: any[]): Set<string> {
  const discovered = new Set<string>();
  for (const msg of messages) {
    if (msg.parts) {
      for (const part of msg.parts) {
        // dynamic-tool is for historical results loaded from DB
        // tool-searchTools is for streaming results (handled by AI SDK)
        const toolName = part.type === "dynamic-tool"
          ? part.toolName
          : (part.type.startsWith("tool-") ? part.type.replace("tool-", "") : null);

        if (toolName === "searchTools") {
          const output = part.output || part.result;
          if (output && Array.isArray(output.results)) {
            for (const res of output.results) {
              if (res.isAvailable && res.name) {
                discovered.add(res.name);
              }
            }
          }
        }
      }
    }
  }
  return discovered;
}

export function getDiscoveredToolsFromMetadata(
  sessionMetadata: Record<string, unknown> | null
): Set<string> {
  if (!sessionMetadata) return new Set();

  const discovered = sessionMetadata.discoveredTools as DiscoveredToolsMetadata | undefined;
  if (!discovered?.toolNames) return new Set();

  return new Set(discovered.toolNames);
}

export function isValidIanaTimezone(value: string | null | undefined): value is string {
  if (!value || typeof value !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export async function resolvePluginRootMap(
  plugins: Array<{ name: string; cachePath?: string }>
): Promise<Map<string, string>> {
  const roots = new Map<string, string>();

  for (const plugin of plugins) {
    const candidates = [
      plugin.cachePath,
      path.join(process.cwd(), "test_plugins", plugin.name),
    ].filter((value): value is string => typeof value === "string" && value.trim().length > 0);

    for (const candidate of candidates) {
      try {
        await fs.access(candidate);
        roots.set(plugin.name, candidate);
        break;
      } catch {
        // Try next candidate.
      }
    }
  }

  return roots;
}
