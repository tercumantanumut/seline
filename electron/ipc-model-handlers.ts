import { ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import * as os from "node:os";
import { spawn } from "node:child_process";
import { listFiles, downloadFile } from "@huggingface/hub";
import { debugLog, debugError } from "./debug-logger";
import type { IpcHandlerContext } from "./ipc-handlers";
import {
  getParakeetModel,
  getSherpaOnnxArchiveName,
  getSherpaOnnxBinaryName,
  type ParakeetModel,
} from "@/lib/voice/parakeet-models";

const PARAKEET_DEFAULT_MODEL_ID = "parakeet-tdt-0.6b-v3";

function getParakeetBaseDir(userModelsDir: string): string {
  return path.join(userModelsDir, "parakeet");
}

function getParakeetModelDir(userModelsDir: string, model: ParakeetModel): string {
  return path.join(getParakeetBaseDir(userModelsDir), model.extractDir);
}

function readParakeetModelId(settingsPath: string): string | null {
  try {
    if (!fs.existsSync(settingsPath)) return null;
    const parsed = JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { parakeetModel?: string };
    return parsed.parakeetModel?.trim() || null;
  } catch {
    return null;
  }
}

function collectFilesRecursive(rootDir: string, maxDepth = 6): string[] {
  if (!fs.existsSync(rootDir)) return [];

  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  };

  walk(rootDir, 0);
  return out;
}

function getSherpaBinaryPath(userModelsDir: string): string | null {
  const binaryName = getSherpaOnnxBinaryName(process.platform, process.arch);
  if (!binaryName) return null;

  const baseDir = getParakeetBaseDir(userModelsDir);
  const candidates = collectFilesRecursive(baseDir)
    .filter((filePath) => path.basename(filePath) === binaryName);

  return candidates[0] ?? null;
}

function ensureExecutable(filePath: string): void {
  if (process.platform === "win32") return;
  try {
    fs.chmodSync(filePath, 0o755);
  } catch {
    // Best-effort; if chmod fails, spawn will surface the permission issue later.
  }
}

