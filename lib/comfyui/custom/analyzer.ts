import { convertWorkflowToApi, detectWorkflowFormat } from "./converter";
import type { CustomComfyUIInput, CustomComfyUIOutput } from "./types";

const OUTPUT_TYPE_HINTS: Array<{ match: RegExp; type: "image" | "video" }> = [
  { match: /video|gif|mp4|webm/i, type: "video" },
  { match: /image|preview|save/i, type: "image" },
];

function inferInputType(
  classType: string,
  inputName: string,
  value: unknown
): CustomComfyUIInput["type"] {
  const name = inputName.toLowerCase();
  const className = classType.toLowerCase();

  if (name.includes("mask")) return "mask";
  if (name.includes("image") || className.includes("loadimage")) return "image";
  if (name.includes("video") || className.includes("loadvideo")) return "video";

  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "object") return "json";
  return "string";
}

function inferInputTypeFromObjectInfo(rawType?: string): CustomComfyUIInput["type"] | undefined {
  if (!rawType) return undefined;
  const normalized = rawType.toUpperCase();
  if (normalized.includes("MASK")) return "mask";
  if (normalized.includes("IMAGE")) return "image";
  if (normalized.includes("VIDEO")) return "video";
  if (normalized.includes("FILE")) return "file";
  if (normalized.includes("JSON")) return "json";
  if (["INT", "FLOAT", "NUMBER"].includes(normalized)) return "number";
  if (normalized === "BOOLEAN") return "boolean";
  if (normalized === "COMBO") return "string";
  if (normalized === "STRING") return "string";
  return undefined;
}

function parseObjectInfoInputSpec(entry: unknown): {
  type?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
} {
  if (!Array.isArray(entry)) return {};
  if (Array.isArray(entry[0])) {
    const values = entry[0].filter((value) => typeof value === "string") as string[];
    return { type: "COMBO", enum: values.length > 0 ? values : undefined };
  }
  const rawType = typeof entry[0] === "string" ? entry[0] : undefined;
  const config = entry[1] && typeof entry[1] === "object" ? (entry[1] as Record<string, unknown>) : undefined;
  const enumValues = Array.isArray(config?.values)
    ? (config?.values as unknown[]).filter((value) => typeof value === "string")
    : undefined;
  return {
    type: rawType,
    enum: enumValues && enumValues.length > 0 ? (enumValues as string[]) : undefined,
    minimum: typeof config?.min === "number" ? config.min : undefined,
    maximum: typeof config?.max === "number" ? config.max : undefined,
    default: config?.default,
  };
}

function findObjectInfoEntry(
  objectInfo: Record<string, unknown> | undefined,
  classType: string,
  inputName: string
): { required?: boolean; spec?: ReturnType<typeof parseObjectInfoInputSpec> } {
  if (!objectInfo) return {};
  const entry = objectInfo[classType] as { input?: Record<string, unknown> } | undefined;
  const input = entry?.input as { required?: Record<string, unknown>; optional?: Record<string, unknown> } | undefined;
  if (!input) return {};
  if (input.required && inputName in input.required) {
    return { required: true, spec: parseObjectInfoInputSpec(input.required[inputName]) };
  }
  if (input.optional && inputName in input.optional) {
    return { required: false, spec: parseObjectInfoInputSpec(input.optional[inputName]) };
  }
  return {};
}

function inferOutputType(classType: string): CustomComfyUIOutput["type"] {
  for (const hint of OUTPUT_TYPE_HINTS) {
    if (hint.match.test(classType)) return hint.type;
  }
  return "image";
}

export function analyzeWorkflow(
  workflow: Record<string, unknown>,
  format?: "ui" | "api",
  options?: { objectInfo?: Record<string, unknown> }
): {
  format: "ui" | "api";
  inputs: CustomComfyUIInput[];
  outputs: CustomComfyUIOutput[];
} {
  const resolvedFormat = format || detectWorkflowFormat(workflow);
  const apiWorkflow = convertWorkflowToApi(workflow, resolvedFormat, {
    objectInfo: options?.objectInfo,
  });

  const inputs: CustomComfyUIInput[] = [];
  const outputs: CustomComfyUIOutput[] = [];

  for (const [nodeId, node] of Object.entries(apiWorkflow)) {
    if (nodeId.startsWith("_")) continue;
    const classType = String(node?.class_type || "");
    const nodeInputs = (node?.inputs || {}) as Record<string, unknown>;

    for (const [inputName, inputValue] of Object.entries(nodeInputs)) {
      if (Array.isArray(inputValue) && inputValue.length === 2) {
        continue;
      }

      const objectInfo = findObjectInfoEntry(options?.objectInfo, classType, inputName);
      const inferredType = objectInfo.spec?.type
        ? inferInputTypeFromObjectInfo(objectInfo.spec.type)
        : undefined;

      inputs.push({
        id: `${nodeId}:${inputName}`,
        name: inputName,
        type: inferredType || inferInputType(classType, inputName, inputValue),
        nodeId,
        inputField: inputName,
        default: inputValue !== undefined ? inputValue : objectInfo.spec?.default,
        enum: objectInfo.spec?.enum,
        minimum: objectInfo.spec?.minimum,
        maximum: objectInfo.spec?.maximum,
        required: objectInfo.required ?? false,
        enabled: true,
      });
    }

    const outputClass = classType.toLowerCase();
    if (outputClass.includes("save") || outputClass.includes("preview")) {
      outputs.push({
        id: `${nodeId}:output`,
        name: classType,
        type: inferOutputType(classType),
        nodeId,
      });
    }
  }

  return { format: resolvedFormat, inputs, outputs };
}
