/**
 * Embedding Provider
 *
 * Resolves embedding model configuration from settings and environment, and
 * returns the appropriate EmbeddingModel instance (local Transformers.js or
 * OpenRouter).
 */

import type { EmbeddingModel } from "ai";
import { existsSync } from "fs";
import { createLocalEmbeddingModel, DEFAULT_LOCAL_EMBEDDING_MODEL } from "@/lib/ai/local-embeddings";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOpenRouterClient, getOpenRouterApiKey } from "./openrouter-client";

// ---- Constants ---------------------------------------------------------------

export type EmbeddingProvider = "openrouter" | "local";

const DEFAULT_EMBEDDING_PROVIDER: EmbeddingProvider = "openrouter";
const DEFAULT_EMBEDDING_MODEL = "qwen/qwen3-embedding-4b";
const LOCAL_MODEL_PREFIX = "local:";
const OPENROUTER_MODEL_PREFIX = "openrouter:";

// ---- Local embedding availability -------------------------------------------

let _hasLoggedLocalEmbeddings = false;

/**
 * Check if local embeddings can be used.
 * Local embeddings are available when:
 * 1. Running in Electron (ELECTRON_USER_DATA_PATH is set by electron/main.ts)
 * 2. Or ALLOW_LOCAL_EMBEDDINGS=true is set for development
 * 3. Or EMBEDDING_MODEL_DIR is set and exists (user configured a model path)
 */
export function canUseLocalEmbeddings(): boolean {
  const isElectronRuntime = Boolean(
    process.versions.electron || process.env.ELECTRON_USER_DATA_PATH
  );
  const allowLocalOverride =
    process.env.ALLOW_LOCAL_EMBEDDINGS === "true" || process.env.NODE_ENV === "development";
  const modelDir = process.env.EMBEDDING_MODEL_DIR;

  // If model directory is set and exists, allow local embeddings
  if (modelDir && existsSync(modelDir)) {
    if (!_hasLoggedLocalEmbeddings) {
      console.log(`[PROVIDERS] Local embeddings enabled via EMBEDDING_MODEL_DIR: ${modelDir}`);
      _hasLoggedLocalEmbeddings = true;
    }
    return true;
  }

  // Otherwise require Electron runtime, development mode, or explicit override
  if (!isElectronRuntime && !allowLocalOverride) {
    if (!_hasLoggedLocalEmbeddings) {
      console.log(
        `[PROVIDERS] Local embeddings not available (not in Electron, no ALLOW_LOCAL_EMBEDDINGS, no development mode)`
      );
      _hasLoggedLocalEmbeddings = true;
    }
    return false;
  }

  return true;
}

// ---- Config resolution -------------------------------------------------------

export function normalizeEmbeddingProvider(provider?: string): EmbeddingProvider {
  if (provider === "local") return "local";
  return DEFAULT_EMBEDDING_PROVIDER;
}

export function resolveEmbeddingModelConfig(
  settings: { embeddingProvider?: string; embeddingModel?: string },
  modelOverride?: string
): {
  provider: EmbeddingProvider;
  modelId: string;
  storageId: string;
  openRouterModelId: string;
} {
  let provider = normalizeEmbeddingProvider(
    settings.embeddingProvider || process.env.EMBEDDING_PROVIDER
  );
  let modelId = (
    modelOverride ??
    settings.embeddingModel ??
    process.env.EMBEDDING_MODEL ??
    ""
  ).trim();

  if (modelId.startsWith(LOCAL_MODEL_PREFIX)) {
    provider = "local";
    modelId = modelId.slice(LOCAL_MODEL_PREFIX.length);
  } else if (modelId.startsWith(OPENROUTER_MODEL_PREFIX)) {
    provider = "openrouter";
    modelId = modelId.slice(OPENROUTER_MODEL_PREFIX.length);
  }

  if (!modelId) {
    modelId = provider === "local" ? DEFAULT_LOCAL_EMBEDDING_MODEL : DEFAULT_EMBEDDING_MODEL;
  }

  const openRouterModelId = provider === "openrouter" ? modelId : DEFAULT_EMBEDDING_MODEL;
  const storageId =
    provider === "local" ? `${LOCAL_MODEL_PREFIX}${modelId}` : modelId;

  if (provider === "local" && !canUseLocalEmbeddings()) {
    console.warn("[PROVIDERS] Local embeddings not available, falling back to OpenRouter");
    return {
      provider: "openrouter",
      modelId: openRouterModelId,
      storageId: openRouterModelId,
      openRouterModelId,
    };
  }

  return { provider, modelId, storageId, openRouterModelId };
}

// ---- Model ID helper ---------------------------------------------------------

/**
 * Get the embedding model identifier to use for document indexing.
 * Reads directly from settings file to ensure the latest configuration is used.
 * Defaults to OpenRouter unless local embeddings are configured.
 */
export function getEmbeddingModelId(): string {
  const settings = loadSettings();
  const resolved = resolveEmbeddingModelConfig(settings);
  return resolved.storageId;
}

// ---- Model instance ----------------------------------------------------------

// Cache for local embedding model instance
let _localEmbeddingModel: EmbeddingModel | null = null;
let _localEmbeddingModelId: string | null = null;
let _localEmbeddingModelDir: string | undefined = undefined;

function getOpenRouterEmbeddingModel(model: string): EmbeddingModel {
  const apiKey = getOpenRouterApiKey();
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY environment variable is not configured. Embeddings currently require OpenRouter."
    );
  }

  console.log(`[PROVIDERS] Using OpenRouter embedding model: ${model}`);
  return getOpenRouterClient().embeddingModel(model);
}

/**
 * Get an embedding model instance.
 *
 * Embeddings can be served via OpenRouter or a local Transformers.js model,
 * depending on settings and environment availability.
 */
export function getEmbeddingModel(modelOverride?: string): EmbeddingModel {
  const settings = loadSettings();
  const resolved = resolveEmbeddingModelConfig(settings, modelOverride);

  if (resolved.provider === "local") {
    try {
      const modelDir = process.env.EMBEDDING_MODEL_DIR;

      // Return cached instance if configuration matches
      if (
        _localEmbeddingModel &&
        _localEmbeddingModelId === resolved.modelId &&
        _localEmbeddingModelDir === modelDir
      ) {
        return _localEmbeddingModel;
      }

      console.log(`[PROVIDERS] Using local embedding model: ${resolved.modelId}`);
      const model = createLocalEmbeddingModel({ modelId: resolved.modelId });

      _localEmbeddingModel = model;
      _localEmbeddingModelId = resolved.modelId;
      _localEmbeddingModelDir = modelDir;

      return model;
    } catch (error) {
      console.warn(
        "[PROVIDERS] Local embedding model failed, falling back to OpenRouter:",
        error
      );
    }
  }

  return getOpenRouterEmbeddingModel(resolved.openRouterModelId);
}
