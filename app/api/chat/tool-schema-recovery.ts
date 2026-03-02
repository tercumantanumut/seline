/**
 * Helpers for recovering from provider-level tool schema validation failures.
 */

export interface InvalidToolSchemaError {
  toolName: string;
  reason: string;
  message: string;
}

interface ToolSchemaRecoveryState {
  allToolsWithMCP: Record<string, unknown>;
  initialActiveToolNames: string[];
  initialActiveTools?: Set<string>;
  discoveredTools?: Set<string>;
  previouslyDiscoveredTools?: Set<string>;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") return maybeMessage;
  }
  return String(error);
}

/**
 * Parse provider errors like:
 * - Invalid schema for function 'readFile': schema must have type 'object' ...
 */
export function parseInvalidToolSchemaError(
  error: unknown
): InvalidToolSchemaError | null {
  const message = getErrorMessage(error);
  if (!message) return null;

  const match = /invalid schema for function\s+["'`]?([^"'`:\s]+)["'`]?\s*:(.+)$/i.exec(
    message
  );
  if (!match) return null;

  const toolName = match[1]?.trim();
  const reason = match[2]?.trim() || "unknown schema validation error";
  if (!toolName) return null;

  return { toolName, reason, message };
}

/**
 * Remove a tool from runtime tool maps/active sets so a stream can be retried
 * without a provider-fatal schema error interrupting the run.
 */
export function disableToolForSchemaRecovery(
  state: ToolSchemaRecoveryState,
  toolName: string
): boolean {
  if (!toolName || !(toolName in state.allToolsWithMCP)) {
    return false;
  }

  delete state.allToolsWithMCP[toolName];

  for (let i = state.initialActiveToolNames.length - 1; i >= 0; i -= 1) {
    if (state.initialActiveToolNames[i] === toolName) {
      state.initialActiveToolNames.splice(i, 1);
    }
  }

  state.initialActiveTools?.delete(toolName);
  state.discoveredTools?.delete(toolName);
  state.previouslyDiscoveredTools?.delete(toolName);
  return true;
}

