import { saveBase64Image } from "@/lib/storage/local-storage";

// WAN 2.2 Imagen API configuration
// Note: These are functions to read env vars at runtime for testability
const getEndpoint = () => process.env.WAN22_IMAGEN_ENDPOINT ?? "";

const getApiKey = () => process.env.STYLY_AI_API_KEY;

// Default negative prompt for quality control
const DEFAULT_NEGATIVE_PROMPT =
  "低质量, 模糊, 变形, 丑陋, 文字, 水印, 签名, 裁剪不当";

export interface Wan22ImagenInput {
  positive: string;
  negative?: string;
  width?: 512 | 768 | 1024 | 1536;
  height?: 512 | 768 | 1024 | 1344 | 1536;
  seed?: number;
  async?: boolean;
}

export interface Wan22ImagenSyncResult {
  images: Array<{
    url: string;
    localPath?: string;
    filePath?: string;
    width: number;
    height: number;
    format: string;
  }>;
  timeTaken: number;
  metadata?: {
    request_id?: string;
    model_name?: string;
    processing_time?: number;
  };
}

export interface Wan22ImagenAsyncResult {
  jobId: string;
  status: string;
  statusUrl: string;
  modelName?: string;
  createdAt?: string;
}

export type Wan22ImagenResult = Wan22ImagenSyncResult | Wan22ImagenAsyncResult;

export function isAsyncResult(
  result: Wan22ImagenResult
): result is Wan22ImagenAsyncResult {
  return "jobId" in result;
}

/**
 * Call the WAN 2.2 Imagen text-to-image generation API
 */
export async function callWan22Imagen(
  input: Wan22ImagenInput,
  sessionId: string
): Promise<Wan22ImagenResult> {
  const baseEndpoint = getEndpoint();
  if (!baseEndpoint) {
    throw new Error("WAN22_IMAGEN_ENDPOINT environment variable is not configured");
  }
  const endpoint = input.async
    ? `${baseEndpoint}?async=true`
    : baseEndpoint;

  // Build request body
  // LoRA is disabled - always send lora_strength: 0
  const body: Record<string, unknown> = {
    positive: input.positive,
    negative: input.negative ?? DEFAULT_NEGATIVE_PROMPT,
    width: input.width ?? 768,
    height: input.height ?? 1344,
    lora_strength: 0,
  };

  // Add optional seed if provided
  if (input.seed !== undefined) {
    body.seed = input.seed;
  }

  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error("STYLY_AI_API_KEY environment variable is not configured");
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();

    // Handle specific error codes
    if (response.status === 401) {
      throw new Error("WAN 2.2 Imagen API authentication failed: Invalid API key");
    } else if (response.status === 422) {
      throw new Error(`WAN 2.2 Imagen API validation error: ${errorText}`);
    } else if (response.status === 503) {
      throw new Error("WAN 2.2 Imagen API is temporarily unavailable. Please try again later.");
    } else {
      throw new Error(`WAN 2.2 Imagen API error: ${response.status} - ${errorText}`);
    }
  }

  const data = await response.json();

  // Handle async response
  if (input.async) {
    return {
      jobId: data.job_id,
      status: data.status,
      statusUrl: data.status_url,
      modelName: data.model_name,
      createdAt: data.created_at,
    };
  }

  // Handle sync response - save base64 result to local storage
  const uploadResult = await saveBase64Image(
    data.result,
    sessionId,
    "generated",
    "png"
  );

  return {
    images: [
      {
        url: uploadResult.url,
        localPath: uploadResult.localPath,
        filePath: uploadResult.filePath,
        width: input.width ?? 768,
        height: input.height ?? 1344,
        format: "png",
      },
    ],
    timeTaken: data.time_taken,
    metadata: data.metadata,
  };
}

