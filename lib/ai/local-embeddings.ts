import fs from "node:fs";
import path from "node:path";
import type { EmbeddingModelV2, EmbeddingModelV2Embedding } from "@ai-sdk/provider";

export const DEFAULT_LOCAL_EMBEDDING_MODEL = "Xenova/bge-large-en-v1.5";
const DEFAULT_QUERY_PREFIX = "Represent this code for search:";
const DEFAULT_QUERY_MAX_CHARS = 512;
const DEFAULT_MAX_BATCH = 64;
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

// Define a type that matches the actual pipeline return value
type FeatureExtractionPipeline = (
  texts: string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<unknown>;

export interface LocalEmbeddingOptions {
  modelId?: string;
  modelDir?: string;
  cacheDir?: string;
  allowRemoteModels?: boolean;
  queryPrefix?: string;
  queryPrefixMaxChars?: number;
}

let cachedPipelineKey: string | null = null;
let cachedPipelinePromise: Promise<FeatureExtractionPipeline> | null = null;
let embeddingLock: Promise<void> = Promise.resolve();
let runtimeFallbackDevice: TransformerDevice | null = null;

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
  if (runtimeFallbackDevice) return runtimeFallbackDevice;

  const configured = process.env.LOCAL_EMBEDDING_DEVICE?.trim().toLowerCase();
  if (configured && isTransformerDevice(configured)) return configured;

  if (process.platform === "win32") return "dml";
  if (process.platform === "linux" && process.arch === "x64") return "cuda";
  return "cpu";
}

function resetPipelineCache(): void {
  cachedPipelineKey = null;
  cachedPipelinePromise = null;
}

function isRecoverableGpuRuntimeError(error: unknown): boolean {
  const message = String(error ?? "").toLowerCase();
  return (
    message.includes("device instance has been suspended") ||
    message.includes("getdeviceremovedreason") ||
    message.includes("dxgi_error_device_removed") ||
    message.includes("dxgi_error_device_hung") ||
    message.includes("887a0005")
  );
}

function resolveCacheDir(override?: string): string {
  if (override) return override;
  if (process.env.EMBEDDING_CACHE_DIR) return process.env.EMBEDDING_CACHE_DIR;
  const basePath = process.env.LOCAL_DATA_PATH || path.join(process.cwd(), ".local-data");
  return path.join(basePath, "transformers-cache");
}

function resolveModelDir(override?: string): string | undefined {
  if (override) return override;
  if (process.env.EMBEDDING_MODEL_DIR) return process.env.EMBEDDING_MODEL_DIR;

  // Fallback: read from settings.json (for Next.js dev server which doesn't have Electron env vars)
  try {
    const basePath = process.env.LOCAL_DATA_PATH || path.join(process.cwd(), ".local-data");
    const settingsPath = path.join(basePath, "settings.json");
    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      if (settings.embeddingModelDir && fs.existsSync(settings.embeddingModelDir)) {
        return settings.embeddingModelDir;
      }
    }
  } catch {
    // Ignore errors reading settings
  }

  return undefined;
}

function resolveQueryPrefix(override?: string | null): string {
  if (override !== undefined) return override ?? "";
  if (process.env.LOCAL_EMBEDDING_QUERY_PREFIX !== undefined) {
    return process.env.LOCAL_EMBEDDING_QUERY_PREFIX;
  }
  return DEFAULT_QUERY_PREFIX;
}

function resolveQueryMaxChars(override?: number): number {
  if (Number.isFinite(override)) return Number(override);
  const envValue = process.env.LOCAL_EMBEDDING_QUERY_MAX_CHARS;
  if (envValue) {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed)) return parsed;
  }
  return DEFAULT_QUERY_MAX_CHARS;
}

function applyQueryPrefix(text: string, prefix: string, maxChars: number): string {
  if (!prefix) return text;
  if (text.length > maxChars) return text;
  return `${prefix} ${text}`.trim();
}

function resolveTokenizerPath(cacheDir: string, modelId: string): string {
  const parts = modelId.split("/");
  return path.join(cacheDir, ...parts, "tokenizer.json");
}

function patchTokenizerMerges(tokenizerPath: string): boolean {
  if (!tokenizerPath || !fs.existsSync(tokenizerPath)) {
    return false;
  }
  const raw = fs.readFileSync(tokenizerPath, "utf8");
  const data = JSON.parse(raw);
  const merges = data?.merges ?? data?.model?.merges;
  if (!Array.isArray(merges) || merges.length === 0) {
    return false;
  }
  if (!Array.isArray(merges[0])) {
    return false;
  }
  const converted = merges.map((pair) => pair.join(" "));
  if (data.merges) {
    data.merges = converted;
  } else if (data.model) {
    data.model.merges = converted;
  }
  fs.writeFileSync(tokenizerPath, JSON.stringify(data));
  return true;
}

