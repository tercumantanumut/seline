export type CustomComfyUIInputType =
  | "string"
  | "number"
  | "boolean"
  | "image"
  | "mask"
  | "video"
  | "json"
  | "file";

export type CustomComfyUIOutputType = "image" | "video" | "file";

export interface CustomComfyUIInput {
  id: string;
  name: string;
  type: CustomComfyUIInputType;
  nodeId: string;
  inputField: string;
  required?: boolean;
  enabled?: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  multiple?: boolean;
}

export interface CustomComfyUIOutput {
  id: string;
  name: string;
  type: CustomComfyUIOutputType;
  nodeId: string;
  outputField?: string;
}

export interface CustomComfyUIWorkflow {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  workflow: Record<string, unknown>;
  format: "ui" | "api";
  inputs: CustomComfyUIInput[];
  outputs?: CustomComfyUIOutput[];
  enabled?: boolean;
  loadingMode?: "always" | "deferred";
  comfyuiHost?: string;
  comfyuiPort?: number;
  comfyuiBaseUrl?: string;
  timeoutSeconds?: number;
}

export interface CustomComfyUIStore {
  version: 1;
  workflows: CustomComfyUIWorkflow[];
}
