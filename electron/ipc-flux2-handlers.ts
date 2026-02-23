import {
  ipcMain,
  net,
} from "electron";
import * as path from "path";
import * as fs from "fs";
import { spawn } from "child_process";
import { debugLog, debugError } from "./debug-logger";
import type { IpcHandlerContext } from "./ipc-handlers";
import type { BrowserWindow } from "electron";
import {
  FLUX2_KLEIN_4B_CONFIG,
  FLUX2_KLEIN_9B_CONFIG,
  getFlux2KleinBackendPath,
  ensureComfyUIBackend,
  execPromise,
  dockerComposeExec,
  sleep,
  getHuggingFaceToken,
} from "./ipc-docker-helpers";

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

function sendFlux2KleinProgress(mainWindow: () => BrowserWindow | null, variant: "4b" | "9b", data: { stage: string; progress: number; message: string; error?: string }): void {
  const channel = variant === "4b" ? "flux2Klein4b:installProgress" : "flux2Klein9b:installProgress";
  mainWindow()?.webContents.send(channel, data);
}

async function checkFlux2KleinStatus(
  variant: "4b" | "9b",
  isDev: boolean,
  userDataPath: string,
  backendPath?: string
) {
  const config = variant === "4b" ? FLUX2_KLEIN_4B_CONFIG : FLUX2_KLEIN_9B_CONFIG;
  const effectivePath = backendPath || getFlux2KleinBackendPath(variant, isDev, userDataPath);

  const status = {
    dockerInstalled: false,
    imageBuilt: false,
    containerRunning: false,
    apiHealthy: false,
    modelsDownloaded: false,
  };

  try {
    await execPromise("docker --version");
    status.dockerInstalled = true;

    const images = await execPromise(`docker images --format "{{.Repository}}"`);
    const imageList = images.toLowerCase();
    status.imageBuilt = imageList.includes(config.imageName) || imageList.includes(`${config.name}-${config.imageName}`);
    debugLog(`[FLUX.2 Klein ${variant}] Image check: imageBuilt=${status.imageBuilt}, looking for ${config.imageName} or ${config.name}-${config.imageName}`);

    const containers = await execPromise(`docker ps --format "{{.Names}}"`);
    const containerList = containers.toLowerCase();
    status.containerRunning = containerList.includes(config.containerName);

    if (status.containerRunning) {
      try {
        const response = await net.fetch(`http://127.0.0.1:${config.apiPort}/health`);
        status.apiHealthy = response.ok;
      } catch {
        status.apiHealthy = false;
      }
    }

    const sharedModelsDir = path.join(effectivePath, "..", "ComfyUI", "models");

    const requiredModels = {
      "4b": {
        vae: "flux2-vae.safetensors",
        clip: "qwen_3_4b.safetensors",
        diffusion: "flux-2-klein-base-4b-fp8.safetensors",
      },
      "9b": {
        vae: "flux2-vae.safetensors",
        clip: "qwen_3_4b.safetensors",
        diffusion: "flux-2-klein-base-9b-fp8.safetensors",
      },
    };

    const models = requiredModels[variant];
    const vaePath = path.join(sharedModelsDir, "vae", models.vae);
    const clipPath = path.join(sharedModelsDir, "clip", models.clip);
    const diffusionPath = path.join(sharedModelsDir, "diffusion_models", models.diffusion);

    const vaeExists = fs.existsSync(vaePath);
    const clipExists = fs.existsSync(clipPath);
    const diffusionExists = fs.existsSync(diffusionPath);

    debugLog(`[FLUX.2 Klein ${variant}] Model check: vae=${vaeExists}, clip=${clipExists}, diffusion=${diffusionExists}`);

    status.modelsDownloaded = vaeExists && clipExists && diffusionExists;

    if (status.apiHealthy) {
      status.modelsDownloaded = true;
    }

    if (status.imageBuilt && !status.modelsDownloaded) {
      if (fs.existsSync(sharedModelsDir)) {
        const vaeDir = path.join(sharedModelsDir, "vae");
        const clipDir = path.join(sharedModelsDir, "clip");
        const diffusionDir = path.join(sharedModelsDir, "diffusion_models");

        const hasAnyVae = fs.existsSync(vaeDir) && fs.readdirSync(vaeDir).some((f: string) => f.endsWith(".safetensors"));
        const hasAnyClip = fs.existsSync(clipDir) && fs.readdirSync(clipDir).some((f: string) => f.endsWith(".safetensors"));
        const hasAnyDiffusion = fs.existsSync(diffusionDir) && fs.readdirSync(diffusionDir).some((f: string) => f.endsWith(".safetensors"));

        if (hasAnyVae && hasAnyClip && hasAnyDiffusion) {
          debugLog(`[FLUX.2 Klein ${variant}] Found models in shared directory (may have different filenames)`);
          status.modelsDownloaded = true;
        }
      }
    }
  } catch (error) {
    debugError(`[${config.displayName}] Status check error:`, error);
  }

  return status;
}

// ---------------------------------------------------------------------------
// Registration function
// ---------------------------------------------------------------------------

