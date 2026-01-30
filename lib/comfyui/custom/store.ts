import fs from "fs/promises";
import path from "path";
import { CustomComfyUIStore, CustomComfyUIWorkflow } from "./types";

const STORE_VERSION = 1;

function getStorePath(): string {
  const baseDir = process.env.LOCAL_DATA_PATH || path.join(process.cwd(), ".local-data");
  return path.join(baseDir, "custom-comfyui-workflows.json");
}

function getEmptyStore(): CustomComfyUIStore {
  return {
    version: STORE_VERSION,
    workflows: [],
  };
}

async function readStore(): Promise<CustomComfyUIStore> {
  const storePath = getStorePath();
  try {
    const raw = await fs.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as CustomComfyUIStore;
    if (!parsed || parsed.version !== STORE_VERSION || !Array.isArray(parsed.workflows)) {
      return getEmptyStore();
    }
    return parsed;
  } catch {
    return getEmptyStore();
  }
}

async function writeStore(store: CustomComfyUIStore): Promise<void> {
  const storePath = getStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
}

export async function listCustomComfyUIWorkflows(): Promise<CustomComfyUIWorkflow[]> {
  const store = await readStore();
  return store.workflows;
}

export async function getCustomComfyUIWorkflow(
  workflowId: string
): Promise<CustomComfyUIWorkflow | undefined> {
  const store = await readStore();
  return store.workflows.find((workflow) => workflow.id === workflowId);
}

export async function saveCustomComfyUIWorkflow(
  workflow: CustomComfyUIWorkflow
): Promise<CustomComfyUIWorkflow> {
  const store = await readStore();
  const now = new Date().toISOString();
  const existingIndex = store.workflows.findIndex((item) => item.id === workflow.id);

  if (existingIndex >= 0) {
    store.workflows[existingIndex] = {
      ...workflow,
      updatedAt: now,
    };
  } else {
    store.workflows.push({
      ...workflow,
      createdAt: workflow.createdAt || now,
      updatedAt: now,
    });
  }

  await writeStore(store);
  return workflow;
}

export async function createCustomComfyUIWorkflow(
  workflow: Omit<CustomComfyUIWorkflow, "id" | "createdAt" | "updatedAt">
): Promise<CustomComfyUIWorkflow> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const created: CustomComfyUIWorkflow = {
    ...workflow,
    id,
    createdAt: now,
    updatedAt: now,
  };
  await saveCustomComfyUIWorkflow(created);
  return created;
}

export async function deleteCustomComfyUIWorkflow(workflowId: string): Promise<boolean> {
  const store = await readStore();
  const before = store.workflows.length;
  store.workflows = store.workflows.filter((workflow) => workflow.id !== workflowId);
  if (store.workflows.length === before) {
    return false;
  }
  await writeStore(store);
  return true;
}
