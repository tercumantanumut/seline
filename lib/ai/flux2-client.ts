import { saveBase64Image, readLocalFile, fileExists } from "@/lib/storage/local-storage";
import { loadSettings } from "@/lib/settings/settings-manager";

// Flux2 image generation service configuration
// FLUX2_ENDPOINT: URL of the Flux2 generation API
// FLUX2_API_KEY: Authentication key for the Flux2 API
function getFlux2Config(): { endpoint?: string; apiKey?: string } {
  // Ensure settings are loaded so process.env is updated (Electron standalone).
  loadSettings();
  return {
    endpoint: process.env.FLUX2_ENDPOINT,
    apiKey: process.env.FLUX2_API_KEY,
  };
}

export interface Flux2GenerateInput {
  prompt: string;
  width?: number;
  height?: number;
  guidance?: number;
  steps?: number;
  seed?: number;
  referenceImages?: string[]; // Base64-encoded images
}

export interface Flux2GenerateResult {
  images: Array<{
    url: string;
    localPath?: string;
    filePath?: string;
    width: number;
    height: number;
    format: string;
  }>;
  seed: number;
  timeTaken: number;
}

/**
 * Fetch an image from a URL and convert it to base64
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
 * Check if a string looks like valid base64 data
 */
function isValidBase64(str: string): boolean {
  // Base64 strings should only contain valid base64 characters
  // and have a length that's a multiple of 4 (after padding)
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;

  // Remove any data URL prefix first
  const cleanStr = str.replace(/^data:image\/\w+;base64,/, "");

  // Check if it looks like base64 (reasonable length and valid chars)
  // A valid base64 image would be at least a few hundred characters
  if (cleanStr.length < 100) {
    return false;
  }

  return base64Regex.test(cleanStr);
}

/**
 * Call the Flux2 image generation API
 */
export async function callFlux2Generate(
  input: Flux2GenerateInput,
  sessionId: string
): Promise<Flux2GenerateResult> {
  // Build request body
  const body: Record<string, unknown> = {
    prompt: input.prompt,
    width: input.width ?? 1024,
    height: input.height ?? 1024,
    guidance: input.guidance ?? 4.0,
    steps: input.steps ?? 20,
  };

  // Add optional seed if provided
  if (input.seed !== undefined) {
    body.seed = input.seed;
  }

  // Add reference images if provided (convert URLs/paths to base64 if needed)
  if (input.referenceImages && input.referenceImages.length > 0) {
    const base64Images: string[] = [];
    for (const img of input.referenceImages) {
      try {
        let base64: string;

        if (img.startsWith("http://") || img.startsWith("https://")) {
          // Remote URL - fetch and convert
          base64 = await urlToBase64(img);
        } else if (img.startsWith("/api/media/") || img.startsWith("local-media://")) {
          // Local media path - read from local storage
          base64 = localPathToBase64(img);
        } else if (isValidBase64(img)) {
          // Already valid base64, remove data URL prefix if present
          base64 = img.replace(/^data:image\/\w+;base64,/, "");
        } else {
          // Unknown format - skip with warning
          console.warn(`[Flux2] Skipping reference image with unknown format: ${img.substring(0, 50)}...`);
          continue;
        }

        base64Images.push(base64);
      } catch (error) {
        console.error(`[Flux2] Failed to process reference image: ${error}`);
        // Continue with other images instead of failing entirely
      }
    }

    if (base64Images.length > 0) {
      body.reference_images = base64Images;
    }
  }

  const { endpoint, apiKey } = getFlux2Config();

  if (!endpoint) {
    throw new Error("FLUX2_ENDPOINT environment variable is not configured");
  }
  if (!apiKey) {
    throw new Error("FLUX2_API_KEY environment variable is not configured");
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
      throw new Error("Flux2 API authentication failed: Invalid API key");
    } else if (response.status === 422) {
      throw new Error(`Flux2 API validation error: ${errorText}`);
    } else if (response.status === 503) {
      throw new Error("Flux2 API is temporarily unavailable. Please try again later.");
    } else {
      throw new Error(`Flux2 API error: ${response.status} - ${errorText}`);
    }
  }

  const data = await response.json();

  // Save the base64 result to local storage
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
        width: input.width ?? 1024,
        height: input.height ?? 1024,
        format: "png",
      },
    ],
    seed: data.seed,
    timeTaken: data.time_taken,
  };
}

