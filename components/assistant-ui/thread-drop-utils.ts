import type { CustomComfyUIInput, CustomComfyUIOutput } from "@/lib/comfyui/custom/types";

export interface DroppedImportFile {
  file: File;
  relativePath: string;
}

export interface VoiceUiSettings {
  ttsEnabled: boolean;
  sttEnabled: boolean;
}

export interface ComfyWorkflowImportPreview {
  fileName: string;
  suggestedName: string;
  nodeCount: number;
  inputCount: number;
  outputCount: number;
  inputs: CustomComfyUIInput[];
  outputs: CustomComfyUIOutput[];
  summary: string;
  importantInputIds: string[];
  warnings?: string[];
  error?: string;
}

export interface ComfyWorkflowImportResult {
  success: boolean;
  createdWorkflows: Array<{
    id: string;
    name: string;
    toolId: string;
    fileName: string;
    inputCount: number;
    outputCount: number;
  }>;
  failedFiles: Array<{
    fileName: string;
    error: string;
  }>;
  enabledToolCount: number;
  discoveredToolCount: number;
}

export type WebkitDataTransferItem = DataTransferItem & {
  webkitGetAsEntry?: () => FileSystemEntry | null;
};

export function readEntryFile(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    entry.file(resolve, reject);
  });
}

export function readDirectoryBatch(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    reader.readEntries(resolve, reject);
  });
}

export async function collectDroppedImportFiles(event: React.DragEvent): Promise<DroppedImportFile[]> {
  const dataTransferItems = Array.from(event.dataTransfer.items || []) as WebkitDataTransferItem[];
  const entries = dataTransferItems
    .map((item) => item.webkitGetAsEntry?.())
    .filter((entry): entry is FileSystemEntry => entry != null);

  if (entries.length === 0) {
    return Array.from(event.dataTransfer.files).map((file) => ({
      file,
      relativePath: file.name,
    }));
  }

  const droppedFiles: DroppedImportFile[] = [];

  const walkEntry = async (entry: FileSystemEntry, prefix = ""): Promise<void> => {
    if (entry.isFile) {
      const fileEntry = entry as FileSystemFileEntry;
      const file = await readEntryFile(fileEntry);
      droppedFiles.push({
        file,
        relativePath: `${prefix}${entry.name}`,
      });
      return;
    }

    const directoryEntry = entry as FileSystemDirectoryEntry;
    const reader = directoryEntry.createReader();

    while (true) {
      const batch = await readDirectoryBatch(reader);
      if (batch.length === 0) break;
      await Promise.all(batch.map((child) => walkEntry(child, `${prefix}${entry.name}/`)));
    }
  };

  for (const entry of entries) {
    await walkEntry(entry);
  }

  if (droppedFiles.length > 0) {
    return droppedFiles;
  }

  return Array.from(event.dataTransfer.files).map((file) => ({
    file,
    relativePath: file.name,
  }));
}

export function isDirectPluginFile(relativePath: string): boolean {
  const lower = relativePath.toLowerCase();
  return lower.endsWith(".zip") || lower.endsWith(".md") || lower.endsWith(".mds");
}

export function isPluginStructureFile(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  return (
    normalized.includes("/.claude-plugin/plugin.json") ||
    normalized.endsWith(".claude-plugin/plugin.json") ||
    normalized.includes("/commands/") ||
    normalized.startsWith("commands/") ||
    normalized.includes("/skills/") ||
    normalized.startsWith("skills/") ||
    normalized.includes("/agents/") ||
    normalized.startsWith("agents/") ||
    normalized.includes("/hooks/") ||
    normalized.startsWith("hooks/") ||
    normalized.endsWith("/.mcp.json") ||
    normalized.endsWith(".mcp.json") ||
    normalized.endsWith("/.lsp.json") ||
    normalized.endsWith(".lsp.json")
  );
}

export function isComfyWorkflowJsonFile(relativePath: string, file: File): boolean {
  const normalized = relativePath.replace(/\\/g, "/").toLowerCase();
  return normalized.endsWith(".json") || file.type === "application/json";
}

export function getDisplayFileName(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] || relativePath;
}

export function buildWorkflowNameSuggestion(relativePath: string, fallbackIndex: number): string {
  const fileName = getDisplayFileName(relativePath);
  const raw = fileName
    .replace(/\.json$/i, "")
    .replace(/[_-]+/g, " ")
    .trim();

  if (!raw) {
    return `Custom ComfyUI Workflow ${fallbackIndex}`;
  }

  return raw
    .split(/\s+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function countWorkflowNodesInChat(workflow: Record<string, unknown>): number {
  if (Array.isArray((workflow as { nodes?: unknown[] }).nodes)) {
    return (workflow as { nodes: unknown[] }).nodes.length;
  }

  return Object.keys(workflow).filter((key) => /^\d+$/.test(key)).length;
}

export function isCheckedValue(value: boolean | "indeterminate"): boolean {
  return value === true;
}

export function mapByRelativePath(items: DroppedImportFile[]): Map<string, DroppedImportFile> {
  const lookup = new Map<string, DroppedImportFile>();
  for (const item of items) {
    lookup.set(item.relativePath, item);
  }
  return lookup;
}

export function getInputCategory(input: CustomComfyUIInput): "prompt" | "media" | "generation" | "advanced" {
  const name = input.name.toLowerCase();

  if (
    name.includes("prompt") ||
    name.includes("text") ||
    name.includes("caption") ||
    name.includes("negative")
  ) {
    return "prompt";
  }

  if (
    input.type === "image" ||
    input.type === "mask" ||
    input.type === "video" ||
    input.type === "file"
  ) {
    return "media";
  }

  if (
    name.includes("seed") ||
    name.includes("steps") ||
    name.includes("cfg") ||
    name.includes("sampler") ||
    name.includes("scheduler") ||
    name.includes("width") ||
    name.includes("height") ||
    name.includes("denoise") ||
    name.includes("strength")
  ) {
    return "generation";
  }

  return "advanced";
}

export function isCriticalInput(input: CustomComfyUIInput): boolean {
  if (input.required) {
    return true;
  }

  const name = input.name.toLowerCase();
  if (
    name.includes("prompt") ||
    name.includes("image") ||
    name.includes("mask") ||
    name.includes("video") ||
    name.includes("seed") ||
    name.includes("steps") ||
    name.includes("cfg") ||
    name.includes("width") ||
    name.includes("height")
  ) {
    return true;
  }

  return false;
}
