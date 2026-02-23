import { ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs";
import { listFiles, downloadFile } from "@huggingface/hub";
import { debugLog, debugError } from "./debug-logger";
import type { IpcHandlerContext } from "./ipc-handlers";

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
}
