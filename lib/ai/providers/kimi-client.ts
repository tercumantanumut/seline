/**
 * Kimi (Moonshot) Client
 *
 * Lazy-initialized OpenAI-compatible client for the Moonshot Kimi API.
 * Includes a custom fetch wrapper that disables thinking mode and sets the
 * required fixed parameter values for non-thinking mode per Kimi K2.5 docs.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { KIMI_CONFIG } from "@/lib/auth/kimi-models";
import { getAppUrl } from "./openrouter-client";

// ---- Configuration -----------------------------------------------------------

export function getKimiApiKey(): string | undefined {
  return process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
}

// ---- Custom fetch ------------------------------------------------------------

/**
 * Custom fetch wrapper for Kimi API.
 * Disables thinking mode and enforces required parameter values
 * per Kimi K2.5 docs (non-thinking mode requires specific fixed values).
 */
async function kimiCustomFetch(
  url: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  if (init?.body && typeof init.body === "string") {
    try {
      const body = JSON.parse(init.body);
      // Disable thinking mode — reasoning outputs should not persist in history
      body.thinking = { type: "disabled" };
      // Non-thinking mode requires these fixed values per Kimi K2.5 docs
      body.temperature = 0.6;
      body.top_p = 0.95;
      body.n = 1;
      body.presence_penalty = 0.0;
      body.frequency_penalty = 0.0;
      init = { ...init, body: JSON.stringify(body) };
    } catch {
      // Not JSON, pass through unchanged
    }
  }
  return globalThis.fetch(url, init);
}

// ---- Lazy singleton ----------------------------------------------------------

let _kimiClient: ReturnType<typeof createOpenAICompatible> | null = null;
let _kimiClientApiKey: string | undefined = undefined;

export function getKimiClient(): ReturnType<typeof createOpenAICompatible> {
  const apiKey = getKimiApiKey();

  // Recreate client if API key changed
  if (_kimiClient && _kimiClientApiKey !== apiKey) {
    _kimiClient = null;
  }

  if (!_kimiClient) {
    _kimiClientApiKey = apiKey;
    _kimiClient = createOpenAICompatible({
      name: "kimi",
      baseURL: KIMI_CONFIG.BASE_URL,
      apiKey: apiKey || "",
      headers: {
        "HTTP-Referer": getAppUrl(),
        "X-Title": "Seline Agent",
      },
      fetch: kimiCustomFetch,
    });
  }

  return _kimiClient;
}

export function invalidateKimiClient(): void {
  _kimiClient = null;
  _kimiClientApiKey = undefined;
}
