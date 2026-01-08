I'll analyze the existing codebase to understand how local models are installed, how tools are registered, and how to architect this integration. Let me explore the relevant files.

Let me now examine the key files more closely - the tool registry, settings page, and providers:

Now let me explore the settings page more to understand the full local embedding model installation pattern:

Let me examine the electron preload and types to understand the model download/install pattern:

Now I have a comprehensive understanding of the codebase. Let me compile a detailed implementation plan for integrating Z-Image ComfyUI as a local tool with automatic installation.

---

# Z-Image ComfyUI Backend Integration Plan
## Local Tool with Automatic Installer

---

## Executive Summary

This document provides a comprehensive plan to integrate the Z-Image ComfyUI backend as a **local AI image generation tool** within the existing application architecture. The integration follows the established pattern used for local embedding models, providing:

1. **Settings UI** - Installation toggle, Docker status, model download progress
2. **Automatic Installer** - Docker build/run via Electron IPC
3. **Tool Registration** - Z-Image as a selectable image generation provider
4. **Provider Abstraction** - Seamless switching between cloud (OpenRouter) and local (ComfyUI)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Settings Page                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Image Generation Provider                                          │    │
│  │  ○ OpenRouter (Cloud)  ● Local ComfyUI (Z-Image Turbo FP8)         │    │
│  │                                                                      │    │
│  │  [Install Z-Image Backend]  Status: ● Running                       │    │
│  │  ├── Docker Image: ✓ Built                                         │    │
│  │  ├── Models: ✓ Downloaded (12.4GB)                                 │    │
│  │  └── API Health: ✓ http://localhost:8000                           │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Electron Main Process                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  comfyui IPC Handlers                                               │    │
│  │  ├── comfyui:checkStatus    → Docker container status               │    │
│  │  ├── comfyui:install        → docker-compose build + up             │    │
│  │  ├── comfyui:start          → docker-compose up -d                  │    │
│  │  ├── comfyui:stop           → docker-compose down                   │    │
│  │  ├── comfyui:downloadModels → wget models from HuggingFace          │    │
│  │  └── comfyui:onProgress     → Stream build/download progress        │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Tool Registry                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  generateImageZImage                                                │    │
│  │  ├── category: "image-generation"                                   │    │
│  │  ├── enableEnvVar: "COMFYUI_LOCAL_ENABLED"                         │    │
│  │  ├── provider: "local"                                             │    │
│  │  └── endpoint: "http://localhost:8000/generate"                    │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ComfyUI Docker Container                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │  Z-Image Turbo FP8 Workflow                                         │    │
│  │  ├── Port 8000: FastAPI (workflow-api)                             │    │
│  │  ├── Port 8188: ComfyUI WebSocket                                  │    │
│  │  └── Models: z-image-turbo-fp8-aio.safetensors + detailer LoRA     │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. File Structure (New & Modified Files)

### New Files to Create

```
lib/
├── ai/
│   ├── providers/
│   │   └── comfyui-provider.ts          # ComfyUI local provider
│   └── tools/
│       └── zimage-generate-tool.ts      # Z-Image generation tool
├── comfyui/
│   ├── client.ts                        # HTTP client for ComfyUI API
│   ├── types.ts                         # TypeScript types
│   ├── health.ts                        # Health check utilities
│   └── installer.ts                     # Installation orchestration
│
electron/
├── handlers/
│   └── comfyui-handlers.ts              # IPC handlers for Docker/install
│
app/
├── api/
│   └── comfyui/
│       ├── status/route.ts              # GET /api/comfyui/status
│       ├── install/route.ts             # POST /api/comfyui/install
│       └── generate/route.ts            # POST /api/comfyui/generate
│
components/
└── settings/
    └── ComfyUIInstaller.tsx             # Settings UI component
```

### Modified Files

```
lib/ai/tool-registry/tool-definitions.ts  # Add Z-Image tool registration
lib/ai/providers.ts                       # Add image provider abstraction
lib/settings/settings-manager.ts          # Add ComfyUI settings schema
electron/preload.ts                       # Add comfyui IPC channels
electron/main.ts                          # Register comfyui handlers
app/settings/page.tsx                     # Add ComfyUI installer section
types/electron.d.ts                       # Add ComfyUI API types
```

---

## 3. Implementation Details

### 3.1 Settings Schema Extension

**File: `lib/settings/settings-manager.ts`**

