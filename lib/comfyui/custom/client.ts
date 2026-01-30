import { loadSettings } from "@/lib/settings/settings-manager";
import { readLocalFile } from "@/lib/storage/local-storage";

const DEFAULT_PORTS = [8081, 8188, 8189];

function buildBaseUrl(host: string, port: number, useHttps = false): string {
  const protocol = useHttps ? "https" : "http";
  return `${protocol}://${host}:${port}`;
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
  const response = await fetch(`${baseUrl}/object_info`, {
    method: "GET",
    signal: AbortSignal.timeout(5000),
  });
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
  const response = await fetch(`${baseUrl}/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, client_id: clientId }),
  });

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
  const response = await fetch(`${baseUrl}/history/${promptId}`, {
    method: "GET",
  });
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
    if (promptId in history) {
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

  const response = await fetch(`${baseUrl}/view?${query.toString()}`, {
    method: "GET",
  });
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
    const response = await fetch(source);
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

  const response = await fetch(`${baseUrl}/upload/image`, {
    method: "POST",
    body: formData,
  });
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
