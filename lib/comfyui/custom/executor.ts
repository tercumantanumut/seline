import path from "path";
import { saveFile } from "@/lib/storage/local-storage";
import { convertWorkflowToApi } from "./converter";
import {
  fetchMediaBuffer,
  fetchOutputFile,
  resolveCustomComfyUIBaseUrl,
  submitPrompt,
  uploadInputFile,
  waitForHistory,
} from "./client";
import type { CustomComfyUIInput, CustomComfyUIWorkflow } from "./types";

type ComfyUIOutputFile = {
  filename?: string;
  subfolder?: string;
  type?: string;
};

type ExecutionResult = {
  status: "completed" | "error";
  images?: Array<{ url: string }>;
  videos?: Array<{ url: string }>;
  promptId?: string;
  error?: string;
};

function cloneWorkflow(workflow: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(workflow)) as Record<string, unknown>;
}

function isMediaType(input: CustomComfyUIInput): boolean {
  return ["image", "mask", "video", "file"].includes(input.type);
}

function guessFilename(source: string, fallback: string): string {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:(image|video|application)\/(\w+);/);
    if (match) {
      return `${fallback}.${match[2]}`;
    }
    return `${fallback}.bin`;
  }
  try {
    const url = new URL(source);
    const ext = path.extname(url.pathname);
    if (ext) return `${fallback}${ext}`;
  } catch {
    // Ignore invalid URL.
  }
  return `${fallback}.bin`;
}

function classifyOutput(filename: string): "image" | "video" | "file" {
  const ext = path.extname(filename).toLowerCase();
  if ([".mp4", ".webm", ".mov", ".gif"].includes(ext)) return "video";
  if ([".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(ext)) return "image";
  return "file";
}

async function applyInputValue(
  apiWorkflow: Record<string, unknown>,
  input: CustomComfyUIInput,
  value: unknown,
  baseUrl: string
): Promise<void> {
  const node = apiWorkflow[input.nodeId] as { inputs?: Record<string, unknown> } | undefined;
  if (!node || typeof node !== "object") {
    throw new Error(`Workflow node not found: ${input.nodeId}`);
  }
  if (!node.inputs) node.inputs = {};

  if (!isMediaType(input)) {
    node.inputs[input.inputField] = value;
    return;
  }

  const values = Array.isArray(value) ? value : [value];
  const uploaded: string[] = [];

  for (let i = 0; i < values.length; i += 1) {
    const entry = values[i];
    if (typeof entry !== "string" || entry.length === 0) {
      continue;
    }
    const buffer = await fetchMediaBuffer(entry);
    const filename = guessFilename(entry, `input_${input.inputField}_${i}`);
    const uploadType = input.type === "mask" ? "mask" : "input";
    const uploadedFile = await uploadInputFile(baseUrl, {
      buffer,
      filename,
      type: uploadType,
    });
    uploaded.push(uploadedFile.name);
  }

  if (input.multiple || Array.isArray(value)) {
    node.inputs[input.inputField] = uploaded;
  } else {
    node.inputs[input.inputField] = uploaded[0];
  }
}

function collectOutputs(
  historyEntry: Record<string, unknown>,
  allowedNodeIds?: Set<string>
): ComfyUIOutputFile[] {
  const outputs = historyEntry.outputs as Record<string, unknown> | undefined;
  if (!outputs) return [];

  const collected: ComfyUIOutputFile[] = [];
  for (const [nodeId, nodeOutput] of Object.entries(outputs)) {
    if (allowedNodeIds && !allowedNodeIds.has(nodeId)) continue;
    const output = nodeOutput as Record<string, unknown>;
    const buckets = ["images", "gifs", "videos"];
    for (const bucket of buckets) {
      const items = output[bucket] as unknown;
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (typeof item === "object" && item) {
          const file = item as ComfyUIOutputFile;
          if (file.filename) {
            collected.push(file);
          }
        }
      }
    }
  }
  return collected;
}

export async function executeCustomComfyUIWorkflow(params: {
  workflow: CustomComfyUIWorkflow;
  input: Record<string, unknown>;
  sessionId?: string;
}): Promise<ExecutionResult> {
  const { workflow, input, sessionId } = params;
  const { baseUrl } = await resolveCustomComfyUIBaseUrl({
    comfyuiBaseUrl: workflow.comfyuiBaseUrl,
    comfyuiHost: workflow.comfyuiHost,
    comfyuiPort: workflow.comfyuiPort,
  });

  const apiWorkflow = convertWorkflowToApi(
    workflow.workflow,
    workflow.format
  );
  const injected = cloneWorkflow(apiWorkflow);

  for (const inputDef of workflow.inputs) {
    const provided = input[inputDef.name];
    const value = provided !== undefined ? provided : inputDef.default;
    if (value === undefined || value === null) {
      if (inputDef.required) {
        throw new Error(`Missing required input: ${inputDef.name}`);
      }
      continue;
    }
    await applyInputValue(injected, inputDef, value, baseUrl);
  }

  const promptId = await submitPrompt(baseUrl, injected);
  const history = await waitForHistory(baseUrl, promptId, {
    timeoutMs: (workflow.timeoutSeconds || 300) * 1000,
  });
  const entry = history[promptId] as Record<string, unknown> | undefined;
  if (!entry) {
    throw new Error("ComfyUI did not return history for prompt.");
  }

  const allowedNodes = workflow.outputs?.length
    ? new Set(workflow.outputs.map((output) => output.nodeId))
    : undefined;
  const outputFiles = collectOutputs(entry, allowedNodes);

  const images: Array<{ url: string }> = [];
  const videos: Array<{ url: string }> = [];

  for (const file of outputFiles) {
    if (!file.filename) continue;
    const fileType = classifyOutput(file.filename);
    const buffer = await fetchOutputFile(baseUrl, {
      filename: file.filename,
      subfolder: file.subfolder,
      type: file.type || "output",
    });

    if (sessionId) {
      const saved = await saveFile(buffer, sessionId, file.filename, "generated");
      if (fileType === "video") {
        videos.push({ url: saved.url });
      } else if (fileType === "image") {
        images.push({ url: saved.url });
      }
    } else {
      const query = new URLSearchParams();
      query.set("filename", file.filename);
      if (file.subfolder) query.set("subfolder", file.subfolder);
      if (file.type) query.set("type", file.type);
      const remoteUrl = `${baseUrl}/view?${query.toString()}`;
      if (fileType === "video") {
        videos.push({ url: remoteUrl });
      } else if (fileType === "image") {
        images.push({ url: remoteUrl });
      }
    }
  }

  return {
    status: "completed",
    images: images.length > 0 ? images : undefined,
    videos: videos.length > 0 ? videos : undefined,
    promptId,
  };
}