Add new settings fields:

```typescript
// Add to SettingsSchema interface
interface SettingsSchema {
  // ... existing fields ...
  
  // Image Generation Provider
  imageGenerationProvider: "openrouter" | "local-comfyui";
  
  // ComfyUI Local Backend Settings
  comfyuiEnabled: boolean;
  comfyuiInstalled: boolean;
  comfyuiAutoStart: boolean;
  comfyuiPort: number;  // Default: 8000
  comfyuiModelsDownloaded: boolean;
  comfyuiBackendPath: string;  // Path to comfyui_backend folder
  comfyuiWorkflow: "z-image-turbo-fp8" | "instructdesign-flow";
}

// Default values
const DEFAULT_SETTINGS: Partial<SettingsSchema> = {
  // ... existing defaults ...
  imageGenerationProvider: "openrouter",
  comfyuiEnabled: false,
  comfyuiInstalled: false,
  comfyuiAutoStart: false,
  comfyuiPort: 8000,
  comfyuiModelsDownloaded: false,
  comfyuiBackendPath: "",
  comfyuiWorkflow: "z-image-turbo-fp8",
};
```

---

### 3.2 Electron IPC Handlers

**File: `electron/handlers/comfyui-handlers.ts`**

```typescript
import { ipcMain, BrowserWindow } from "electron";
import { spawn, exec } from "child_process";
import { existsSync } from "fs";
import path from "path";
import https from "https";
import fs from "fs";

interface ComfyUIStatus {
  dockerInstalled: boolean;
  imageBuilt: boolean;
  containerRunning: boolean;
  apiHealthy: boolean;
  modelsDownloaded: boolean;
  checkpointExists: boolean;
  loraExists: boolean;
}

interface InstallProgress {
  stage: "checking" | "building" | "downloading-models" | "starting" | "complete" | "error";
  progress: number;  // 0-100
  message: string;
  error?: string;
}

// Model download URLs
const MODELS = {
  checkpoint: {
    name: "z-image-turbo-fp8-aio.safetensors",
    url: "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-turbo-fp8-aio.safetensors",
    path: "models/checkpoints/",
    size: "~11GB",
  },
  lora: {
    name: "z-image-detailer.safetensors",
    url: "https://huggingface.co/SeeSee21/Z-Image-Turbo-AIO/resolve/main/z-image-detailer.safetensors",
    path: "models/loras/",
    size: "~1.2GB",
  },
};

export function registerComfyUIHandlers(mainWindow: BrowserWindow): void {
  
  // Check overall status
  ipcMain.handle("comfyui:checkStatus", async (_event, backendPath: string): Promise<ComfyUIStatus> => {
    const status: ComfyUIStatus = {
      dockerInstalled: false,
      imageBuilt: false,
      containerRunning: false,
      apiHealthy: false,
      modelsDownloaded: false,
      checkpointExists: false,
      loraExists: false,
    };

    try {
      // Check Docker installed
      await execPromise("docker --version");
      status.dockerInstalled = true;

      // Check if image exists
      const images = await execPromise("docker images z-image-turbo-fp8 --format '{{.Repository}}'");
      status.imageBuilt = images.trim().includes("z-image-turbo-fp8");

      // Check if container is running
      const containers = await execPromise("docker ps --filter 'name=comfyui-z-image' --format '{{.Names}}'");
      status.containerRunning = containers.trim().includes("comfyui-z-image");

      // Check API health
      if (status.containerRunning) {
        try {
          const response = await fetch("http://localhost:8000/health");
          status.apiHealthy = response.ok;
        } catch {
          status.apiHealthy = false;
        }
      }

      // Check models exist
      if (backendPath) {
        const checkpointPath = path.join(backendPath, MODELS.checkpoint.path, MODELS.checkpoint.name);
        const loraPath = path.join(backendPath, MODELS.lora.path, MODELS.lora.name);
        status.checkpointExists = existsSync(checkpointPath);
        status.loraExists = existsSync(loraPath);
        status.modelsDownloaded = status.checkpointExists && status.loraExists;
      }
    } catch (error) {
      console.error("[ComfyUI] Status check error:", error);
    }

    return status;
  });

  // Install (build Docker image)
  ipcMain.handle("comfyui:install", async (_event, backendPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      sendProgress({ stage: "building", progress: 10, message: "Building Docker image..." });

      const dockerComposePath = path.join(backendPath, "docker-compose.yml");
      if (!existsSync(dockerComposePath)) {
        throw new Error(`docker-compose.yml not found at ${dockerComposePath}`);
      }

      // Build with docker-compose
      await new Promise<void>((resolve, reject) => {
        const build = spawn("docker-compose", ["build", "--no-cache"], {
          cwd: backendPath,
          shell: true,
        });

        let progress = 10;
        build.stdout.on("data", (data) => {
          const line = data.toString();
          console.log("[ComfyUI Build]", line);
          progress = Math.min(progress + 2, 80);
          sendProgress({ stage: "building", progress, message: line.trim().slice(0, 100) });
        });

        build.stderr.on("data", (data) => {
          console.error("[ComfyUI Build Error]", data.toString());
        });

        build.on("close", (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`Docker build failed with code ${code}`));
          }
        });
      });

      sendProgress({ stage: "complete", progress: 100, message: "Docker image built successfully!" });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendProgress({ stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // Download models
  ipcMain.handle("comfyui:downloadModels", async (_event, backendPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      sendProgress({ stage: "downloading-models", progress: 0, message: "Preparing to download models..." });

      // Create directories
      const checkpointDir = path.join(backendPath, MODELS.checkpoint.path);
      const loraDir = path.join(backendPath, MODELS.lora.path);
      fs.mkdirSync(checkpointDir, { recursive: true });
      fs.mkdirSync(loraDir, { recursive: true });

      // Download checkpoint (~11GB)
      sendProgress({ stage: "downloading-models", progress: 5, message: `Downloading ${MODELS.checkpoint.name} (${MODELS.checkpoint.size})...` });
      await downloadFile(
        MODELS.checkpoint.url,
        path.join(checkpointDir, MODELS.checkpoint.name),
        (progress) => {
          sendProgress({ 
            stage: "downloading-models", 
            progress: 5 + Math.floor(progress * 0.7),  // 5-75%
            message: `Downloading checkpoint: ${progress}%` 
          });
        }
      );

      // Download LoRA (~1.2GB)
      sendProgress({ stage: "downloading-models", progress: 80, message: `Downloading ${MODELS.lora.name} (${MODELS.lora.size})...` });
      await downloadFile(
        MODELS.lora.url,
        path.join(loraDir, MODELS.lora.name),
        (progress) => {
          sendProgress({ 
            stage: "downloading-models", 
            progress: 80 + Math.floor(progress * 0.2),  // 80-100%
            message: `Downloading LoRA: ${progress}%` 
          });
        }
      );

      sendProgress({ stage: "complete", progress: 100, message: "Models downloaded successfully!" });
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      sendProgress({ stage: "error", progress: 0, message: errorMessage, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // Start container
  ipcMain.handle("comfyui:start", async (_event, backendPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      sendProgress({ stage: "starting", progress: 50, message: "Starting ComfyUI container..." });
      
      await execPromise("docker-compose up -d", { cwd: backendPath });
      
      // Wait for health check
      let attempts = 0;
      while (attempts < 30) {
        try {
          const response = await fetch("http://localhost:8000/health");
          if (response.ok) {
            sendProgress({ stage: "complete", progress: 100, message: "ComfyUI is running!" });
            return { success: true };
          }
        } catch {
          // Not ready yet
        }
        await sleep(2000);
        attempts++;
        sendProgress({ stage: "starting", progress: 50 + attempts, message: `Waiting for API... (${attempts}/30)` });
      }

      throw new Error("API health check timed out after 60 seconds");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: errorMessage };
    }
  });

  // Stop container
  ipcMain.handle("comfyui:stop", async (_event, backendPath: string): Promise<{ success: boolean; error?: string }> => {
    try {
      await execPromise("docker-compose down", { cwd: backendPath });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Unknown error" };
    }
  });

  // Helper to send progress to renderer
  function sendProgress(progress: InstallProgress): void {
    mainWindow.webContents.send("comfyui:installProgress", progress);
  }
}

// Utility functions
function execPromise(command: string, options?: { cwd?: string }): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout);
      }
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function downloadFile(url: string, destPath: string, onProgress: (percent: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    
    https.get(url, { headers: { "User-Agent": "STYLY-Agent" } }, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          fs.unlinkSync(destPath);
          return downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
        }
      }

      const totalSize = parseInt(response.headers["content-length"] || "0", 10);
      let downloadedSize = 0;

      response.on("data", (chunk) => {
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
    }).on("error", (error) => {
      fs.unlink(destPath, () => {});
      reject(error);
    });
  });
}
```