async function loadPipelineWithPatch(
  modelId: string,
  cacheDir: string
): Promise<FeatureExtractionPipeline> {
  const { pipeline } = await import("@huggingface/transformers");
  const preferredDevice = resolvePreferredDevice();

  const tryLoad = async (device: TransformerDevice): Promise<FeatureExtractionPipeline> => {
    try {
      return (await pipeline("feature-extraction", modelId, {
        device,
        dtype: "fp32",
      })) as unknown as FeatureExtractionPipeline;
    } catch (error) {
      const message = String(error);
      if (message.includes("x.split is not a function")) {
        const tokenizerPath = resolveTokenizerPath(cacheDir, modelId);
        if (patchTokenizerMerges(tokenizerPath)) {
          return (await pipeline("feature-extraction", modelId, {
            device,
            dtype: "fp32",
          })) as unknown as FeatureExtractionPipeline;
        }
      }
      throw error;
    }
  };

  try {
    return await tryLoad(preferredDevice);
  } catch (error) {
    if (preferredDevice !== "cpu") {
      console.warn(
        `[LocalEmbeddings] Failed to initialize on device "${preferredDevice}", falling back to cpu:`,
        error
      );
      return tryLoad("cpu");
    }
    throw error;
  }
}

async function getPipeline(options: LocalEmbeddingOptions): Promise<FeatureExtractionPipeline> {
  const modelId = options.modelId ?? DEFAULT_LOCAL_EMBEDDING_MODEL;
  const cacheDir = resolveCacheDir(options.cacheDir);
  const modelDir = resolveModelDir(options.modelDir);
  const allowRemoteModels = options.allowRemoteModels ?? !modelDir;
  const preferredDevice = resolvePreferredDevice();
  const cacheKey = [
    modelId,
    cacheDir,
    modelDir ?? "",
    allowRemoteModels ? "remote" : "local",
    preferredDevice,
  ].join("|");

  if (cachedPipelinePromise && cachedPipelineKey === cacheKey) {
    return cachedPipelinePromise;
  }

  cachedPipelineKey = cacheKey;
  cachedPipelinePromise = (async () => {
    const { env } = await import("@huggingface/transformers");
    env.cacheDir = cacheDir;
    env.useBrowserCache = false;
    env.allowLocalModels = true;
    env.allowRemoteModels = allowRemoteModels;
    if (modelDir) {
      env.localModelPath = modelDir;
      if (!fs.existsSync(modelDir)) {
        console.warn(`[LocalEmbeddings] Model dir not found: ${modelDir}`);
      }
    }

    return loadPipelineWithPatch(modelId, cacheDir);
  })();

  return cachedPipelinePromise;
}

function toEmbeddings(output: unknown, expectedCount: number): EmbeddingModelV2Embedding[] {
  if (!output) return [];

  if (Array.isArray(output)) {
    return (output as Array<Array<number>>).map((row) =>
      row.map((value) => Number(value))
    );
  }

  const tensor = output as { data?: Float32Array | Float64Array | number[]; dims?: number[] };
  if (!tensor.data || !tensor.dims) {
    return [];
  }

  if (tensor.dims.length !== 2) {
    throw new Error(`Unexpected embedding dims: ${tensor.dims.join("x")}`);
  }

  const [rows, cols] = tensor.dims;
  if (rows !== expectedCount) {
    throw new Error(`Embedding count mismatch: expected ${expectedCount}, got ${rows}`);
  }

  const data = Array.from(tensor.data);
  const embeddings: EmbeddingModelV2Embedding[] = [];
  for (let i = 0; i < rows; i += 1) {
    const start = i * cols;
    embeddings.push(data.slice(start, start + cols));
  }
  return embeddings;
}

export function createLocalEmbeddingModel(
  options: LocalEmbeddingOptions = {}
): EmbeddingModelV2<string> {
  const modelId = options.modelId ?? DEFAULT_LOCAL_EMBEDDING_MODEL;
  const queryPrefix = resolveQueryPrefix(options.queryPrefix ?? null);
  const queryMaxChars = resolveQueryMaxChars(options.queryPrefixMaxChars);

  return {
    specificationVersion: "v2",
    provider: "local",
    modelId,
    maxEmbeddingsPerCall: DEFAULT_MAX_BATCH,
    supportsParallelCalls: false,
    async doEmbed({ values }) {
      if (!values.length) {
        return { embeddings: [] };
      }

      const previousLock = embeddingLock;
      let releaseLock: (() => void) | undefined;
      embeddingLock = new Promise<void>((resolve) => {
        releaseLock = resolve;
      });
      await previousLock;

      try {
        const texts = values.map((value) => applyQueryPrefix(String(value), queryPrefix, queryMaxChars));
        let pipeline = await getPipeline({ ...options, modelId });
        let output: unknown;
        try {
          output = await pipeline(texts, { pooling: "mean", normalize: true });
        } catch (error) {
          if (!isRecoverableGpuRuntimeError(error) || resolvePreferredDevice() === "cpu") {
            throw error;
          }

          console.warn(
            '[LocalEmbeddings] GPU runtime error detected; switching local embeddings to CPU for this process:',
            error
          );
          runtimeFallbackDevice = "cpu";
          resetPipelineCache();
          pipeline = await getPipeline({ ...options, modelId });
          output = await pipeline(texts, { pooling: "mean", normalize: true });
        }

        const embeddings = toEmbeddings(output, values.length);

        return {
          embeddings,
          usage: { tokens: 0, totalTokens: 0 },
          warnings: [],
        };
      } finally {
        releaseLock?.();
      }
    },
  };
}
