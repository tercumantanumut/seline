/**
 * Embedding Model & Reranker Model Registry
 *
 * Central source of truth for model metadata: dimensions, type, compatibility.
 *
 * KEY ARCHITECTURAL NOTE:
 * ─────────────────────
 * Embedding models and reranker models are fundamentally different:
 *
 * • Embedding models produce VECTORS (e.g., 1536-dim float arrays) stored in LanceDB.
 *   Changing the embedding model changes vector dimensions → requires full reindex.
 *
 * • Reranker models (cross-encoders) take (query, text) pairs and output a single
 *   RELEVANCE SCORE. They do NOT produce vectors and do NOT interact with LanceDB
 *   dimensions. Any cross-encoder works with any embedding model.
 *
 * The real compatibility constraints are:
 * 1. All vectors in a LanceDB table must have the SAME dimension (set by the embedding model).
 * 2. Reranker models must be CROSS-ENCODERS, not embedding models (different output format).
 * 3. Switching embedding models requires a full reindex of the vector database.
 */

// ─── Embedding Models ───────────────────────────────────────────────────────

export interface EmbeddingModelInfo {
  /** Model identifier (used in settings and API calls) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Output vector dimensionality */
  dimensions: number;
  /** Provider: "openrouter" for API-based, "local" for Transformers.js */
  provider: "openrouter" | "local";
  /** Approximate model download size (local models only) */
  size?: string;
  /** Short description for UI */
  description?: string;
  /** Whether this is a recommended default */
  recommended?: boolean;
}

/**
 * Known OpenRouter embedding models with their dimensions.
 *
 * When users type a custom model ID for OpenRouter, we can't know the
 * dimensions ahead of time — the system detects them at indexing time
 * from the first embedding batch (see lib/vectordb/indexing.ts:196).
 */
export const OPENROUTER_EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  {
    id: "openai/text-embedding-3-small",
    name: "OpenAI Embedding 3 Small",
    dimensions: 1536,
    provider: "openrouter",
    description: "Fast, cost-effective",
    recommended: true,
  },
  {
    id: "openai/text-embedding-3-large",
    name: "OpenAI Embedding 3 Large",
    dimensions: 3072,
    provider: "openrouter",
    description: "Highest quality",
  },
  {
    id: "voyage-ai/voyage-3-lite",
    name: "Voyage 3 Lite",
    dimensions: 512,
    provider: "openrouter",
    description: "Fast retrieval",
  },
  {
    id: "qwen/qwen3-embedding-4b",
    name: "Qwen3 Embedding 4B",
    dimensions: 2560,
    provider: "openrouter",
    description: "Default, multilingual",
  },
];

/**
 * Local embedding models (Transformers.js / ONNX).
 * These run entirely on the user's machine.
 */
export const LOCAL_EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  {
    id: "Xenova/bge-large-en-v1.5",
    name: "BGE Large",
    dimensions: 1024,
    provider: "local",
    size: "1.3GB",
    description: "High quality, English",
    recommended: true,
  },
  {
    id: "Xenova/bge-base-en-v1.5",
    name: "BGE Base",
    dimensions: 768,
    provider: "local",
    size: "440MB",
    description: "Good balance",
  },
  {
    id: "Xenova/bge-small-en-v1.5",
    name: "BGE Small",
    dimensions: 384,
    provider: "local",
    size: "130MB",
    description: "Lightweight",
  },
  {
    id: "Xenova/all-MiniLM-L6-v2",
    name: "MiniLM L6",
    dimensions: 384,
    provider: "local",
    size: "90MB",
    description: "Smallest, fastest",
  },
];

/** All known embedding models across all providers */
export const ALL_EMBEDDING_MODELS: EmbeddingModelInfo[] = [
  ...OPENROUTER_EMBEDDING_MODELS,
  ...LOCAL_EMBEDDING_MODELS,
];

/**
 * Look up a known embedding model by ID.
 * Returns undefined for custom/unknown model IDs.
 */
export function getEmbeddingModelInfo(modelId: string): EmbeddingModelInfo | undefined {
  return ALL_EMBEDDING_MODELS.find((m) => m.id === modelId);
}

/**
 * Get the vector dimensions for a known embedding model.
 * Returns undefined if the model is not in our registry (custom model).
 */
export function getEmbeddingDimensions(modelId: string): number | undefined {
  return getEmbeddingModelInfo(modelId)?.dimensions;
}

/**
 * Format a dimension display string for the UI.
 * e.g., "1536-dim" or "unknown dimensions" for custom models.
 */
export function formatDimensionLabel(modelId: string): string {
  const dims = getEmbeddingDimensions(modelId);
  return dims ? `${dims}-dim` : "unknown dimensions";
}

// ─── Reranker Models ────────────────────────────────────────────────────────

export interface RerankerModelInfo {
  /** Model identifier (Hugging Face hub ID) */
  id: string;
  /** Human-readable display name */
  name: string;
  /** Model type — must be "cross-encoder" to be valid as a reranker */
  type: "cross-encoder";
  /** Short description */
  description?: string;
}