---

### 3.3 Electron Preload Extension

**File: `electron/preload.ts`** (additions)

```typescript
// Add to electronAPI object (around line 98):

// ComfyUI local backend operations
comfyui: {
  checkStatus: (backendPath: string): Promise<{
    dockerInstalled: boolean;
    imageBuilt: boolean;
    containerRunning: boolean;
    apiHealthy: boolean;
    modelsDownloaded: boolean;
    checkpointExists: boolean;
    loraExists: boolean;
  }> => {
    return ipcRenderer.invoke("comfyui:checkStatus", backendPath);
  },
  install: (backendPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("comfyui:install", backendPath);
  },
  downloadModels: (backendPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("comfyui:downloadModels", backendPath);
  },
  start: (backendPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("comfyui:start", backendPath);
  },
  stop: (backendPath: string): Promise<{ success: boolean; error?: string }> => {
    return ipcRenderer.invoke("comfyui:stop", backendPath);
  },
  onInstallProgress: (callback: (data: {
    stage: string;
    progress: number;
    message: string;
    error?: string;
  }) => void): void => {
    ipcRenderer.on("comfyui:installProgress", (_event, data) => callback(data));
  },
  removeProgressListener: (): void => {
    ipcRenderer.removeAllListeners("comfyui:installProgress");
  },
},

// Add to validChannels arrays:
// In ipc.invoke validChannels (around line 164):
"comfyui:checkStatus",
"comfyui:install",
"comfyui:downloadModels",
"comfyui:start",
"comfyui:stop",

// In ipc.on validChannels (around line 190):
"comfyui:installProgress",
```

