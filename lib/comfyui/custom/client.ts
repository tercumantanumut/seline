import { loadSettings } from "@/lib/settings/settings-manager";
import { readLocalFile } from "@/lib/storage/local-storage";

const DEFAULT_PORTS = [8081, 8188, 8189];
const OUTPUT_BUCKETS = ["images", "gifs", "videos"];

type HistoryStatus = {
  completed: boolean;
  statusStr?: string;
};

function buildBaseUrl(host: string, port: number, useHttps = false): string {
  const protocol = useHttps ? "https" : "http";
  return `${protocol}://${host}:${port}`;
}

function isComfyUIConnectionError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("failed to fetch") ||
    message.includes("ecconnrefused") ||
    message.includes("enotfound") ||
    message.includes("networkerror") ||
    message.includes("network error")
  );
}

function wrapComfyUIFetchError(error: unknown, context: string): never {
  if (isComfyUIConnectionError(error)) {
    throw new Error(
      `ComfyUI connection failed while ${context}. Check host/port and ensure ComfyUI is running.`
    );
  }
  throw error;
}

function getHistoryStatus(entry: Record<string, unknown>): HistoryStatus {
  const status = entry.status as Record<string, unknown> | undefined;
  if (!status || typeof status !== "object") {
    return { completed: false };
  }
  const completed = status.completed === true;
  const statusStr =
    typeof status.status_str === "string"
      ? status.status_str.toLowerCase()
      : undefined;
  return { completed, statusStr };
}

function isTerminalHistoryStatus(entry: Record<string, unknown>): boolean {
  const { completed, statusStr } = getHistoryStatus(entry);
  if (completed) return true;
  if (!statusStr) return false;
  return [
    "completed",
    "success",
    "succeeded",
    "failed",
    "error",
    "cancelled",
    "canceled",
    "interrupted",
  ].includes(statusStr);
}

function hasHistoryOutputs(entry: Record<string, unknown>): boolean {
  const outputs = entry.outputs as Record<string, unknown> | undefined;
  if (!outputs || typeof outputs !== "object") return false;
  for (const output of Object.values(outputs)) {
    if (!output || typeof output !== "object") continue;
    const outputRecord = output as Record<string, unknown>;
    for (const bucket of OUTPUT_BUCKETS) {
      const items = outputRecord[bucket] as unknown;
      if (Array.isArray(items) && items.length > 0) {
        return true;
      }
    }
  }
  return false;
}

async function safeComfyUIFetch(
  url: string,
  options: RequestInit,
  context: string
): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (error) {
    wrapComfyUIFetchError(error, context);
  }
}

