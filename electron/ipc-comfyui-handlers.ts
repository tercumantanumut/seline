import {
  ipcMain,
  net,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { debugLog, debugError } from "./debug-logger";
import type { IpcHandlerContext } from "./ipc-handlers";
import {
  COMFYUI_MODELS,
  getComfyUIBackendPath,
  ensureComfyUIBackend,
  execPromise,
  findDockerComposeFile,
  dockerComposeExec,
  sleep,
  downloadFileWithProgress,
} from "./ipc-docker-helpers";
import type { BrowserWindow } from "electron";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function sendComfyUIProgress(mainWindow: () => BrowserWindow | null, data: { stage: string; progress: number; message: string; error?: string }): void {
  mainWindow()?.webContents.send("comfyui:installProgress", data);
}

// ---------------------------------------------------------------------------
// Registration function
// ---------------------------------------------------------------------------

export function registerComfyUIHandlers(ctx: IpcHandlerContext): void {
  const { mainWindow, isDev, userDataPath } = ctx;

  ipcMain.handle("comfyui:checkStatus", async (_event, backendPath?: string) => {
    const effectivePath = backendPath || getComfyUIBackendPath(isDev, userDataPath);

    const status = {
      dockerInstalled: false,
      imageBuilt: false,
      containerRunning: false,
      apiHealthy: false,
      modelsDownloaded: false,
      checkpointExists: false,
      loraExists: false,
    };

    try {
      await execPromise("docker --version");
      status.dockerInstalled = true;

      const images = await execPromise("docker images z-image-turbo-fp8 --format \"{{.Repository}}\"");
      status.imageBuilt = images.trim().includes("z-image-turbo-fp8");

      const containers = await execPromise("docker ps --filter \"name=comfyui-z-image\" --format \"{{.Names}}\"");
      status.containerRunning = containers.trim().includes("comfyui-z-image");

      async function checkAvailableModels(): Promise<{ checkpoints: string[], loras: string[] }> {
        try {
          const [checkpointRes, loraRes] = await Promise.all([
            net.fetch("http://127.0.0.1:8188/object_info/CheckpointLoaderSimple"),
            net.fetch("http://127.0.0.1:8188/object_info/LoraLoader")
          ]);

          if (!checkpointRes.ok || !loraRes.ok) return { checkpoints: [], loras: [] };

          const checkpointData = await checkpointRes.json() as any;
          const loraData = await loraRes.json() as any;

          const checkpoints = checkpointData?.CheckpointLoaderSimple?.input?.required?.ckpt_name?.[0] || [];
          const loras = loraData?.LoraLoader?.input?.required?.lora_name?.[0] || [];

          return { checkpoints, loras };
        } catch (e) {
          return { checkpoints: [], loras: [] };
        }
      }

      if (status.containerRunning) {
        try {
          const response = await net.fetch("http://127.0.0.1:8000/health");
          status.apiHealthy = response.ok;
        } catch {
          status.apiHealthy = false;
        }
      }

      let modelsFoundViaApi = false;

      if (status.containerRunning) {
        try {
          const { checkpoints, loras } = await checkAvailableModels();

          if (checkpoints.some((c: string) => c.includes(COMFYUI_MODELS.checkpoint.name))) {
            status.checkpointExists = true;
          }
          if (loras.some((l: string) => l.includes(COMFYUI_MODELS.lora.name))) {
            status.loraExists = true;
          }

          if (status.checkpointExists && status.loraExists) {
            status.modelsDownloaded = true;
            modelsFoundViaApi = true;
          }
        } catch (e) {
          debugError("[ComfyUI] Failed to check models via API:", e);
        }
      }

      if (!modelsFoundViaApi && effectivePath) {
        const checkpointPath = path.join(effectivePath, COMFYUI_MODELS.checkpoint.path, COMFYUI_MODELS.checkpoint.name);
        const loraPath = path.join(effectivePath, COMFYUI_MODELS.lora.path, COMFYUI_MODELS.lora.name);

        if (!status.checkpointExists) status.checkpointExists = fs.existsSync(checkpointPath);
        if (!status.loraExists) status.loraExists = fs.existsSync(loraPath);

        status.modelsDownloaded = status.checkpointExists && status.loraExists;
      }

      if (status.apiHealthy && !status.modelsDownloaded) {
        status.modelsDownloaded = true;
        status.checkpointExists = true;
        status.loraExists = true;
      }
    } catch (error) {
      debugError("[ComfyUI] Status check error:", error);
    }

    return status;
  });

  ipcMain.handle("comfyuiCustom:detect", async (_event, options?: { host?: string; ports?: number[]; useHttps?: boolean }) => {
    try {
      const { detectComfyUIBaseUrl } = await import("../lib/comfyui/custom/client");
      return await detectComfyUIBaseUrl(options);
    } catch (error) {
      return { baseUrl: null, source: "error", error: error instanceof Error ? error.message : "Detection failed" };
    }
  });

  ipcMain.handle("comfyuiCustom:resolve", async (_event, override?: { comfyuiBaseUrl?: string; comfyuiHost?: string; comfyuiPort?: number }) => {
    try {
      const { resolveCustomComfyUIBaseUrl } = await import("../lib/comfyui/custom/client");
      return await resolveCustomComfyUIBaseUrl(override);
    } catch (error) {
      return { baseUrl: null, source: "error", error: error instanceof Error ? error.message : "Resolution failed" };
    }
  });

  ipcMain.handle("comfyui:install", async (_event, backendPath: string) => {
    try {
      sendComfyUIProgress(mainWindow, { stage: "building", progress: 10, message: "Building Docker image..." });

      const dockerComposePath = findDockerComposeFile(backendPath);
      if (!dockerComposePath) {
        throw new Error(`docker-compose.yml/yaml not found in ${backendPath}`);
      }

      await new Promise<void>((resolve, reject) => {
        const build = spawn("docker-compose", ["build"], {
          cwd: backendPath,
          shell: true,
        });

        let progress = 10;
        build.stdout?.on("data", (data) => {
          const line = data.toString();
          debugLog("[ComfyUI Build]", line);
          progress = Math.min(progress + 2, 80);
          sendComfyUIProgress(mainWindow, { stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.stderr?.on("data", (data) => {
          debugLog("[ComfyUI Build stderr]", data.toString());
        });

        build.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });

        build.on("error", (err) => {
          reject(err);
        });
      });

      sendComfyUIProgress(mainWindow, { stage: "complete", progress: 100, message: "Docker image built successfully!" });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendComfyUIProgress(mainWindow, { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("comfyui:downloadModels", async (_event, backendPath: string) => {
    try {
      sendComfyUIProgress(mainWindow, { stage: "downloading-models", progress: 0, message: "Preparing to download models..." });

      const checkpointDir = path.join(backendPath, COMFYUI_MODELS.checkpoint.path);
      const loraDir = path.join(backendPath, COMFYUI_MODELS.lora.path);
      fs.mkdirSync(checkpointDir, { recursive: true });
      fs.mkdirSync(loraDir, { recursive: true });

      const checkpointPath = path.join(checkpointDir, COMFYUI_MODELS.checkpoint.name);
      if (!fs.existsSync(checkpointPath)) {
        sendComfyUIProgress(mainWindow, { stage: "downloading-models", progress: 5, message: "Downloading checkpoint (~11GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.checkpoint.url,
          checkpointPath,
          (progress) => {
            sendComfyUIProgress(mainWindow, {
              stage: "downloading-models",
              progress: 5 + Math.floor(progress * 0.7),
              message: `Downloading checkpoint: ${progress}%`
            });
          }
        );
      }

      const loraPath = path.join(loraDir, COMFYUI_MODELS.lora.name);
      if (!fs.existsSync(loraPath)) {
        sendComfyUIProgress(mainWindow, { stage: "downloading-models", progress: 80, message: "Downloading LoRA (~1.2GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.lora.url,
          loraPath,
          (progress) => {
            sendComfyUIProgress(mainWindow, {
              stage: "downloading-models",
              progress: 80 + Math.floor(progress * 0.2),
              message: `Downloading LoRA: ${progress}%`
            });
          }
        );
      }

      sendComfyUIProgress(mainWindow, { stage: "complete", progress: 100, message: "Models downloaded successfully!" });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendComfyUIProgress(mainWindow, { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("comfyui:start", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getComfyUIBackendPath(isDev, userDataPath);

      sendComfyUIProgress(mainWindow, { stage: "starting", progress: 50, message: "Starting ComfyUI container..." });

      await dockerComposeExec("up -d", { cwd: effectivePath });

      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await net.fetch("http://localhost:8000/health");
          if (response.ok) {
            sendComfyUIProgress(mainWindow, { stage: "complete", progress: 100, message: "ComfyUI is running!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendComfyUIProgress(mainWindow, { stage: "starting", progress: 50 + attempts, message: `Waiting for API... (${attempts}/30)` });
      }

      throw new Error("API health check timed out after 60 seconds");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("comfyui:stop", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getComfyUIBackendPath(isDev, userDataPath);

      try {
        await dockerComposeExec("down", { cwd: effectivePath });
        return { success: true };
      } catch (e) {
        debugLog("[ComfyUI] docker compose down failed, trying direct stop...");
      }

      try {
        await execPromise("docker stop comfyui-z-image z-image-api");
        await execPromise("docker rm comfyui-z-image z-image-api");
      } catch {
        await execPromise("docker rm -f comfyui-z-image z-image-api");
      }
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("comfyui:getDefaultPath", async () => {
    try {
      const backendPath = getComfyUIBackendPath(isDev, userDataPath);
      return { success: true, path: backendPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("comfyui:fullSetup", async () => {
    try {
      sendComfyUIProgress(mainWindow, { stage: "checking", progress: 5, message: "Setting up ComfyUI backend..." });
      const backendPath = await ensureComfyUIBackend(isDev, userDataPath);
      debugLog("[ComfyUI] Backend path:", backendPath);

      sendComfyUIProgress(mainWindow, { stage: "checking", progress: 10, message: "Checking Docker installation..." });
      try {
        await execPromise("docker --version");
      } catch {
        throw new Error("Docker is not installed. Please install Docker Desktop first.");
      }

      sendComfyUIProgress(mainWindow, { stage: "building", progress: 15, message: "Building Docker images (this may take 10-20 minutes)..." });

      const dockerComposePath = findDockerComposeFile(backendPath);
      if (!dockerComposePath) {
        throw new Error(`docker-compose.yml/yaml not found in ${backendPath}`);
      }

      await new Promise<void>((resolve, reject) => {
        const composeCmd = process.platform === "win32" ? "docker" : "docker";
        const composeArgs = process.platform === "win32" ? ["compose", "build"] : ["compose", "build"];

        const build = spawn(composeCmd, composeArgs, {
          cwd: backendPath,
          shell: true,
        });

        let progress = 15;
        build.stdout?.on("data", (data) => {
          const line = data.toString();
          debugLog("[ComfyUI Build]", line);
          progress = Math.min(progress + 1, 40);
          sendComfyUIProgress(mainWindow, { stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.stderr?.on("data", (data) => {
          const line = data.toString();
          debugLog("[ComfyUI Build stderr]", line);
          progress = Math.min(progress + 1, 40);
          sendComfyUIProgress(mainWindow, { stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });

        build.on("error", (err) => {
          reject(err);
        });
      });

      sendComfyUIProgress(mainWindow, { stage: "downloading-models", progress: 45, message: "Downloading models (~12GB total)..." });

      const checkpointDir = path.join(backendPath, COMFYUI_MODELS.checkpoint.path);
      const loraDir = path.join(backendPath, COMFYUI_MODELS.lora.path);
      fs.mkdirSync(checkpointDir, { recursive: true });
      fs.mkdirSync(loraDir, { recursive: true });

      const checkpointPath = path.join(checkpointDir, COMFYUI_MODELS.checkpoint.name);
      if (!fs.existsSync(checkpointPath)) {
        sendComfyUIProgress(mainWindow, { stage: "downloading-models", progress: 45, message: "Downloading checkpoint model (~11GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.checkpoint.url,
          checkpointPath,
          (percent) => {
            const overallProgress = 45 + Math.floor(percent * 0.35);
            sendComfyUIProgress(mainWindow, {
              stage: "downloading-models",
              progress: overallProgress,
              message: `Downloading checkpoint: ${percent}%`
            });
          }
        );
      }

      const loraPath = path.join(loraDir, COMFYUI_MODELS.lora.name);
      if (!fs.existsSync(loraPath)) {
        sendComfyUIProgress(mainWindow, { stage: "downloading-models", progress: 80, message: "Downloading LoRA model (~1.2GB)..." });
        await downloadFileWithProgress(
          COMFYUI_MODELS.lora.url,
          loraPath,
          (percent) => {
            const overallProgress = 80 + Math.floor(percent * 0.1);
            sendComfyUIProgress(mainWindow, {
              stage: "downloading-models",
              progress: overallProgress,
              message: `Downloading LoRA: ${percent}%`
            });
          }
        );
      }

      sendComfyUIProgress(mainWindow, { stage: "starting", progress: 92, message: "Starting ComfyUI containers..." });
      await dockerComposeExec("up -d", { cwd: backendPath });

      let attempts = 0;
      while (attempts < 60) {
        try {
          const response = await net.fetch("http://localhost:8000/health");
          if (response.ok) {
            sendComfyUIProgress(mainWindow, { stage: "complete", progress: 100, message: "ComfyUI is ready!" });
            return { success: true, backendPath };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendComfyUIProgress(mainWindow, {
          stage: "starting",
          progress: 92 + Math.floor(attempts * 0.13),
          message: `Waiting for API to be ready... (${attempts}/60)`
        });
      }

      throw new Error("API health check timed out after 2 minutes. The containers may still be starting up.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendComfyUIProgress(mainWindow, { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });
}
