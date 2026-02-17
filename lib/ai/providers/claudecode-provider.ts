import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import {
  CLAUDECODE_CONFIG,
  ensureValidClaudeCodeToken,
  getClaudeCodeAccessToken,
} from "@/lib/auth/claudecode-auth";
import {
  classifyRecoverability,
  getBackoffDelayMs,
  shouldRetry,
  sleepWithAbort,
} from "@/lib/ai/retry/stream-recovery";

const CLAUDECODE_MAX_RETRY_ATTEMPTS = 5;

async function readErrorPreview(response: Response): Promise<string> {
  try {
    return await response.clone().text();
  } catch {
    return "";
  }
}

function createClaudeCodeFetch(): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

    // Only intercept Anthropic API calls
    if (!url.includes("api.anthropic.com")) {
      return fetch(input, init);
    }

    const tokenValid = await ensureValidClaudeCodeToken();
    if (!tokenValid) {
      throw new Error("Claude Code authentication required");
    }

    const accessToken = getClaudeCodeAccessToken();
    if (!accessToken) {
      throw new Error("Claude Code access token missing");
    }

    const headers = new Headers(init?.headers ?? {});
    // Replace API key auth with OAuth Bearer token
    headers.delete("x-api-key");
    headers.set("Authorization", `Bearer ${accessToken}`);
    headers.set("anthropic-version", CLAUDECODE_CONFIG.ANTHROPIC_VERSION);
    headers.set("anthropic-beta", CLAUDECODE_CONFIG.BETA_HEADERS.join(","));
    headers.set("User-Agent", "seline-agent/1.0.0");

    // Inject required system prompt prefix into request body
    let updatedInit = init;
    if (init?.body && typeof init.body === "string") {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>;

        // Prepend required system prompt for Claude Code OAuth
        const existingSystem = body.system;
        if (typeof existingSystem === "string") {
          body.system = `${CLAUDECODE_CONFIG.REQUIRED_SYSTEM_PREFIX}\n\n${existingSystem}`;
        } else if (Array.isArray(existingSystem)) {
          body.system = [
            { type: "text", text: CLAUDECODE_CONFIG.REQUIRED_SYSTEM_PREFIX },
            ...existingSystem,
          ];
        } else {
          body.system = CLAUDECODE_CONFIG.REQUIRED_SYSTEM_PREFIX;
        }

        // Log the actual messages being sent to Anthropic API for debugging tool_use/tool_result issues
        const apiMessages = body.messages as Array<{ role: string; content: unknown }>;
        if (Array.isArray(apiMessages)) {
          console.log(`[ClaudeCode] Sending ${apiMessages.length} messages to Anthropic API:`);
          for (let i = 0; i < apiMessages.length; i++) {
            const msg = apiMessages[i];
            const content = msg.content;
            if (typeof content === 'string') {
              console.log(`  [${i}] role=${msg.role}, content=string(${content.length})`);
            } else if (Array.isArray(content)) {
              const types = (content as Array<{ type: string; id?: string; tool_use_id?: string }>).map(
                p => p.type + (p.id ? `:${p.id}` : '') + (p.tool_use_id ? `:${p.tool_use_id}` : '')
              );
              console.log(`  [${i}] role=${msg.role}, parts=[${types.join(', ')}]`);
            }
          }
        }

        updatedInit = { ...init, body: JSON.stringify(body) };
      } catch {
        // Not JSON, pass through unchanged
      }
    }

    for (let attempt = 0; ; attempt += 1) {
      let response: Response;
      try {
        response = await fetch(input, {
          ...updatedInit,
          headers,
        });
      } catch (error) {
        const classification = classifyRecoverability({
          provider: "claudecode",
          error,
          message: error instanceof Error ? error.message : String(error),
        });
        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS,
          aborted: init?.signal?.aborted ?? false,
        });
        if (!retry) {
          throw error;
        }
        const delay = getBackoffDelayMs(attempt);
        console.log("[ClaudeCode] Retrying after transport failure", {
          attempt: attempt + 1,
          reason: classification.reason,
          delayMs: delay,
          outcome: "scheduled",
        });
        await sleepWithAbort(delay, init?.signal ?? undefined);
        continue;
      }

      if (!response.ok) {
        const errorText = await readErrorPreview(response);
        console.error(`[ClaudeCode] API error ${response.status}:`, errorText.substring(0, 500));
        const classification = classifyRecoverability({
          provider: "claudecode",
          statusCode: response.status,
          message: errorText,
        });
        const retry = shouldRetry({
          classification,
          attempt,
          maxAttempts: CLAUDECODE_MAX_RETRY_ATTEMPTS,
          aborted: init?.signal?.aborted ?? false,
        });
        if (retry) {
          const delay = getBackoffDelayMs(attempt);
          console.log("[ClaudeCode] Retrying after recoverable HTTP response", {
            attempt: attempt + 1,
            reason: classification.reason,
            delayMs: delay,
            statusCode: response.status,
            outcome: "scheduled",
          });
          await sleepWithAbort(delay, init?.signal ?? undefined);
          continue;
        }
      }

      return response;
    }
  };
}

export function createClaudeCodeProvider(): (modelId: string) => LanguageModel {
  const provider = createAnthropic({
    apiKey: "claudecode-oauth",
    fetch: createClaudeCodeFetch(),
  });

  return (modelId: string): LanguageModel => {
    return provider(modelId) as unknown as LanguageModel;
  };
}
