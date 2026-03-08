import { readFileSync, existsSync } from "fs";
import { saveBase64Image, readLocalFile, fileExists } from "@/lib/storage/local-storage";
import { loadSettings } from "@/lib/settings/settings-manager";

function getImagenConfig(): { endpoint: string; apiKey?: string } {
  // Ensure settings are loaded so process.env is updated (Electron standalone).
  loadSettings();
  return {
    endpoint: process.env.IMAGEN_EDIT_ENDPOINT ?? "",
    apiKey: process.env.STYLY_AI_API_KEY,
  };
}

/**
 * Check if a path is a local media path
 */
function isLocalMediaPath(path: string): boolean {
  return path.startsWith("/api/media/") || path.startsWith("local-media://");
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
 * Convert an image URL/path to base64 for API calls
 * Handles local paths, remote URLs, and already-encoded base64 data
 */
async function convertImageToBase64(imageSource: string): Promise<string> {
  if (isLocalMediaPath(imageSource)) {
    // Local media path - read from local storage
    console.log(`[ImageEdit] Converting local image to base64: ${imageSource}`);
    return localPathToBase64(imageSource);
  } else if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    // Remote URL - fetch and convert
    console.log(`[ImageEdit] Fetching remote image: ${imageSource}`);
    return urlToBase64(imageSource);
  } else if (imageSource.startsWith("data:image/")) {
    // Data URL - extract base64 portion
    const match = imageSource.match(/^data:image\/\w+;base64,(.+)$/);
    if (match) {
      return match[1];
    }
    throw new Error("Invalid data URL format");
  } else if (isValidBase64(imageSource)) {
    // Already valid base64
    return imageSource.replace(/^data:image\/\w+;base64,/, "");
  } else {
    // Local filesystem path (file:// URL or absolute path)
    let absolutePath: string | undefined;
    if (imageSource.startsWith("file://")) {
      absolutePath = decodeURIComponent(imageSource.replace(/^file:\/\//, ""));
    } else if (imageSource.startsWith("/")) {
      absolutePath = imageSource;
    }

    if (absolutePath) {
      if (!existsSync(absolutePath)) {
        throw new Error(`Local file not found: ${absolutePath}`);
      }
      console.log(`[ImageEdit] Reading local filesystem image: ${absolutePath}`);
      const buffer = readFileSync(absolutePath);
      return buffer.toString("base64");
    }

    throw new Error(`Unsupported image format: ${imageSource.substring(0, 50)}...`);
  }
}

export interface ImageEditInput {
  prompt: string;
  imageUrl: string;
  secondImageUrl?: string;
  temperature?: number;
  async?: boolean;
}

export interface ImageEditSyncResult {
  images: Array<{
    url: string;
    width?: number;
    height?: number;
    format?: string;
  }>;
  text?: string;
  timeTaken?: number;
}

export interface ImageEditAsyncResult {
  jobId: string;
  status: string;
  statusUrl: string;
}

export type ImageEditResult = ImageEditSyncResult | ImageEditAsyncResult;

export function isAsyncResult(
  result: ImageEditResult
): result is ImageEditAsyncResult {
  return "jobId" in result;
}

export async function callImagenEdit(
  input: ImageEditInput,
  sessionId: string
): Promise<ImageEditResult> {
  const { endpoint: baseEndpoint, apiKey } = getImagenConfig();
  if (!baseEndpoint) {
    throw new Error("IMAGEN_EDIT_ENDPOINT environment variable is not configured");
  }

  const endpoint = input.async ? `${baseEndpoint}?async=true` : baseEndpoint;

  // Convert images to base64 if they are local paths or need conversion
  // The external API cannot access local /api/media/... paths
  let primaryImageBase64: string;
  let secondImageBase64: string | undefined;

  try {
    primaryImageBase64 = await convertImageToBase64(input.imageUrl);
  } catch (error) {
    throw new Error(`Failed to convert primary image: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (input.secondImageUrl) {
    try {
      secondImageBase64 = await convertImageToBase64(input.secondImageUrl);
    } catch (error) {
      throw new Error(`Failed to convert second image: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const body: Record<string, unknown> = {
    prompt: input.prompt,
    image_base64: primaryImageBase64,
  };

  if (secondImageBase64) {
    body.second_image_base64 = secondImageBase64;
  }

  if (input.temperature !== undefined) {
    body.temperature = input.temperature;
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  console.log(`[ImageEdit] Sending request to ${endpoint} with prompt: ${input.prompt.substring(0, 100)}...`);

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Image edit API error: ${response.status} - ${errorText}`
    );
  }

  const data = await response.json();

  // Handle async response
  if (input.async) {
    return {
      jobId: data.job_id,
      status: data.status,
      statusUrl: data.status_url,
    };
  }

  // Handle sync response - upload base64 results to S3
  const processedImages: Array<{
    url: string;
    width?: number;
    height?: number;
    format?: string;
  }> = [];

  if (data.images && Array.isArray(data.images)) {
    for (const img of data.images) {
      // Check for base64 data in various formats
      let base64Data: string | null = null;
      let format = img.format || "png";

      if (img.base64) {
        base64Data = img.base64;
      } else if (img.data) {
        base64Data = img.data;
      } else if (img.url && img.url.startsWith("data:image/")) {
        // Handle data URL format: data:image/png;base64,<base64data>
        const match = img.url.match(/^data:image\/(\w+);base64,(.+)$/);
        if (match) {
          format = match[1];
          base64Data = match[2];
        }
      }

      if (base64Data) {
        const uploadResult = await saveBase64Image(
          base64Data,
          sessionId,
          "generated",
          format
        );
        processedImages.push({
          url: uploadResult.url,
          width: img.width,
          height: img.height,
          format,
        });
      } else if (img.url) {
        // Regular URL (not data URL)
        processedImages.push({
          url: img.url,
          width: img.width,
          height: img.height,
          format: img.format,
        });
      }
    }
  }

  return {
    images: processedImages,
    text: data.text,
    timeTaken: data.time_taken,
  };
}

export async function checkAsyncJobStatus(
  statusUrl: string
): Promise<ImageEditResult> {
  const headers: Record<string, string> = {};
  const { apiKey } = getImagenConfig();
  if (apiKey) {
    headers["X-API-Key"] = apiKey;
  }

  const response = await fetch(statusUrl, { headers });

  if (!response.ok) {
    throw new Error(`Job status check failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.status === "completed" && data.result) {
    // Process completed result
    const processedImages: Array<{
      url: string;
      width?: number;
      height?: number;
      format?: string;
    }> = [];

    if (data.result.images && Array.isArray(data.result.images)) {
      for (const img of data.result.images) {
        processedImages.push({
          url: img.url || img.base64,
          width: img.width,
          height: img.height,
          format: img.format,
        });
      }
    }

    return {
      images: processedImages,
      text: data.result.text,
      timeTaken: data.result.time_taken,
    };
  }

  return {
    jobId: data.job_id,
    status: data.status,
    statusUrl,
  };
}
