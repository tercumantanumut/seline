import { existsSync, mkdirSync, createWriteStream, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir, platform } from "node:os";

const VOSK_MODELS: Record<string, { url: string; size: string }> = {
  "vosk-model-small-en-us-0.15": {
    url: "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip",
    size: "40MB",
  },
  "vosk-model-small-de-0.15": {
    url: "https://alphacephei.com/vosk/models/vosk-model-small-de-0.15.zip",
    size: "45MB",
  },
  "vosk-model-small-fr-0.22": {
    url: "https://alphacephei.com/vosk/models/vosk-model-small-fr-0.22.zip",
    size: "41MB",
  },
  "vosk-model-small-es-0.42": {
    url: "https://alphacephei.com/vosk/models/vosk-model-small-es-0.42.zip",
    size: "39MB",
  },
};

const DEFAULT_MODEL = "vosk-model-small-en-us-0.15";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let voskModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let model: any = null;
let loadedModelId: string | null = null;

function getModelsDir(): string {
  // Use Electron userData path if available
  if (process.env.LOCAL_DATA_PATH) {
    return join(process.env.LOCAL_DATA_PATH, "..", "models", "vosk");
  }
  if (process.env.ELECTRON_USER_DATA_PATH) {
    return join(process.env.ELECTRON_USER_DATA_PATH, "models", "vosk");
  }

  // Platform-specific Electron userData fallback
  const appName = process.env.NODE_ENV === "development" ? "seline-dev" : "seline";
  const os = platform();
  let userDataDir: string;
  if (os === "darwin") {
    userDataDir = join(homedir(), "Library", "Application Support", appName);
  } else if (os === "win32") {
    userDataDir = join(process.env.APPDATA || join(homedir(), "AppData", "Roaming"), appName);
  } else {
    userDataDir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), appName);
  }
  return join(userDataDir, "models", "vosk");
}

function getModelPath(modelId: string): string {
  return join(getModelsDir(), modelId);
}

export function isVoskAvailable(): boolean {
  try {
    require("vosk");
    return true;
  } catch {
    return false;
  }
}

export function isModelDownloaded(modelId: string = DEFAULT_MODEL): boolean {
  const modelPath = getModelPath(modelId);
  // Vosk models have a conf/ or am/ subdirectory
  return existsSync(modelPath) && (existsSync(join(modelPath, "conf")) || existsSync(join(modelPath, "am")));
}

export function getAvailableModels(): Array<{ id: string; url: string; size: string; downloaded: boolean }> {
  return Object.entries(VOSK_MODELS).map(([id, info]) => ({
    id,
    ...info,
    downloaded: isModelDownloaded(id),
  }));
}

export function getDefaultModelId(): string {
  return DEFAULT_MODEL;
}

/**
 * Load Vosk module and model. Returns the Model instance.
 * Lazy-loads on first call, caches afterward.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOrLoadModel(modelId: string = DEFAULT_MODEL): any {
  if (model && loadedModelId === modelId) {
    return model;
  }

  if (!voskModule) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-explicit-any
      voskModule = require("vosk") as any;
      voskModule.setLogLevel(-1); // Suppress Vosk logs
    } catch {
      throw new Error(
        "Vosk is not installed. Add it with: npm install vosk"
      );
    }
  }

  const modelPath = getModelPath(modelId);
  if (!existsSync(modelPath)) {
    throw new Error(
      `Vosk model "${modelId}" not found at ${modelPath}. Download it first in Settings.`
    );
  }

  // Free previous model if switching
  if (model) {
    model.free();
    model = null;
    loadedModelId = null;
  }

  model = new voskModule.Model(modelPath);
  loadedModelId = modelId;
  console.log(`[Vosk] Model loaded: ${modelId}`);
  return model;
}

/**
 * Download a Vosk model. Extracts the zip to the models directory.
 * Returns a progress callback interface.
 */
export async function downloadModel(
  modelId: string = DEFAULT_MODEL,
  onProgress?: (percent: number) => void
): Promise<void> {
  const modelInfo = VOSK_MODELS[modelId];
  if (!modelInfo) {
    throw new Error(`Unknown Vosk model: ${modelId}`);
  }

  const modelsDir = getModelsDir();
  if (!existsSync(modelsDir)) {
    mkdirSync(modelsDir, { recursive: true });
  }

  const modelPath = getModelPath(modelId);

  console.log(`[Vosk] Downloading model ${modelId} from ${modelInfo.url}...`);

  const response = await fetch(modelInfo.url);
  if (!response.ok) {
    throw new Error(`Failed to download Vosk model: HTTP ${response.status}`);
  }

  const contentLength = Number(response.headers.get("content-length") || 0);
  const zipPath = join(modelsDir, `${modelId}.zip`);

  // Download to temp zip file with progress
  const fileStream = createWriteStream(zipPath);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  let downloaded = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fileStream.write(Buffer.from(value));
      downloaded += value.length;
      if (contentLength > 0 && onProgress) {
        onProgress(Math.round((downloaded / contentLength) * 100));
      }
    }
    fileStream.end();
    await new Promise<void>((resolve, reject) => {
      fileStream.on("finish", resolve);
      fileStream.on("error", reject);
    });

    // Extract zip
    console.log(`[Vosk] Extracting model to ${modelsDir}...`);
    execFileSync("unzip", ["-o", "-q", zipPath, "-d", modelsDir], {
      timeout: 120000,
      stdio: "pipe",
    });

    // Clean up zip
    try { unlinkSync(zipPath); } catch {}

    console.log(`[Vosk] Model ${modelId} ready at ${modelPath}`);
  } catch (err) {
    // Clean up on failure
    try { unlinkSync(zipPath); } catch {}
    throw err;
  }
}

/**
 * Free the loaded model (for cleanup).
 */
export function freeModel(): void {
  if (model) {
    model.free();
    model = null;
    loadedModelId = null;
  }
}
