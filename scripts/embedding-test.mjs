import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { AutoTokenizer, env, pipeline } from "@huggingface/transformers";

const DEFAULT_MODEL_ID = "Xenova/bge-large-en-v1.5";
const modelId = process.env.EMBEDDING_MODEL_ID || DEFAULT_MODEL_ID;
const expectedDimOverride = process.env.EMBEDDING_EXPECTED_DIM
  ? Number(process.env.EMBEDDING_EXPECTED_DIM)
  : null;
const queryPrefix = process.env.EMBEDDING_QUERY_PREFIX || "";

const cacheDir =
  process.env.EMBEDDING_CACHE_DIR ||
  path.join(process.cwd(), ".local-data", "transformers-cache");
env.cacheDir = cacheDir;
env.useBrowserCache = false;
env.allowLocalModels = true;

const modelDir = process.env.EMBEDDING_MODEL_DIR;
if (modelDir) {
  env.localModelPath = modelDir;
  env.allowRemoteModels = false;
} else {
  env.allowRemoteModels = true;
}

function resolvePreferredDevice() {
  const configured = process.env.LOCAL_EMBEDDING_DEVICE?.trim().toLowerCase();
  if (configured) return configured;
  if (process.platform === "win32") return "dml";
  if (process.platform === "linux" && process.arch === "x64") return "cuda";
  return "cpu";
}

function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const va = a[i];
    const vb = b[i];
    dot += va * vb;
    normA += va * va;
    normB += vb * vb;
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function toVector(output) {
  if (!output) return [];
  if (ArrayBuffer.isView(output)) return Array.from(output);
  if (output.data && ArrayBuffer.isView(output.data)) {
    return Array.from(output.data);
  }
  if (Array.isArray(output)) {
    return output.flat();
  }
  return [];
}

function resolveExpectedDim() {
  if (Number.isFinite(expectedDimOverride)) {
    return expectedDimOverride;
  }
  const lower = modelId.toLowerCase();
  if (lower.includes("minilm")) return 384;
  if (lower.includes("bge-large")) return 1024;
  if (lower.includes("bge-base")) return 768;
  if (lower.includes("bge-small")) return 384;
  if (lower.includes("e5-large")) return 1024;
  if (lower.includes("e5-base")) return 768;
  if (lower.includes("e5-small")) return 384;
  if (lower.includes("qwen3")) return 1024;
  return null;
}

function withPrefix(text) {
  if (!queryPrefix) return text;
  return `${queryPrefix} ${text}`.trim();
}

function resolveTokenizerPath() {
  if (!env.cacheDir) return null;
  const parts = modelId.split("/");
  return path.join(env.cacheDir, ...parts, "tokenizer.json");
}

function patchTokenizerMerges(tokenizerPath) {
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

async function loadTokenizerWithPatch(options) {
  try {
    return await AutoTokenizer.from_pretrained(modelId, options);
  } catch (error) {
    const message = String(error);
    if (message.includes("x.split is not a function")) {
      const tokenizerPath = resolveTokenizerPath();
      if (patchTokenizerMerges(tokenizerPath)) {
        console.log(`[Embedding Test] Patched tokenizer merges at ${tokenizerPath}`);
        return await AutoTokenizer.from_pretrained(modelId, options);
      }
    }
    throw error;
  }
}

async function main() {
  console.log(`[Embedding Test] Model: ${modelId}`);
  console.log(`[Embedding Test] Cache dir: ${env.cacheDir}`);
  console.log(`[Embedding Test] Local model path: ${env.localModelPath ?? "default"}`);
  console.log(`[Embedding Test] allowRemoteModels: ${env.allowRemoteModels}`);
  const preferredDevice = resolvePreferredDevice();
  console.log(`[Embedding Test] Preferred device: ${preferredDevice}`);

  const tokenizer = await loadTokenizerWithPatch({
    local_files_only: !env.allowRemoteModels,
  });

  const sampleText = "function greet(name) { return `Hello, ${name}!`; }";
  const tokenIds = tokenizer.encode(withPrefix(sampleText));
  console.log(`[Embedding Test] Token count: ${tokenIds.length}`);

  console.log("[Embedding Test] Loading feature-extraction pipeline...");
  let extractor;
  try {
    extractor = await pipeline("feature-extraction", modelId, {
      device: preferredDevice,
      dtype: "fp32",
    });
  } catch (error) {
    if (preferredDevice !== "cpu") {
      console.warn(
        `[Embedding Test] Failed on device "${preferredDevice}", retrying on cpu:`,
        error
      );
      extractor = await pipeline("feature-extraction", modelId, {
        device: "cpu",
        dtype: "fp32",
      });
    } else {
      console.error("[Embedding Test] Pipeline load failed:", error);
      throw error;
    }
  }
  console.log("[Embedding Test] Pipeline loaded");

  const output = await extractor(withPrefix(sampleText), {
    pooling: "mean",
    normalize: true,
  });
  const vector = toVector(output);
  const dims = output?.dims ?? [1, vector.length];

  console.log(`[Embedding Test] Embedding dims: ${dims.join("x")}`);
  console.log(`[Embedding Test] Vector length: ${vector.length}`);
  console.log(`[Embedding Test] Sample values: ${vector.slice(0, 5).map(v => v.toFixed(6)).join(", ")}`);

  const expectedDim = resolveExpectedDim();
  if (expectedDim && vector.length !== expectedDim) {
    throw new Error(`Expected ${expectedDim}-dim embedding, got ${vector.length}`);
  }

  const related = "Write a function that returns a greeting for a given name.";
  const unrelated = "The quantum field exhibits vacuum fluctuations.";

  const baseVec = vector;
  const relatedVec = toVector(
    await extractor(withPrefix(related), { pooling: "mean", normalize: true })
  );
  const unrelatedVec = toVector(
    await extractor(withPrefix(unrelated), { pooling: "mean", normalize: true })
  );

  const simRelated = cosineSimilarity(baseVec, relatedVec);
  const simUnrelated = cosineSimilarity(baseVec, unrelatedVec);

  console.log(`[Embedding Test] Similarity (related): ${simRelated.toFixed(4)}`);
  console.log(`[Embedding Test] Similarity (unrelated): ${simUnrelated.toFixed(4)}`);

  if (simRelated <= simUnrelated) {
    console.warn("[Embedding Test] Similarity check failed: related <= unrelated");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[Embedding Test] Failed:", error);
  process.exitCode = 1;
});