/**
 * Known reranker models (cross-encoders).
 *
 * Cross-encoders take (query, document) pairs and output relevance scores.
 * They are fundamentally different from embedding models and do NOT need
 * dimension compatibility with the embedding model.
 */
export const RERANKER_MODELS: RerankerModelInfo[] = [
  {
    id: "cross-encoder/ms-marco-MiniLM-L-6-v2",
    name: "MS MARCO MiniLM L-6 v2",
    type: "cross-encoder",
    description: "Fast, good quality",
  },
  {
    id: "cross-encoder/ms-marco-MiniLM-L-12-v2",
    name: "MS MARCO MiniLM L-12 v2",
    type: "cross-encoder",
    description: "Higher quality, slower",
  },
  {
    id: "BAAI/bge-reranker-base",
    name: "BGE Reranker Base",
    type: "cross-encoder",
    description: "Good general-purpose reranker",
  },
  {
    id: "BAAI/bge-reranker-large",
    name: "BGE Reranker Large",
    type: "cross-encoder",
    description: "Highest quality reranker",
  },
];

/**
 * Check if a model ID looks like a valid cross-encoder reranker.
 * Returns true for known reranker models.
 * Returns false for known embedding models (common misconfiguration).
 * Returns null for unknown models (can't determine).
 */
export function isValidRerankerModel(modelId: string): boolean | null {
  const trimmed = modelId.trim();
  if (!trimmed) return false;

  // Known reranker → valid
  if (RERANKER_MODELS.some((m) => m.id === trimmed)) return true;

  // Known embedding model → definitely invalid as reranker
  if (ALL_EMBEDDING_MODELS.some((m) => m.id === trimmed)) return false;

  // Heuristic: cross-encoder prefix is a strong signal
  if (trimmed.startsWith("cross-encoder/")) return true;

  // Heuristic: reranker in the name is a strong signal
  if (trimmed.toLowerCase().includes("reranker")) return true;

  // Heuristic: common embedding model prefixes → likely invalid
  const embeddingPrefixes = [
    "Xenova/", "openai/text-embedding", "voyage-ai/", "qwen/qwen3-embedding",
  ];
  if (embeddingPrefixes.some((p) => trimmed.startsWith(p))) return false;

  // Unknown model — can't determine
  return null;
}

// ─── Validation Helpers ─────────────────────────────────────────────────────

export interface ModelValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
  /** The detected embedding dimensions, if known */
  embeddingDimensions?: number;
  /** Whether a reindex is required */
  reindexRequired?: boolean;
}

/**
 * Validate the embedding + reranker model configuration.
 *
 * This checks:
 * 1. The reranker model is a cross-encoder (not an embedding model)
 * 2. Whether switching embedding models will require a reindex
 * 3. Provides dimension info for the selected embedding model
 */
export function validateModelConfiguration(params: {
  embeddingProvider: string;
  embeddingModel: string;
  rerankingEnabled: boolean;
  rerankModel: string;
  previousEmbeddingProvider?: string;
  previousEmbeddingModel?: string;
}): ModelValidationResult {
  const result: ModelValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
  };

  // 1. Check embedding model dimensions
  const embeddingInfo = getEmbeddingModelInfo(params.embeddingModel);
  if (embeddingInfo) {
    result.embeddingDimensions = embeddingInfo.dimensions;
  } else if (params.embeddingModel) {
    result.warnings.push(
      `Custom embedding model "${params.embeddingModel}" — dimensions will be auto-detected at indexing time.`
    );
  }

  // 2. Check if reranker model is valid (when reranking is enabled)
  if (params.rerankingEnabled && params.rerankModel) {
    const rerankValid = isValidRerankerModel(params.rerankModel);

    if (rerankValid === false) {
      result.valid = false;
      result.errors.push(
        `"${params.rerankModel}" appears to be an embedding model, not a cross-encoder reranker. ` +
        `Rerankers must be cross-encoder models that output relevance scores. ` +
        `Try "cross-encoder/ms-marco-MiniLM-L-6-v2" instead.`
      );
    } else if (rerankValid === null) {
      result.warnings.push(
        `Custom reranker "${params.rerankModel}" — ensure this is a cross-encoder model, not an embedding model.`
      );
    }
  }

  // 3. Check if embedding model change requires reindex
  if (params.previousEmbeddingModel || params.previousEmbeddingProvider) {
    const providerChanged =
      params.previousEmbeddingProvider !== undefined &&
      params.previousEmbeddingProvider !== params.embeddingProvider;
    const modelChanged =
      params.previousEmbeddingModel !== undefined &&
      params.previousEmbeddingModel !== params.embeddingModel;

    if (providerChanged || modelChanged) {
      result.reindexRequired = true;

      const prevDims = params.previousEmbeddingModel
        ? getEmbeddingDimensions(params.previousEmbeddingModel)
        : undefined;
      const newDims = result.embeddingDimensions;

      if (prevDims && newDims && prevDims !== newDims) {
        result.warnings.push(
          `Switching from ${prevDims}-dim to ${newDims}-dim embeddings. ` +
          `All existing vectors must be reindexed.`
        );
      } else {
        result.warnings.push(
          `Embedding model changed. A full reindex of the vector database is required.`
        );
      }
    }
  }

  return result;
}