export function registerFlux2Handlers(ctx: IpcHandlerContext): void {
  const { mainWindow, isDev, dataDir, userDataPath } = ctx;

  // --------------------------------------------------------------------------
  // FLUX.2 KLEIN 4B LOCAL BACKEND HANDLERS
  // --------------------------------------------------------------------------

  ipcMain.handle("flux2Klein4b:checkStatus", async (_event, backendPath?: string) => {
    return checkFlux2KleinStatus("4b", isDev, userDataPath, backendPath);
  });

  ipcMain.handle("flux2Klein4b:getDefaultPath", async () => {
    try {
      const backendPath = getFlux2KleinBackendPath("4b", isDev, userDataPath);
      return { success: true, path: backendPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein4b:start", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("4b", isDev, userDataPath);
      const hfToken = getHuggingFaceToken(isDev, dataDir);
      sendFlux2KleinProgress(mainWindow, "4b", { stage: "starting", progress: 50, message: "Starting FLUX.2 Klein 4B containers..." });

      await dockerComposeExec("up -d", { cwd: effectivePath, env: hfToken ? { HF_TOKEN: hfToken } : undefined });

      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_4B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress(mainWindow, "4b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 4B is ready!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress(mainWindow, "4b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("flux2Klein4b:stop", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("4b", isDev, userDataPath);
      await dockerComposeExec("down", { cwd: effectivePath });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein4b:fullSetup", async () => {
    try {
      let backendPath = getFlux2KleinBackendPath("4b", isDev, userDataPath);

      sendFlux2KleinProgress(mainWindow, "4b", { stage: "checking", progress: 5, message: "Checking prerequisites..." });

      if (!fs.existsSync(backendPath)) {
        if (!isDev) {
          await ensureComfyUIBackend(isDev, userDataPath);
          backendPath = getFlux2KleinBackendPath("4b", isDev, userDataPath);
        }
        if (!fs.existsSync(backendPath)) {
          throw new Error(`Backend folder not found: ${backendPath}. Please ensure FLUX.2 Klein 4B is properly installed.`);
        }
      }

      sendFlux2KleinProgress(mainWindow, "4b", { stage: "checking", progress: 10, message: "Checking Docker installation..." });
      try {
        await execPromise("docker --version");
      } catch {
        throw new Error("Docker is not installed. Please install Docker Desktop first.");
      }

      const hfToken = getHuggingFaceToken(isDev, dataDir);
      if (!hfToken) {
        throw new Error("Hugging Face token is required. Please enter your HF_TOKEN in the settings above.");
      }

      sendFlux2KleinProgress(mainWindow, "4b", { stage: "checking", progress: 15, message: "Checking for existing Docker images..." });

      let imagesExist = false;
      try {
        const imageList = await execPromise("docker images --format \"{{.Repository}}\"");
        imagesExist = imageList.toLowerCase().includes("flux2-klein-4b");
        debugLog(`[FLUX.2 Klein 4B] Images exist check: ${imagesExist}, images: ${imageList.trim()}`);
      } catch (e) {
        debugLog("[FLUX.2 Klein 4B] Failed to check existing images, will build:", e);
      }

      if (imagesExist) {
        sendFlux2KleinProgress(mainWindow, "4b", { stage: "building", progress: 80, message: "Using existing Docker images (skipping build)..." });
        debugLog("[FLUX.2 Klein 4B] Skipping build - images already exist");
      } else {
        sendFlux2KleinProgress(mainWindow, "4b", { stage: "building", progress: 15, message: "Building Docker images (this may take 10-15 minutes)..." });

        await new Promise<void>((resolve, reject) => {
          const build = spawn("docker", ["compose", "build"], {
            cwd: backendPath,
            shell: true,
            env: { ...process.env, HF_TOKEN: hfToken },
          });

          let progress = 15;
          build.stdout?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 4B Build]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress(mainWindow, "4b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.stderr?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 4B Build stderr]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress(mainWindow, "4b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Docker build failed with code ${code}`));
            }
          });

          build.on("error", reject);
        });
      }

      sendFlux2KleinProgress(mainWindow, "4b", { stage: "starting", progress: 85, message: "Starting FLUX.2 Klein 4B containers..." });
      await dockerComposeExec("up -d", { cwd: backendPath, env: { HF_TOKEN: hfToken } });

      let attempts = 0;
      while (attempts < 60) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_4B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress(mainWindow, "4b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 4B is ready!" });
            return { success: true, backendPath };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendFlux2KleinProgress(mainWindow, "4b", {
          stage: "starting",
          progress: 85 + Math.floor(attempts * 0.25),
          message: `Waiting for API to be ready... (${attempts}/60)`
        });
      }

      throw new Error("API health check timed out. The containers may still be starting up.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress(mainWindow, "4b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // --------------------------------------------------------------------------
  // FLUX.2 KLEIN 9B LOCAL BACKEND HANDLERS
  // --------------------------------------------------------------------------

  ipcMain.handle("flux2Klein9b:checkStatus", async (_event, backendPath?: string) => {
    return checkFlux2KleinStatus("9b", isDev, userDataPath, backendPath);
  });

  ipcMain.handle("flux2Klein9b:getDefaultPath", async () => {
    try {
      const backendPath = getFlux2KleinBackendPath("9b", isDev, userDataPath);
      return { success: true, path: backendPath };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein9b:start", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("9b", isDev, userDataPath);
      const hfToken = getHuggingFaceToken(isDev, dataDir);
      sendFlux2KleinProgress(mainWindow, "9b", { stage: "starting", progress: 50, message: "Starting FLUX.2 Klein 9B containers..." });

      await dockerComposeExec("up -d", { cwd: effectivePath, env: hfToken ? { HF_TOKEN: hfToken } : undefined });

      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_9B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress(mainWindow, "9b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 9B is ready!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress(mainWindow, "9b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle("flux2Klein9b:stop", async (_event, backendPath?: string) => {
    try {
      const effectivePath = backendPath || getFlux2KleinBackendPath("9b", isDev, userDataPath);
      await dockerComposeExec("down", { cwd: effectivePath });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  ipcMain.handle("flux2Klein9b:fullSetup", async () => {
    try {
      let backendPath = getFlux2KleinBackendPath("9b", isDev, userDataPath);

      sendFlux2KleinProgress(mainWindow, "9b", { stage: "checking", progress: 5, message: "Checking prerequisites..." });

      if (!fs.existsSync(backendPath)) {
        if (!isDev) {
          await ensureComfyUIBackend(isDev, userDataPath);
          backendPath = getFlux2KleinBackendPath("9b", isDev, userDataPath);
        }
        if (!fs.existsSync(backendPath)) {
          throw new Error(`Backend folder not found: ${backendPath}. Please ensure FLUX.2 Klein 9B is properly installed.`);
        }
      }

      sendFlux2KleinProgress(mainWindow, "9b", { stage: "checking", progress: 10, message: "Checking Docker installation..." });
      try {
        await execPromise("docker --version");
      } catch {
        throw new Error("Docker is not installed. Please install Docker Desktop first.");
      }

      const hfToken = getHuggingFaceToken(isDev, dataDir);
      if (!hfToken) {
        throw new Error("Hugging Face token is required. Please enter your HF_TOKEN in the settings above.");
      }

      sendFlux2KleinProgress(mainWindow, "9b", { stage: "checking", progress: 15, message: "Checking for existing Docker images..." });

      let imagesExist = false;
      try {
        const imageList = await execPromise("docker images --format \"{{.Repository}}\"");
        imagesExist = imageList.toLowerCase().includes("flux2-klein-9b");
        debugLog(`[FLUX.2 Klein 9B] Images exist check: ${imagesExist}, images: ${imageList.trim()}`);
      } catch (e) {
        debugLog("[FLUX.2 Klein 9B] Failed to check existing images, will build:", e);
      }

      if (imagesExist) {
        sendFlux2KleinProgress(mainWindow, "9b", { stage: "building", progress: 80, message: "Using existing Docker images (skipping build)..." });
        debugLog("[FLUX.2 Klein 9B] Skipping build - images already exist");
      } else {
        sendFlux2KleinProgress(mainWindow, "9b", { stage: "building", progress: 15, message: "Building Docker images (this may take 10-15 minutes)..." });

        await new Promise<void>((resolve, reject) => {
          const build = spawn("docker", ["compose", "build"], {
            cwd: backendPath,
            shell: true,
            env: { ...process.env, HF_TOKEN: hfToken },
          });

          let progress = 15;
          build.stdout?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 9B Build]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress(mainWindow, "9b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.stderr?.on("data", (data) => {
            const line = data.toString();
            debugLog("[FLUX.2 Klein 9B Build stderr]", line);
            progress = Math.min(progress + 1, 80);
            sendFlux2KleinProgress(mainWindow, "9b", { stage: "building", progress, message: line.trim().slice(0, 100) });
          });

          build.on("close", (code) => {
            if (code === 0) {
              resolve();
            } else {
              reject(new Error(`Docker build failed with code ${code}`));
            }
          });

          build.on("error", reject);
        });
      }

      sendFlux2KleinProgress(mainWindow, "9b", { stage: "starting", progress: 85, message: "Starting FLUX.2 Klein 9B containers..." });
      await dockerComposeExec("up -d", { cwd: backendPath, env: { HF_TOKEN: hfToken } });

      let attempts = 0;
      while (attempts < 60) {
        try {
          const response = await net.fetch(`http://localhost:${FLUX2_KLEIN_9B_CONFIG.apiPort}/health`);
          if (response.ok) {
            sendFlux2KleinProgress(mainWindow, "9b", { stage: "complete", progress: 100, message: "FLUX.2 Klein 9B is ready!" });
            return { success: true, backendPath };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendFlux2KleinProgress(mainWindow, "9b", {
          stage: "starting",
          progress: 85 + Math.floor(attempts * 0.25),
          message: `Waiting for API to be ready... (${attempts}/60)`
        });
      }

      throw new Error("API health check timed out. The containers may still be starting up.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendFlux2KleinProgress(mainWindow, "9b", { stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });
}
