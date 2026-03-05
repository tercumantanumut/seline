/**
 * MiniMax Client
 *
 * Lazy-initialized OpenAI-compatible client for the MiniMax API.
 * MiniMax provides an OpenAI-compatible endpoint at https://api.minimax.chat/v1.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { MINIMAX_CONFIG } from "@/lib/auth/minimax-models";
import { getAppUrl } from "./openrouter-client";

// ---- Configuration -----------------------------------------------------------

export function getMiniMaxApiKey(): string | undefined {
  return process.env.MINIMAX_API_KEY;
}

// ---- Lazy singleton ----------------------------------------------------------

let _minimaxClient: ReturnType<typeof createOpenAICompatible> | null = null;
let _minimaxClientApiKey: string | undefined = undefined;

export function getMiniMaxClient(): ReturnType<typeof createOpenAICompatible> {
  const apiKey = getMiniMaxApiKey();

  // Recreate client if API key changed
  if (_minimaxClient && _minimaxClientApiKey !== apiKey) {
    _minimaxClient = null;
  }

  if (!_minimaxClient) {
    _minimaxClientApiKey = apiKey;
    _minimaxClient = createOpenAICompatible({
      name: "minimax",
      baseURL: MINIMAX_CONFIG.BASE_URL,
      apiKey: apiKey || "",
      headers: {
        "HTTP-Referer": getAppUrl(),
        "X-Title": "Seline Agent",
      },
    });
  }

  return _minimaxClient;
}

export function invalidateMiniMaxClient(): void {
  _minimaxClient = null;
  _minimaxClientApiKey = undefined;
}
