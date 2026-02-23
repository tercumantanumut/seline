import type { CustomComfyUIInput, CustomComfyUIOutput } from "@/lib/comfyui/custom/types";

export const INPUT_TYPES: CustomComfyUIInput["type"][] = [
  "string",
  "number",
  "boolean",
  "image",
  "mask",
  "video",
  "json",
  "file",
];

export const OUTPUT_TYPES: CustomComfyUIOutput["type"][] = ["image", "video", "file"];

export function formatDefaultValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function coerceDefaultValue(value: string, type: CustomComfyUIInput["type"]): unknown {
  if (value.trim().length === 0) return undefined;
  if (type === "number") {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  if (type === "boolean") {
    return value === "true";
  }
  if (type === "json") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

export function createInput(): CustomComfyUIInput {
  return {
    id: `new-${Date.now()}`,
    name: "",
    type: "string",
    nodeId: "",
    inputField: "",
    required: false,
    enabled: true,
  };
}

export function createOutput(): CustomComfyUIOutput {
  return {
    id: `new-${Date.now()}`,
    name: "",
    type: "image",
    nodeId: "",
  };
}
