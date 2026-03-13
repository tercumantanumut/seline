import { saveBase64Video, readLocalFile, fileExists } from "@/lib/storage/local-storage";

// WAN 2.2 Video API configuration
// Note: These are functions to read env vars at runtime for testability
const getEndpoint = () => process.env.WAN22_VIDEO_ENDPOINT ?? "";

const getApiKey = () => process.env.STYLY_AI_API_KEY;

// Default negative prompt for video quality
const DEFAULT_VIDEO_NEGATIVE_PROMPT =
  "static, blurry, distorted, low quality, pixelated, artifacts";

export interface Wan22VideoInput {
  image_url?: string;
  base64_image?: string;
  positive: string;
  negative?: string;
  fps?: 10 | 15 | 21 | 24 | 30 | 60;
  duration?: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 5;
  // motion_amplitude is intentionally omitted - always hard-coded to 1.0
  seed?: number;
  async?: boolean;
  // LoRA parameters for pixel animation and other specialized models
  lora_name?: string;
  lora_strength?: number;
}

export interface Wan22VideoSyncResult {
  videos: Array<{
    url: string;
    localPath?: string;
    filePath?: string;
    width?: number;
    height?: number;
    format: string;
    fps: number;
    duration: number;
  }>;
  timeTaken: number;
  metadata?: {
    request_id?: string;
    model_name?: string;
    processing_time?: number;
  };
}

export interface Wan22VideoAsyncResult {
  jobId: string;
  status: string;
  statusUrl: string;
  modelName?: string;
  createdAt?: string;
}

export type Wan22VideoResult = Wan22VideoSyncResult | Wan22VideoAsyncResult;

export function isAsyncResult(
  result: Wan22VideoResult
): result is Wan22VideoAsyncResult {
  return "jobId" in result;
}

/**
 * Fetch an image from a remote URL and convert it to base64
 */
async function urlToBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return buffer.toString("base64");
}

/**
 * Read a local media file and convert to base64
 * Handles /api/media/... paths by extracting the relative path
 */
function localPathToBase64(imagePath: string): string {
  // Extract relative path from /api/media/... format
  let relativePath = imagePath;
  if (imagePath.startsWith("/api/media/")) {
    relativePath = imagePath.replace("/api/media/", "");
  } else if (imagePath.startsWith("local-media://")) {
    relativePath = imagePath.replace("local-media://", "").replace(/^\/+/, "");
  }

  // Check if file exists
  if (!fileExists(relativePath)) {
    throw new Error(`Local image file not found: ${relativePath}`);
  }

  // Read file and convert to base64
  const buffer = readLocalFile(relativePath);
  return buffer.toString("base64");
}

/**
 * Clean base64 string by removing data URL prefix if present
 */
function cleanBase64(base64Data: string): string {
  return base64Data.replace(/^data:image\/\w+;base64,/, "");
}

/**
 * Check if a path is a local media path
 */
function isLocalMediaPath(path: string): boolean {
  return path.startsWith("/api/media/") || path.startsWith("local-media://");
}

/**
 * Call the WAN 2.2 Video image-to-video generation API
 */
export async function callWan22Video(
  input: Wan22VideoInput,
  sessionId: string
): Promise<Wan22VideoResult> {
  // Validate that at least one image input is provided
  if (!input.image_url && !input.base64_image) {
    throw new Error("Either image_url or base64_image must be provided");
  }

  const baseEndpoint = getEndpoint();
  if (!baseEndpoint) {
    throw new Error("WAN22_VIDEO_ENDPOINT environment variable is not configured");
  }
  const endpoint = input.async
    ? `${baseEndpoint}?async=true`
    : baseEndpoint;

  // Prepare the base64 image for the API
  let base64Image: string;
  if (input.base64_image) {
    base64Image = cleanBase64(input.base64_image);
  } else if (input.image_url) {
    // Handle different URL/path formats
    if (isLocalMediaPath(input.image_url)) {
      // Local media path - read from local storage
      console.log(`[WAN22 Video] Reading local image: ${input.image_url}`);
      base64Image = localPathToBase64(input.image_url);
    } else if (input.image_url.startsWith("http://") || input.image_url.startsWith("https://")) {
      // Remote URL - fetch and convert
      base64Image = await urlToBase64(input.image_url);
    } else {
      throw new Error(`Unsupported image URL format: ${input.image_url}`);
    }
  } else {
    throw new Error("No image input provided");
  }

  // Build request body
  // Note: motion_amplitude is always hard-coded to 1.0 - not configurable by the agent
  const body: Record<string, unknown> = {
    base64_image: base64Image,
    positive: input.positive,
    negative: input.negative ?? DEFAULT_VIDEO_NEGATIVE_PROMPT,
    fps: input.fps ?? 21,
    duration: input.duration ?? 2.0,
    motion_amplitude: 1.0,
  };

  // Add optional seed if provided
  if (input.seed !== undefined) {
    body.seed = input.seed;
  }

  // Add optional LoRA parameters for pixel animation and other specialized models
  if (input.lora_name !== undefined) {
    body.lora_name = input.lora_name;
  }
  if (input.lora_strength !== undefined) {
    body.lora_strength = input.lora_strength;
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
      throw new Error("WAN 2.2 Video API authentication failed: Invalid API key");
    } else if (response.status === 422) {
      throw new Error(`WAN 2.2 Video API validation error: ${errorText}`);
    } else if (response.status === 503) {
      throw new Error("WAN 2.2 Video API is temporarily unavailable. Please try again later.");
    } else {
      throw new Error(`WAN 2.2 Video API error: ${response.status} - ${errorText}`);
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
  const effectiveFps = input.fps ?? 21;
  const effectiveDuration = input.duration ?? 2.0;

  const uploadResult = await saveBase64Video(
    data.result,
    sessionId,
    "generated",
    "mp4"
  );

  return {
    videos: [
      {
        url: uploadResult.url,
        localPath: uploadResult.localPath,
        filePath: uploadResult.filePath,
        format: "mp4",
        fps: effectiveFps,
        duration: effectiveDuration,
      },
    ],
    timeTaken: data.time_taken,
    metadata: data.metadata,
  };
}