---

### 3.4 Z-Image Generation Tool

**File: `lib/ai/tools/zimage-generate-tool.ts`**

```typescript
import { tool, jsonSchema } from "ai";
import { createImage, createToolRun, updateToolRun } from "@/lib/db/queries";

interface ZImageGenerateInput {
  prompt: string;
  seed?: number;
  width?: number;
  height?: number;
  steps?: number;
  cfg?: number;
  lora_strength?: number;
}

interface ZImageGenerateOutput {
  status: "success" | "error";
  imageUrl?: string;
  seed?: number;
  error?: string;
}

export function createZImageGenerateTool(sessionId: string) {
  return tool({
    description: `Generate images using local Z-Image Turbo FP8 model via ComfyUI.
    
This is a fast, high-quality text-to-image model running locally. 
Optimized for 9 steps with CFG 1.0.

### Parameters
- **prompt** (required): Text description of the image to generate
- **seed** (optional): Random seed for reproducibility (-1 for random)
- **width/height** (optional): Image dimensions (default: 1024x1024)
- **steps** (optional): Sampling steps (default: 9, optimized for Z-Image)
- **cfg** (optional): CFG scale (default: 1.0)
- **lora_strength** (optional): Z-Image Detailer LoRA strength (default: 0.5)`,

    inputSchema: jsonSchema<ZImageGenerateInput>({
      type: "object",
      title: "ZImageGenerateInput",
      description: "Input for Z-Image Turbo FP8 generation",
      properties: {
        prompt: {
          type: "string",
          description: "Text prompt describing the image to generate",
        },
        seed: {
          type: "number",
          description: "Random seed (-1 for random)",
        },
        width: {
          type: "number",
          description: "Image width (512-2048)",
          minimum: 512,
          maximum: 2048,
        },
        height: {
          type: "number",
          description: "Image height (512-2048)",
          minimum: 512,
          maximum: 2048,
        },
        steps: {
          type: "number",
          description: "Sampling steps (1-50, default: 9)",
          minimum: 1,
          maximum: 50,
        },
        cfg: {
          type: "number",
          description: "CFG scale (0.1-10, default: 1.0)",
        },
        lora_strength: {
          type: "number",
          description: "LoRA strength (0-2, default: 0.5)",
        },
      },
      required: ["prompt"],
    }),

    execute: async (input: ZImageGenerateInput): Promise<ZImageGenerateOutput> => {
      const toolRun = await createToolRun({
        sessionId,
        toolName: "generateImageZImage",
        input: JSON.stringify(input),
        status: "running",
      });

      try {
        // Call local ComfyUI API
        const response = await fetch("http://localhost:8000/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            positive_prompt: input.prompt,
            seed: input.seed ?? -1,
            width: input.width ?? 1024,
            height: input.height ?? 1024,
            steps: input.steps ?? 9,
            cfg: input.cfg ?? 1.0,
            lora_strength: input.lora_strength ?? 0.5,
            return_base64: false,
          }),
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.detail || `API error: ${response.status}`);
        }

        const result = await response.json();
        
        // Save image to database
        const imageRecord = await createImage({
          sessionId,
          toolRunId: toolRun.id,
          imageUrl: result.image_url || result.images?.[0]?.url,
          prompt: input.prompt,
          metadata: {
            seed: result.seed,
            model: "z-image-turbo-fp8",
            provider: "local-comfyui",
            ...input,
          },
        });

        await updateToolRun(toolRun.id, {
          status: "completed",
          output: JSON.stringify({ imageUrl: imageRecord.imageUrl, seed: result.seed }),
        });

        return {
          status: "success",
          imageUrl: imageRecord.imageUrl,
          seed: result.seed,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        
        await updateToolRun(toolRun.id, {
          status: "failed",
          error: errorMessage,
        });

        return {
          status: "error",
          error: errorMessage,
        };
      }
    },
  });
}
```

