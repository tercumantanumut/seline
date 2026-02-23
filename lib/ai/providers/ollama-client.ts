/**
 * Ollama Client
 *
 * Lazy-initialized OpenAI-compatible client for a local Ollama server.
 * The base URL is resolved from settings or the OLLAMA_BASE_URL environment
 * variable and defaults to http://localhost:11434/v1.
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { loadSettings } from "@/lib/settings/settings-manager";

// ---- Configuration -----------------------------------------------------------

const OLLAMA_DEFAULT_BASE_URL = "http://localhost:11434/v1";

export function getOllamaBaseUrl(): string {
  const settings = loadSettings();
  return settings.ollamaBaseUrl || process.env.OLLAMA_BASE_URL || OLLAMA_DEFAULT_BASE_URL;
}

// ---- Lazy singleton ----------------------------------------------------------

let _ollamaClient: ReturnType<typeof createOpenAICompatible> | null = null;
let _ollamaClientBaseUrl: string | undefined = undefined;

export function getOllamaClient(): ReturnType<typeof createOpenAICompatible> {
  const baseURL = getOllamaBaseUrl();

  if (!baseURL) {
    throw new Error(
      "Ollama base URL is not configured. Set ollamaBaseUrl or OLLAMA_BASE_URL."
    );
  }

  if (_ollamaClient && _ollamaClientBaseUrl !== baseURL) {
    _ollamaClient = null;
  }

  if (!_ollamaClient) {
    _ollamaClientBaseUrl = baseURL;
    _ollamaClient = createOpenAICompatible({
      name: "ollama",
      baseURL,
      apiKey: "",
    });
  }

  return _ollamaClient;
}

export function invalidateOllamaClient(): void {
  _ollamaClient = null;
  _ollamaClientBaseUrl = undefined;
}