async function probeComfyUI(baseUrl: string): Promise<boolean> {
  const endpoints = ["/system_stats", "/queue", "/"];
  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint}`, {
        method: "GET",
        signal: AbortSignal.timeout(1500),
      });
      if (response.ok) return true;
    } catch {
      // Try next endpoint/port.
    }
  }
  return false;
}

export async function detectComfyUIBaseUrl(options?: {
  host?: string;
  ports?: number[];
  useHttps?: boolean;
}): Promise<{ baseUrl: string | null; source: string }> {
  const host = options?.host || "127.0.0.1";
  const ports = options?.ports && options.ports.length > 0 ? options.ports : DEFAULT_PORTS;
  const useHttps = options?.useHttps ?? false;

  for (const port of ports) {
    const baseUrl = buildBaseUrl(host, port, useHttps);
    if (await probeComfyUI(baseUrl)) {
      return { baseUrl, source: `port:${port}` };
    }
  }

  return { baseUrl: null, source: "none" };
}

export async function resolveCustomComfyUIBaseUrl(workflowOverride?: {
  comfyuiBaseUrl?: string;
  comfyuiHost?: string;
  comfyuiPort?: number;
}): Promise<{ baseUrl: string; source: string }> {
  loadSettings();
  const settings = loadSettings();

  const explicitBaseUrl = workflowOverride?.comfyuiBaseUrl || settings.comfyuiCustomBaseUrl;
  if (explicitBaseUrl) {
    return { baseUrl: explicitBaseUrl, source: "explicit" };
  }

  const host = workflowOverride?.comfyuiHost || settings.comfyuiCustomHost || "127.0.0.1";
  const port = workflowOverride?.comfyuiPort || settings.comfyuiCustomPort;
  const useHttps = settings.comfyuiCustomUseHttps === true;

  if (port) {
    return { baseUrl: buildBaseUrl(host, port, useHttps), source: "configured" };
  }

  if (settings.comfyuiCustomAutoDetect !== false) {
    const detected = await detectComfyUIBaseUrl({
      host,
      ports: DEFAULT_PORTS,
      useHttps,
    });
    if (detected.baseUrl) {
      return { baseUrl: detected.baseUrl, source: detected.source };
    }
  }

  throw new Error("ComfyUI instance not reachable. Configure host/port or enable auto-detect.");
}

export async function fetchObjectInfo(baseUrl: string): Promise<Record<string, unknown>> {
  const response = await safeComfyUIFetch(
    `${baseUrl}/object_info`,
    {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    },
    "fetching /object_info"
  );
  if (!response.ok) {
    throw new Error(`ComfyUI object_info failed: ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function submitPrompt(
  baseUrl: string,
  prompt: Record<string, unknown>,
  clientId?: string
): Promise<string> {
  const response = await safeComfyUIFetch(
    `${baseUrl}/prompt`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, client_id: clientId }),
    },
    "submitting workflow prompt"
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ComfyUI prompt failed: ${response.status} ${errorText}`);
  }

  const payload = (await response.json()) as { prompt_id?: string };
  if (!payload.prompt_id) {
    throw new Error("ComfyUI did not return prompt_id.");
  }
  return payload.prompt_id;
}

export async function fetchHistory(
  baseUrl: string,
  promptId: string
): Promise<Record<string, unknown>> {
  const response = await safeComfyUIFetch(
    `${baseUrl}/history/${promptId}`,
    {
      method: "GET",
    },
    "fetching workflow history"
  );
  if (!response.ok) {
    throw new Error(`ComfyUI history failed: ${response.status}`);
  }
  return response.json() as Promise<Record<string, unknown>>;
}

export async function waitForHistory(
  baseUrl: string,
  promptId: string,
  options?: { timeoutMs?: number; pollIntervalMs?: number }
): Promise<Record<string, unknown>> {
  const timeoutMs = options?.timeoutMs ?? 5 * 60 * 1000;
  const pollIntervalMs = options?.pollIntervalMs ?? 1500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const history = await fetchHistory(baseUrl, promptId);
    const entry = history[promptId] as Record<string, unknown> | undefined;
    if (entry && (hasHistoryOutputs(entry) || isTerminalHistoryStatus(entry))) {
      return history;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error("ComfyUI workflow timed out.");
}

export async function fetchOutputFile(
  baseUrl: string,
  options: { filename: string; subfolder?: string; type?: string }
): Promise<Buffer> {
  const query = new URLSearchParams();
  query.set("filename", options.filename);
  if (options.subfolder) query.set("subfolder", options.subfolder);
  if (options.type) query.set("type", options.type);

  const response = await safeComfyUIFetch(
    `${baseUrl}/view?${query.toString()}`,
    {
      method: "GET",
    },
    "fetching ComfyUI output file"
  );
  if (!response.ok) {
    throw new Error(`ComfyUI view failed: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function resolveMediaBuffer(source: string): Buffer {
  if (source.startsWith("/api/media/")) {
    const relativePath = source.replace("/api/media/", "");
    return readLocalFile(relativePath);
  }
  if (source.startsWith("local-media://")) {
    const relativePath = source.replace("local-media://", "").replace(/^\/+/, "");
    return readLocalFile(relativePath);
  }
  if (source.startsWith("data:")) {
    const base64 = source.split(",")[1] || "";
    return Buffer.from(base64, "base64");
  }
  if (/^[A-Za-z0-9+/=]{100,}$/.test(source)) {
    return Buffer.from(source, "base64");
  }
  throw new Error(`Unsupported local media source: ${source}`);
}

export async function fetchMediaBuffer(source: string): Promise<Buffer> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await safeComfyUIFetch(
      source,
      { method: "GET" },
      "fetching media"
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.status}`);
    }
    return Buffer.from(await response.arrayBuffer());
  }
  return resolveMediaBuffer(source);
}

export async function uploadInputFile(
  baseUrl: string,
  options: { buffer: Buffer; filename: string; type?: string; subfolder?: string }
): Promise<{ name: string; subfolder?: string }> {
  const formData = new FormData();
  const blob = new Blob([new Uint8Array(options.buffer)]);
  formData.append("image", blob, options.filename);
  if (options.subfolder) {
    formData.append("subfolder", options.subfolder);
  }
  if (options.type) {
    formData.append("type", options.type);
  }

  const response = await safeComfyUIFetch(
    `${baseUrl}/upload/image`,
    {
      method: "POST",
      body: formData,
    },
    "uploading input file"
  );
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ComfyUI upload failed: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as { name?: string; subfolder?: string };
  if (!data.name) {
    throw new Error("ComfyUI upload did not return filename.");
  }
  return { name: data.name, subfolder: data.subfolder };
}