---

### 3.5 Tool Registration

**File: `lib/ai/tool-registry/tool-definitions.ts`** (additions)

Add after the OpenRouter image tools section (~line 1527):

```typescript
// ============================================================================
// LOCAL COMFYUI IMAGE TOOLS
// These tools use the local ComfyUI backend for image generation
// ============================================================================

// Z-Image Turbo FP8 - Local Generation
registry.register(
  "generateImageZImage",
  {
    displayName: "Generate Image (Z-Image Local)",
    category: "image-generation",
    keywords: [
      "generate", "create", "image", "local", "comfyui", "z-image", "turbo", "fp8",
      "text-to-image", "fast", "offline", "private",
    ],
    shortDescription: "Generate images locally using Z-Image Turbo FP8 via ComfyUI",
    fullInstructions: `## Z-Image Turbo FP8 (Local ComfyUI)

Generate high-quality images locally using the Z-Image Turbo FP8 model.

### Advantages
- **Privacy**: Images generated locally, no data sent to cloud
- **Speed**: Optimized for fast generation (9 steps)
- **No API costs**: Uses local GPU
- **Offline capable**: Works without internet

### When to Use
- When privacy is important
- For fast iterations
- When you have a capable GPU
- When OpenRouter is unavailable

### Parameters
- **prompt** (required): Text description of the image
- **seed** (optional): For reproducibility (-1 = random)
- **width/height** (optional): Default 1024x1024
- **steps** (optional): Default 9 (optimized)
- **cfg** (optional): Default 1.0 (optimized)
- **lora_strength** (optional): Detailer LoRA strength (0-2, default 0.5)

### Requirements
- Docker installed and running
- NVIDIA GPU with CUDA support
- ~12GB VRAM recommended
- ComfyUI backend installed via Settings`,
    loading: { deferLoading: true },
    requiresSession: true,
    // Only available when local ComfyUI is enabled
    enableEnvVar: "COMFYUI_LOCAL_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createZImageGenerateTool(sessionId!)
);
```

---
3.6 Settings UI Component (Continued)
File: components/settings/ComfyUIInstaller.tsx

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Loader2Icon, CheckIcon, XIcon, DownloadIcon, 
  PlayIcon, StopCircleIcon, RefreshCwIcon,
  HardDriveIcon, CpuIcon, ServerIcon, FolderOpenIcon
} from "lucide-react";

interface ComfyUIStatus {
  dockerInstalled: boolean;
  imageBuilt: boolean;
  containerRunning: boolean;
  apiHealthy: boolean;
  modelsDownloaded: boolean;
  checkpointExists: boolean;
  loraExists: boolean;
}

interface InstallProgress {
  stage: string;
  progress: number;
  message: string;
  error?: string;
}

interface ComfyUIInstallerProps {
  backendPath: string;
  onBackendPathChange: (path: string) => void;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
}

