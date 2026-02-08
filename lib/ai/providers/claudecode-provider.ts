import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import {
  CLAUDECODE_CONFIG,
  ensureValidClaudeCodeToken,
  getClaudeCodeAccessToken,
} from "@/lib/auth/claudecode-auth";

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

        updatedInit = { ...init, body: JSON.stringify(body) };
      } catch {
        // Not JSON, pass through unchanged
      }
    }

    return fetch(input, {
      ...updatedInit,
      headers,
    });
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