function extractArchive(archivePath: string, destinationDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tarCmd = process.platform === "win32" ? "tar.exe" : "tar";
    const child = spawn(tarCmd, ["-xjf", archivePath, "-C", destinationDir], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (err) => {
      reject(err);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tar extraction failed (exit ${code}): ${stderr.slice(0, 500)}`));
    });
  });
}

async function downloadToFile(url: string, destinationPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }

  const data = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(destinationPath, data);
}

function getSherpaRuntimeArchiveUrl(archiveName: string): string {
  return `https://github.com/k2-fsa/sherpa-onnx/releases/download/v1.12.23/${archiveName}`;
}

// ---------------------------------------------------------------------------
// Registration function
// ---------------------------------------------------------------------------

export function registerModelHandlers(ctx: IpcHandlerContext): void {
  const { userModelsDir } = ctx;

  // --------------------------------------------------------------------------
  // Model download handlers
  // --------------------------------------------------------------------------

  ipcMain.handle("model:getModelsDir", () => {
    return userModelsDir;
  });

  ipcMain.handle("model:checkExists", async (_event, modelId: string) => {
    const modelPath = path.join(userModelsDir, ...modelId.split("/"));
    return fs.existsSync(path.join(modelPath, "config.json"));
  });

  ipcMain.handle("model:download", async (event, modelId: string) => {
    try {
      const destDir = path.join(userModelsDir, ...modelId.split("/"));

      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      debugLog(`[Model] Starting download: ${modelId} -> ${destDir}`);

      const files: { path: string; size?: number }[] = [];
      for await (const file of listFiles({ repo: modelId, recursive: true })) {
        if (file.type === "file" && !file.path.startsWith(".git/")) {
          files.push({ path: file.path, size: file.size });
        }
      }

      const totalFiles = files.length;
      let downloadedFiles = 0;

      debugLog(`[Model] Found ${totalFiles} files to download`);

      event.sender.send("model:downloadProgress", {
        modelId,
        status: "downloading",
        progress: 0,
        totalFiles,
        downloadedFiles: 0,
        file: "Starting...",
      });

      for (const file of files) {
        const filePath = path.join(destDir, file.path);
        const fileDir = path.dirname(filePath);

        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        event.sender.send("model:downloadProgress", {
          modelId,
          status: "downloading",
          file: file.path,
          totalFiles,
          downloadedFiles,
          progress: Math.round((downloadedFiles / totalFiles) * 100),
        });

        const blob = await downloadFile({
          repo: modelId,
          path: file.path,
        });

        if (blob) {
          const buffer = await blob.arrayBuffer();
          fs.writeFileSync(filePath, Buffer.from(buffer));
        }

        downloadedFiles++;
      }

      debugLog(`[Model] Download complete: ${modelId}`);
      event.sender.send("model:downloadProgress", {
        modelId,
        status: "completed",
        progress: 100,
        totalFiles,
        downloadedFiles: totalFiles,
      });

      return { success: true };
    } catch (error) {
      debugError(`[Model] Download failed: ${modelId}`, error);
      event.sender.send("model:downloadProgress", {
        modelId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("model:checkFileExists", async (_event, opts: { modelId: string; filename: string }) => {
    const filePath = path.join(userModelsDir, "whisper", opts.filename);
    return fs.existsSync(filePath);
  });

  ipcMain.handle("model:downloadFile", async (event, opts: { modelId: string; repo: string; filename: string }) => {
    try {
      const destDir = path.join(userModelsDir, "whisper");
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const destPath = path.join(destDir, opts.filename);
      debugLog(`[Model] Starting single-file download: ${opts.repo}/${opts.filename} -> ${destPath}`);

      event.sender.send("model:downloadProgress", {
        modelId: opts.modelId,
        status: "downloading",
        progress: 0,
        file: opts.filename,
      });

      const blob = await downloadFile({
        repo: opts.repo,
        path: opts.filename,
      });

      if (!blob) {
        throw new Error(`File not found: ${opts.repo}/${opts.filename}`);
      }

      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(destPath, buffer);

      debugLog(`[Model] Single-file download complete: ${opts.filename} (${(buffer.length / 1024 / 1024).toFixed(1)} MB)`);

      event.sender.send("model:downloadProgress", {
        modelId: opts.modelId,
        status: "completed",
        progress: 100,
        file: opts.filename,
      });

      return { success: true };
    } catch (error) {
      debugError(`[Model] Single-file download failed: ${opts.repo}/${opts.filename}`, error);
      event.sender.send("model:downloadProgress", {
        modelId: opts.modelId,
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      return { success: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("parakeet:getStatus", async (_event, requestedModelId?: string) => {
    const settingsPath = path.join(ctx.dataDir, "settings.json");
    const configuredModelId = readParakeetModelId(settingsPath);
    const modelId = requestedModelId || configuredModelId || PARAKEET_DEFAULT_MODEL_ID;
    const model = getParakeetModel(modelId);

    const baseDir = getParakeetBaseDir(userModelsDir);
    const modelDir = model ? getParakeetModelDir(userModelsDir, model) : null;
    const wsBinary = getSherpaBinaryPath(userModelsDir);

    return {
      installed: !!(modelDir && fs.existsSync(path.join(modelDir, "tokens.txt"))),
      running: false,
      modelId: model?.id ?? modelId,
      modelDir,
      wsBinary,
      wsAvailable: !!wsBinary,
      cpuThreads: Math.max(1, Math.min(8, Math.floor(os.cpus().length * 0.75))),
      baseDir,
    };
  });

  ipcMain.handle("parakeet:resolvePaths", async (_event, requestedModelId?: string) => {
    const settingsPath = path.join(ctx.dataDir, "settings.json");
    const configuredModelId = readParakeetModelId(settingsPath);
    const modelId = requestedModelId || configuredModelId || PARAKEET_DEFAULT_MODEL_ID;
    const model = getParakeetModel(modelId);

    if (!model) {
      return { success: false, error: `Unsupported Parakeet model: ${modelId}` };
    }

    const modelDir = getParakeetModelDir(userModelsDir, model);
    const wsBinary = getSherpaBinaryPath(userModelsDir);

    return {
      success: true,
      modelId: model.id,
      modelDir,
      wsBinary,
      modelInstalled: fs.existsSync(path.join(modelDir, "tokens.txt")),
      wsAvailable: !!wsBinary,
    };
  });

  ipcMain.handle("parakeet:downloadModel", async (event, requestedModelId?: string) => {
    const modelId = requestedModelId || PARAKEET_DEFAULT_MODEL_ID;
    const model = getParakeetModel(modelId);
    if (!model) {
      return { success: false, error: `Unsupported Parakeet model: ${modelId}` };
    }

    const archiveName = getSherpaOnnxArchiveName(process.platform, process.arch);
    if (!archiveName) {
      return {
        success: false,
        error: `Unsupported platform for sherpa-onnx runtime: ${process.platform}-${process.arch}`,
      };
    }

    const baseDir = getParakeetBaseDir(userModelsDir);
    const modelDir = getParakeetModelDir(userModelsDir, model);
    const runtimeArchivePath = path.join(baseDir, archiveName);
    const modelArchivePath = path.join(baseDir, path.basename(model.downloadUrl));

    fs.mkdirSync(baseDir, { recursive: true });

    const sendProgress = (status: string, progress: number, file?: string, error?: string) => {
      event.sender.send("model:downloadProgress", {
        modelId: model.id,
        status,
        progress,
        file,
        error,
      });
    };

    try {
      const existingBinary = getSherpaBinaryPath(userModelsDir);
      if (!existingBinary) {
        sendProgress("downloading", 5, archiveName);
        await downloadToFile(getSherpaRuntimeArchiveUrl(archiveName), runtimeArchivePath);
        sendProgress("downloading", 40, archiveName);

        await extractArchive(runtimeArchivePath, baseDir);
        sendProgress("downloading", 60, "runtime-extracted");
      }

      const resolvedBinary = getSherpaBinaryPath(userModelsDir);
      if (resolvedBinary) {
        ensureExecutable(resolvedBinary);
      }

      if (!fs.existsSync(path.join(modelDir, "tokens.txt"))) {
        sendProgress("downloading", 70, path.basename(model.downloadUrl));
        await downloadToFile(model.downloadUrl, modelArchivePath);

        sendProgress("downloading", 85, path.basename(model.downloadUrl));
        await extractArchive(modelArchivePath, baseDir);
      }

      sendProgress("completed", 100, model.extractDir);

      try {
        fs.unlinkSync(runtimeArchivePath);
      } catch {
        // best effort
      }
      try {
        fs.unlinkSync(modelArchivePath);
      } catch {
        // best effort
      }

      return {
        success: true,
        modelId: model.id,
        modelDir,
        wsBinary: getSherpaBinaryPath(userModelsDir),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      debugError(`[Parakeet] Download failed for ${model.id}`, error);
      sendProgress("error", 0, undefined, message);
      return { success: false, error: message };
    }
  });
}