export function ComfyUIInstaller({
  backendPath,
  onBackendPathChange,
  enabled,
  onEnabledChange,
}: ComfyUIInstallerProps) {
  const [status, setStatus] = useState<ComfyUIStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<InstallProgress | null>(null);
  const [isElectron, setIsElectron] = useState(false);

  // Check if running in Electron
  useEffect(() => {
    if (typeof window !== "undefined" && "electronAPI" in window) {
      setIsElectron(true);
    }
  }, []);

  // Check status on mount and when path changes
  useEffect(() => {
    if (isElectron && backendPath) {
      checkStatus();
    }
  }, [isElectron, backendPath]);

  // Listen for progress updates
  useEffect(() => {
    if (!isElectron) return;

    const electronAPI = (window as any).electronAPI;
    electronAPI.comfyui?.onInstallProgress?.((data: InstallProgress) => {
      setProgress(data);
      if (data.stage === "complete" || data.stage === "error") {
        setLoading(false);
        checkStatus();
      }
    });

    return () => {
      electronAPI.comfyui?.removeProgressListener?.();
    };
  }, [isElectron]);

  async function checkStatus() {
    if (!isElectron || !backendPath) return;
    
    try {
      const electronAPI = (window as any).electronAPI;
      const newStatus = await electronAPI.comfyui.checkStatus(backendPath);
      setStatus(newStatus);
    } catch (error) {
      console.error("Failed to check ComfyUI status:", error);
    }
  }

  async function handleInstall() {
    if (!isElectron || !backendPath) return;
    
    setLoading(true);
    setProgress({ stage: "checking", progress: 0, message: "Starting installation..." });
    
    try {
      const electronAPI = (window as any).electronAPI;
      await electronAPI.comfyui.install(backendPath);
    } catch (error) {
      setProgress({ 
        stage: "error", 
        progress: 0, 
        message: "Installation failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
      setLoading(false);
    }
  }

  async function handleDownloadModels() {
    if (!isElectron || !backendPath) return;
    
    setLoading(true);
    setProgress({ stage: "downloading-models", progress: 0, message: "Starting model download..." });
    
    try {
      const electronAPI = (window as any).electronAPI;
      await electronAPI.comfyui.downloadModels(backendPath);
    } catch (error) {
      setProgress({ 
        stage: "error", 
        progress: 0, 
        message: "Download failed",
        error: error instanceof Error ? error.message : "Unknown error"
      });
      setLoading(false);
    }
  }

  async function handleStart() {
    if (!isElectron || !backendPath) return;
    
    setLoading(true);
    try {
      const electronAPI = (window as any).electronAPI;
      await electronAPI.comfyui.start(backendPath);
      await checkStatus();
    } finally {
      setLoading(false);
    }
  }

  async function handleStop() {
    if (!isElectron || !backendPath) return;
    
    setLoading(true);
    try {
      const electronAPI = (window as any).electronAPI;
      await electronAPI.comfyui.stop(backendPath);
      await checkStatus();
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectFolder() {
    if (!isElectron) return;
    
    const electronAPI = (window as any).electronAPI;
    const result = await electronAPI.dialog?.showOpenDialog?.({
      properties: ["openDirectory"],
      title: "Select ComfyUI Backend Folder",
    });
    
    if (result && !result.canceled && result.filePaths?.[0]) {
      onBackendPathChange(result.filePaths[0]);
    }
  }

  // Status indicator component
  function StatusIndicator({ ok, label }: { ok: boolean; label: string }) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {ok ? (
          <CheckIcon className="h-4 w-4 text-green-500" />
        ) : (
          <XIcon className="h-4 w-4 text-red-500" />
        )}
        <span className={ok ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400"}>
          {label}
        </span>
      </div>
    );
  }

  if (!isElectron) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CpuIcon className="h-5 w-5" />
            Local Image Generation (Z-Image)
          </CardTitle>
          <CardDescription>
            Local ComfyUI backend is only available in the desktop app.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CpuIcon className="h-5 w-5" />
          Local Image Generation (Z-Image Turbo FP8)
        </CardTitle>
        <CardDescription>
          Generate images locally using ComfyUI with the Z-Image Turbo FP8 model.
          Requires Docker and an NVIDIA GPU with ~12GB VRAM.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Local Image Generation</Label>
            <p className="text-sm text-muted-foreground">
              Use local ComfyUI instead of cloud APIs
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={onEnabledChange}
            disabled={!status?.apiHealthy}
          />
        </div>

        {/* Backend Path */}
        <div className="space-y-2">
          <Label>ComfyUI Backend Path</Label>
          <div className="flex gap-2">
            <Input
              value={backendPath}
              onChange={(e) => onBackendPathChange(e.target.value)}
              placeholder="C:\path\to\comfyui_backend"
              className="flex-1"
            />
            <Button variant="outline" onClick={handleSelectFolder}>
              <FolderOpenIcon className="h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={checkStatus} disabled={!backendPath}>
              <RefreshCwIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Status Display */}
        {status && (
          <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
            <StatusIndicator ok={status.dockerInstalled} label="Docker Installed" />
            <StatusIndicator ok={status.imageBuilt} label="Docker Image Built" />
            <StatusIndicator ok={status.modelsDownloaded} label="Models Downloaded" />
            <StatusIndicator ok={status.containerRunning} label="Container Running" />
            <StatusIndicator ok={status.apiHealthy} label="API Healthy" />
            <StatusIndicator 
              ok={status.checkpointExists && status.loraExists} 
              label={`Models: ${status.checkpointExists ? "✓" : "✗"} Checkpoint, ${status.loraExists ? "✓" : "✗"} LoRA`}
            />
          </div>
        )}

        {/* Progress Bar */}
        {progress && loading && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="capitalize">{progress.stage.replace("-", " ")}</span>
              <span>{progress.progress}%</span>
            </div>
            <Progress value={progress.progress} />
            <p className="text-xs text-muted-foreground truncate">{progress.message}</p>
          </div>
        )}

        {/* Error Display */}
        {progress?.error && (
          <Alert variant="destructive">
            <AlertDescription>{progress.error}</AlertDescription>
          </Alert>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2">
          {/* Build Docker Image */}
          {status && !status.imageBuilt && (
            <Button onClick={handleInstall} disabled={loading || !status.dockerInstalled}>
              {loading ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : <HardDriveIcon className="h-4 w-4 mr-2" />}
              Build Docker Image
            </Button>
          )}

          {/* Download Models */}
          {status && !status.modelsDownloaded && (
            <Button onClick={handleDownloadModels} disabled={loading} variant="secondary">
              {loading ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : <DownloadIcon className="h-4 w-4 mr-2" />}
              Download Models (~12GB)
            </Button>
          )}

          {/* Start/Stop Container */}
          {status?.imageBuilt && status?.modelsDownloaded && (
            <>
              {status.containerRunning ? (
                <Button onClick={handleStop} disabled={loading} variant="destructive">
                  {loading ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : <StopCircleIcon className="h-4 w-4 mr-2" />}
                  Stop ComfyUI
                </Button>
              ) : (
                <Button onClick={handleStart} disabled={loading}>
                  {loading ? <Loader2Icon className="h-4 w-4 animate-spin mr-2" /> : <PlayIcon className="h-4 w-4 mr-2" />}
                  Start ComfyUI
                </Button>
              )}
            </>
          )}
        </div>

        {/* Model Info */}
        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Required Models:</strong></p>
          <ul className="list-disc list-inside ml-2">
            <li>z-image-turbo-fp8-aio.safetensors (~11GB) - Main checkpoint</li>
            <li>z-image-detailer.safetensors (~1.2GB) - Detailer LoRA</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
3.7 Integration with Settings Page
File: app/settings/page.tsx (additions)

Add the ComfyUI installer section after the existing embedding model section:

import { ComfyUIInstaller } from "@/components/settings/ComfyUIInstaller";

// Inside the Settings component, add state:
const [comfyuiBackendPath, setComfyuiBackendPath] = useState(
  settings?.comfyuiBackendPath || ""
);
const [comfyuiEnabled, setComfyuiEnabled] = useState(
  settings?.comfyuiEnabled || false
);

// Add handler to save settings:
async function handleComfyUISettingsChange(path: string, enabled: boolean) {
  setComfyuiBackendPath(path);
  setComfyuiEnabled(enabled);
  await updateSettings({
    comfyuiBackendPath: path,
    comfyuiEnabled: enabled,
    imageGenerationProvider: enabled ? "local-comfyui" : "openrouter",
  });
  
  // Set environment variable for tool registry
  if (enabled) {
    process.env.COMFYUI_LOCAL_ENABLED = "true";
  } else {
    delete process.env.COMFYUI_LOCAL_ENABLED;
  }
}

// In the JSX, add after the embedding model section:
<ComfyUIInstaller
  backendPath={comfyuiBackendPath}
  onBackendPathChange={(path) => handleComfyUISettingsChange(path, comfyuiEnabled)}
  enabled={comfyuiEnabled}
  onEnabledChange={(enabled) => handleComfyUISettingsChange(comfyuiBackendPath, enabled)}
/>
4. Provider Abstraction Layer
File: lib/ai/providers/image-provider.ts

import { getSettings } from "@/lib/settings/settings-manager";

export type ImageProvider = "openrouter" | "local-comfyui";

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
}

export interface ImageGenerationResult {
  imageUrl: string;
  seed: number;
  provider: ImageProvider;
  metadata?: Record<string, any>;
}

export async function generateImage(
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  const settings = await getSettings();
  const provider = settings.imageGenerationProvider || "openrouter";

  if (provider === "local-comfyui") {
    return generateWithComfyUI(request);
  } else {
    return generateWithOpenRouter(request);
  }
}

async function generateWithComfyUI(
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  const response = await fetch("http://localhost:8000/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      positive_prompt: request.prompt,
      seed: request.seed ?? -1,
      width: request.width ?? 1024,
      height: request.height ?? 1024,
      steps: request.steps ?? 9,
      cfg: request.cfg ?? 1.0,
    }),
  });

  if (!response.ok) {
    throw new Error(`ComfyUI API error: ${response.status}`);
  }

  const result = await response.json();
  
  return {
    imageUrl: result.image_url || result.images?.[0]?.url,
    seed: result.seed,
    provider: "local-comfyui",
    metadata: {
      model: "z-image-turbo-fp8",
      steps: request.steps ?? 9,
    },
  };
}

