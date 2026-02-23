/**
 * Shared Docker/ComfyUI helper functions used by both ipc-comfyui-handlers.ts
 * and ipc-flux2-handlers.ts.
 */
import * as path from "path";
import * as fs from "fs";
import * as https from "https";
import { exec } from "child_process";
import { debugLog, debugError } from "./debug-logger";

// ---------------------------------------------------------------------------
// ComfyUI model definitions
// ---------------------------------------------------------------------------

export const COMFYUI_MODELS = {
  checkpoint: {
    name: "z-image-turbo-fp8-aio.safetensors",
    url: "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors",
    path: "ComfyUI/models/checkpoints/",
  },
  lora: {
    name: "z-image-detailer.safetensors",
    url: "https://huggingface.co/styly-agents/z-image-detailer/resolve/main/z-image-detailer.safetensors",
    path: "ComfyUI/models/loras/",
  },
};

// ---------------------------------------------------------------------------
// FLUX.2 Klein configs
// ---------------------------------------------------------------------------

export const FLUX2_KLEIN_4B_CONFIG = {
  name: "flux2-klein-4b",
  displayName: "FLUX.2 Klein 4B",
  imageName: "flux2-klein-4b-api",
  containerName: "flux2-klein-4b-api",
  comfyContainerName: "flux2-klein-4b-comfy",
  apiPort: 5051,
  comfyPort: 8084,
  backendFolder: "flux2-klein-4b",
};

export const FLUX2_KLEIN_9B_CONFIG = {
  name: "flux2-klein-9b",
  displayName: "FLUX.2 Klein 9B",
  imageName: "flux2-klein-9b-api",
  containerName: "flux2-klein-9b-api",
  comfyContainerName: "flux2-klein-9b-comfy",
  apiPort: 5052,
  comfyPort: 8085,
  backendFolder: "flux2-klein-9b",
};

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

export function getComfyUIBackendPath(isDev: boolean, userDataPath: string): string {
  if (isDev) {
    return path.join(process.cwd(), "comfyui_backend");
  } else {
    return path.join(userDataPath, "comfyui_backend");
  }
}

export function getFlux2KleinBackendPath(variant: "4b" | "9b", isDev: boolean, userDataPath: string): string {
  const config = variant === "4b" ? FLUX2_KLEIN_4B_CONFIG : FLUX2_KLEIN_9B_CONFIG;
  return path.join(getComfyUIBackendPath(isDev, userDataPath), config.backendFolder);
}

function getBundledComfyUIPath(): string {
  return path.join(process.resourcesPath, "comfyui_backend");
}

function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

export async function ensureComfyUIBackend(isDev: boolean, userDataPath: string): Promise<string> {
  const backendPath = getComfyUIBackendPath(isDev, userDataPath);

  if (isDev) {
    return backendPath;
  }

  const dockerComposePath = findDockerComposeFile(backendPath);
  if (!dockerComposePath) {
    const bundledPath = getBundledComfyUIPath();
    if (fs.existsSync(bundledPath)) {
      debugLog("[ComfyUI] Copying backend from bundled resources to user data...");
      copyDirSync(bundledPath, backendPath);
      debugLog("[ComfyUI] Backend copied to:", backendPath);
    } else {
      throw new Error("ComfyUI backend not found in bundled resources");
    }
  }

  fs.mkdirSync(path.join(backendPath, "ComfyUI", "models", "checkpoints"), { recursive: true });
  fs.mkdirSync(path.join(backendPath, "ComfyUI", "models", "loras"), { recursive: true });
  fs.mkdirSync(path.join(backendPath, "output"), { recursive: true });
  fs.mkdirSync(path.join(backendPath, "inputs"), { recursive: true });

  return backendPath;
}

export function execPromise(command: string, options?: { cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { ...options, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" }, (error: Error | null, stdout: string, stderr: string) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

export function findDockerComposeFile(dir: string): string | null {
  const ymlPath = path.join(dir, "docker-compose.yml");
  const yamlPath = path.join(dir, "docker-compose.yaml");
  if (fs.existsSync(ymlPath)) return ymlPath;
  if (fs.existsSync(yamlPath)) return yamlPath;
  return null;
}

export async function dockerComposeExec(args: string, options?: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<string> {
  const workDir = options?.cwd;
  const envVars = options?.env ? { ...process.env, ...options.env } : process.env;

  debugLog(`[ComfyUI] Running docker compose command: ${args} in ${workDir || "default"}`);

  if (workDir) {
    const composeFile = findDockerComposeFile(workDir);
    if (!composeFile) {
      throw new Error(`docker-compose.yml/yaml not found in ${workDir}`);
    }
    debugLog(`[ComfyUI] Found docker-compose file at ${composeFile}`);
  }

  try {
    const cmd = `docker compose ${args}`;
    debugLog(`[ComfyUI] Executing: ${cmd}`);
    return await new Promise((resolve, reject) => {
      exec(cmd, { cwd: workDir, env: envVars, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" }, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
        } else {
          resolve(stdout);
        }
      });
    });
  } catch (e1) {
    const err1 = e1 instanceof Error ? e1.message : String(e1);
    debugLog(`[ComfyUI] docker compose failed: ${err1}`);

    try {
      const cmd = `docker-compose ${args}`;
      debugLog(`[ComfyUI] Fallback executing: ${cmd}`);
      return await new Promise((resolve, reject) => {
        exec(cmd, { cwd: workDir, env: envVars, shell: process.platform === "win32" ? "cmd.exe" : "/bin/sh" }, (error, stdout, stderr) => {
          if (error) {
            reject(new Error(stderr || error.message));
          } else {
            resolve(stdout);
          }
        });
      });
    } catch (e2) {
      const err2 = e2 instanceof Error ? e2.message : String(e2);
      debugError(`[ComfyUI] docker-compose also failed: ${err2}`);
      throw new Error(`Docker compose failed: ${err1}`);
    }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function downloadFileWithProgress(
  url: string,
  destPath: string,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);

    const request = https.get(url, { headers: { "User-Agent": "STYLY-Agent" } }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          downloadFileWithProgress(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
          return;
        }
      }

      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;

      response.on("data", (chunk: Buffer) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const percent = Math.floor((downloadedSize / totalSize) * 100);
          onProgress(percent);
        }
      });

      response.pipe(file);

      file.on("finish", () => {
        file.close();
        resolve();
      });
    });

    request.on("error", (error) => {
      fs.unlink(destPath, () => { });
      reject(error);
    });
  });
}

export function getHuggingFaceToken(isDev: boolean, dataDir: string): string | undefined {
  try {
    const devSettingsPath = path.join(process.cwd(), ".local-data", "settings.json");
    const prodSettingsPath = path.join(dataDir, "settings.json");

    const settingsPath = isDev && fs.existsSync(devSettingsPath) ? devSettingsPath : prodSettingsPath;

    if (fs.existsSync(settingsPath)) {
      const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
      debugLog(`[FLUX.2 Klein] Read HF token from ${settingsPath}: ${settings.huggingFaceToken ? "present" : "missing"}`);
      return settings.huggingFaceToken;
    }
    debugLog(`[FLUX.2 Klein] Settings file not found at ${settingsPath}`);
  } catch (error) {
    debugError("[FLUX.2 Klein] Failed to read HF token from settings:", error);
  }
  return undefined;
}
