/**
 * Transformers.js Cross-Encoder Reranking
 * Reference: docs/vector-search-v2-analysis.md Section 2.4
 */

import { VectorSearchHit } from "@/lib/vectordb/search";
import { getVectorSearchConfig } from "@/lib/config/vector-search";
import path from "path";
import fs from "fs";
import { loadSettings } from "@/lib/settings/settings-manager";

let cachedPipeline: any = null;
let cachedPipelinePromise: Promise<any> | null = null;
let failedToLoad = false;
type TransformerDevice =
  | "auto"
  | "gpu"
  | "cpu"
  | "wasm"
  | "webgpu"
  | "cuda"
  | "dml"
  | "webnn"
  | "webnn-npu"
  | "webnn-gpu"
  | "webnn-cpu";

function isTransformerDevice(value: string): value is TransformerDevice {
  return [
    "auto",
    "gpu",
    "cpu",
    "wasm",
    "webgpu",
    "cuda",
    "dml",
    "webnn",
    "webnn-npu",
    "webnn-gpu",
    "webnn-cpu",
  ].includes(value);
}

function resolvePreferredDevice(): TransformerDevice {
  const configured = process.env.LOCAL_EMBEDDING_DEVICE?.trim().toLowerCase();
  if (configured && isTransformerDevice(configured)) return configured;

  if (process.platform === "win32") return "dml";
  if (process.platform === "linux" && process.arch === "x64") return "cuda";
  return "cpu";
}

/**
 * Configure Transformers.js environment
 */
async function configureEnv() {
  const { env } = await import("@huggingface/transformers");
  const settings = loadSettings();

  const basePath = process.env.LOCAL_DATA_PATH || path.join(process.cwd(), ".local-data");
  env.cacheDir = path.join(basePath, "transformers-cache");
  env.useBrowserCache = false;
  env.allowLocalModels = true;
  env.allowRemoteModels = true;

  const modelDir = process.env.EMBEDDING_MODEL_DIR || settings.embeddingModelDir;
  if (modelDir) {
    env.localModelPath = modelDir;
  }
}

function normalizeRerankModelId(rawModelId: string): string | null {
  if (!rawModelId) return null;

  let modelId = rawModelId.trim().replace(/\\/g, "/");

  // Legacy config sometimes stores hub IDs prefixed with "models/".
  if (modelId.toLowerCase().startsWith("models/")) {
    modelId = modelId.slice("models/".length);
  }

  // Legacy ONNX file path from older reranker implementation.
  if (modelId.toLowerCase().endsWith(".onnx")) {
    const base = path.basename(modelId).toLowerCase();
    if (base === "ms-marco-minilm-l-6-v2.onnx") {
      return "cross-encoder/ms-marco-MiniLM-L-6-v2";
    }
    console.warn(`[Reranker] Unsupported ONNX file path in rerankModel: ${rawModelId}`);
    return null;
  }

  return modelId || null;
}

/**
 * Load the reranker pipeline (Transformers.js handles cross-encoders via text-classification or feature-extraction)
 */
async function getPipeline(): Promise<any> {
  if (failedToLoad) return null;
  if (cachedPipeline) return cachedPipeline;
  if (cachedPipelinePromise) return cachedPipelinePromise;

  const config = getVectorSearchConfig();
  const modelPath = normalizeRerankModelId(config.rerankModel);
  if (!modelPath) {
    failedToLoad = true;
    return null;
  }

  cachedPipelinePromise = (async () => {
    try {
      await configureEnv();
      const { pipeline } = await import("@huggingface/transformers");
      const preferredDevice = resolvePreferredDevice();

      console.log(`[Reranker] Loading model via Transformers.js: ${modelPath}`);

      // Attempt to load as text-classification (standard for cross-encoders)
      let pipe: any;
      try {
        pipe = await pipeline("text-classification", modelPath, {
          device: preferredDevice,
          dtype: "fp32",
        });
      } catch (error) {
        if (preferredDevice !== "cpu") {
          console.warn(
            `[Reranker] Failed to initialize on device "${preferredDevice}", falling back to cpu:`,
            error
          );
          pipe = await pipeline("text-classification", modelPath, {
            device: "cpu",
            dtype: "fp32",
          });
        } else {
          throw error;
        }
      }

      console.log("[Reranker] Model loaded successfully");
      cachedPipeline = pipe;
      return pipe;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error(`[Reranker] Failed to load model: ${errorMsg}`);
      failedToLoad = true;
      return null;
    } finally {
      cachedPipelinePromise = null;
    }
  })();

  return cachedPipelinePromise;
}

/**
 * Rerank search results using Transformers.js.
 * Falls back to original order if reranking unavailable.
 */
export async function rerankResults(
  query: string,
  hits: VectorSearchHit[]
): Promise<VectorSearchHit[]> {
  const config = getVectorSearchConfig();

  if (!config.enableReranking || hits.length === 0 || failedToLoad) {
    return hits;
  }

  const pipe = await getPipeline();
  if (!pipe) {
    return hits;
  }

  const rerankLimit = Math.min(config.rerankTopK, hits.length);
  const toRerank = hits.slice(0, rerankLimit);
  const remainder = hits.slice(rerankLimit);

  try {
    const scores: number[] = [];

    for (const hit of toRerank) {
      // Cross-encoders typically take a pair of sentences
      const result = await pipe(query, hit.text);

      // Diagnostic: Check if output looks like a classification result (score)
      // result is typically [{label: 'LABEL_0', score: 0.99}]
      if (Array.isArray(result) && result[0]?.score !== undefined) {
        scores.push(result[0].score);
      } else {
        // If it doesn't look like classification, it might be an embedding model
        console.warn("[Reranker] Unexpected output format. This model may be an EMBEDDING model, not a CROSS-ENCODER.");
        console.warn("[Reranker] Switching to silent fallback (standard search results).");
        failedToLoad = true;
        return hits;
      }
    }

    const reranked = toRerank
      .map((hit, i) => ({ hit, score: scores[i] }))
      .sort((a, b) => b.score - a.score)
      .map(({ hit, score }) => ({ ...hit, score }));

    console.log(`[Reranker] Reranked ${toRerank.length} results using Transformers.js`);
    return [...reranked, ...remainder];
  } catch (error) {
    console.error("[Reranker] Error during reranking:", error);
    return hits;
  }
}