async function generateWithOpenRouter(
  request: ImageGenerationRequest
): Promise<ImageGenerationResult> {
  // Existing OpenRouter implementation
  // ... (keep existing code)
}
5. Implementation Phases
Phase 1: Core Infrastructure (Week 1)
Task	Priority	Effort
Create electron/handlers/comfyui-handlers.ts	🔴 Critical	4h
Update electron/preload.ts with IPC channels	🔴 Critical	1h
Update electron/main.ts to register handlers	🔴 Critical	0.5h
Create types/electron.d.ts additions	🔴 Critical	1h
Phase 2: Settings UI (Week 1-2)
Task	Priority	Effort
Create ComfyUIInstaller.tsx component	🔴 Critical	4h
Update settings-manager.ts schema	🟡 Medium	1h
Integrate into app/settings/page.tsx	🔴 Critical	2h
Add folder picker dialog	🟡 Medium	1h
Phase 3: Tool Registration (Week 2)
Task	Priority	Effort
Create zimage-generate-tool.ts	🔴 Critical	3h
Update tool-definitions.ts	🔴 Critical	1h
Create image-provider.ts abstraction	🟡 Medium	2h
Phase 4: Testing & Polish (Week 2-3)
Task	Priority	Effort
End-to-end installation testing	🔴 Critical	4h
Model download progress testing	🟡 Medium	2h
Error handling & edge cases	🟡 Medium	3h
Documentation updates	🟢 Low	2h
6. Future Expansion: Additional Local Tools
This architecture supports adding more local tools:

// Future tool registrations following the same pattern:

// Video Generation (Local)
registry.register("generateVideoLocal", {
  displayName: "Generate Video (Local)",
  category: "video-generation",
  enableEnvVar: "COMFYUI_VIDEO_ENABLED",
  // ...
});

// Image-to-Image (Local)
registry.register("imageToImageLocal", {
  displayName: "Image to Image (Local)",
  category: "image-editing",
  enableEnvVar: "COMFYUI_LOCAL_ENABLED",
  // ...
});

// Upscaling (Local)
registry.register("upscaleImageLocal", {
  displayName: "Upscale Image (Local)",
  category: "image-editing",
  enableEnvVar: "COMFYUI_UPSCALE_ENABLED",
  // ...
});
7. Summary
This implementation plan provides:

Complete IPC Handler System - Docker management, model downloads, health checks
Settings UI Component - Visual installer with progress tracking
Tool Registration - Z-Image as a selectable generation tool
Provider Abstraction - Seamless switching between cloud and local
Extensible Architecture - Easy to add more local tools in the future
The pattern mirrors the existing local embedding model installation flow, providing a consistent user experience while enabling powerful local AI capabilities.