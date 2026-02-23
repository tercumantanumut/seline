/**
 * OpenRouter Client
 *
 * Lazy-initialized OpenAI-compatible client for the OpenRouter API.
 * Reads the API key from the environment at call time so that changes to
 * process.env propagate without restarting the server.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { loadSettings } from "@/lib/settings/settings-manager";

// ---- Configuration -----------------------------------------------------------

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export function getOpenRouterApiKey(): string | undefined {
  return process.env.OPENROUTER_API_KEY;
}

/**
 * Get the correct app URL for HTTP-Referer headers.
 * Handles both development and production Electron environments.
 */
export function getAppUrl(): string {
  const isElectronProduction =
    (process.env.SELINE_PRODUCTION_BUILD === "1" ||
      !!(process as any).resourcesPath ||
      !!process.env.ELECTRON_RESOURCES_PATH) &&
    process.env.ELECTRON_IS_DEV !== "1" &&
    process.env.NODE_ENV !== "development";

  return isElectronProduction ? "http://localhost:3456" : "http://localhost:3000";
}

// ---- Lazy singleton ----------------------------------------------------------

let _openrouterClient: ReturnType<typeof createOpenAICompatible> | null = null;
let _openrouterClientApiKey: string | undefined = undefined;

export function getOpenRouterClient(): ReturnType<typeof createOpenAICompatible> {
  const apiKey = getOpenRouterApiKey();
  const settings = loadSettings();

  // Recreate client if API key changed (e.g. settings were updated)
  if (_openrouterClient && _openrouterClientApiKey !== apiKey) {
    _openrouterClient = null;
  }

  if (!_openrouterClient) {
    _openrouterClientApiKey = apiKey;

    // Parse OpenRouter args from settings (with validation)
    let providerOptions = {};
    if (settings.openrouterArgs) {
      try {
        const args = JSON.parse(settings.openrouterArgs);
        providerOptions = { ...args };
        console.log("[PROVIDERS] OpenRouter args applied:", providerOptions);
      } catch (error) {
        console.warn("[PROVIDERS] Invalid OpenRouter args JSON, ignoring:", error);
      }
    }

    _openrouterClient = createOpenAICompatible({
      name: "openrouter",
      baseURL: OPENROUTER_BASE_URL,
      apiKey: apiKey || "",
      headers: {
        "HTTP-Referer": getAppUrl(),
        "X-Title": "STYLY Agent",
      },
      ...providerOptions,
    });
  }

  return _openrouterClient;
}

export function invalidateOpenRouterClient(): void {
  _openrouterClient = null;
  _openrouterClientApiKey = undefined;
}
