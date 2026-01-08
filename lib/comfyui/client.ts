/**
 * ComfyUI Local Backend - Client Library
 * HTTP client for communicating with the local ComfyUI API
 */

export interface ComfyUIStatus {
    dockerInstalled: boolean;
    imageBuilt: boolean;
    containerRunning: boolean;
    apiHealthy: boolean;
    modelsDownloaded: boolean;
    checkpointExists: boolean;
    loraExists: boolean;
}

export interface InstallProgress {
    stage: "checking" | "building" | "downloading-models" | "starting" | "complete" | "error";
    progress: number; // 0-100
    message: string;
    error?: string;
}

export interface GenerateRequest {
    positive_prompt: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    lora_strength?: number;
    batch_size?: number;
    return_base64?: boolean;
}

export interface GenerateResponse {
    prompt_id: string;
    status: "queued" | "processing" | "completed" | "failed";
    images?: string[];
    images_base64?: string[];
    error?: string;
    seed?: number;
}

// Default API endpoint
const COMFYUI_API_URL = process.env.COMFYUI_API_URL || "http://localhost:8000";

/**
 * Ensure image URLs are absolute by prepending the API base URL if needed
 */
function ensureAbsoluteUrls(images: string[] | undefined): string[] | undefined {
    if (!images) return undefined;
    return images.map(img => {
        // If already absolute URL, return as-is
        if (img.startsWith("http://") || img.startsWith("https://") || img.startsWith("data:")) {
            return img;
        }
        // Prepend the API base URL for relative paths
        return `${COMFYUI_API_URL}${img.startsWith("/") ? "" : "/"}${img}`;
    });
}

/**
 * Check if the ComfyUI API is healthy
 */
export async function checkHealth(): Promise<boolean> {
    try {
        const response = await fetch(`${COMFYUI_API_URL}/health`, {
            method: "GET",
            signal: AbortSignal.timeout(5000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Generate an image using Z-Image Turbo FP8
 */
export async function generateImage(request: GenerateRequest): Promise<GenerateResponse> {
    const response = await fetch(`${COMFYUI_API_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            positive_prompt: request.positive_prompt,
            seed: request.seed ?? -1,
            width: request.width ?? 1024,
            height: request.height ?? 1024,
            steps: request.steps ?? 9,
            cfg: request.cfg ?? 1.0,
            lora_strength: request.lora_strength ?? 0.5,
            batch_size: request.batch_size ?? 1,
            return_base64: request.return_base64 ?? false,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `ComfyUI API error: ${response.status}`);
    }

    const data: GenerateResponse = await response.json();
    // Ensure image URLs are absolute
    data.images = ensureAbsoluteUrls(data.images);
    return data;
}

/**
 * Check the status of a generation job
 */
export async function checkStatus(promptId: string): Promise<GenerateResponse> {
    const response = await fetch(`${COMFYUI_API_URL}/api/status/${promptId}`, {
        method: "GET",
    });

    if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
    }

    const data: GenerateResponse = await response.json();
    // Ensure image URLs are absolute
    data.images = ensureAbsoluteUrls(data.images);
    return data;
}

/**
 * Get queue status
 */
export async function getQueueStatus(): Promise<{
    status: string;
    statistics: {
        total_enqueued: number;
        total_processed: number;
        total_failed: number;
    };
}> {
    const response = await fetch(`${COMFYUI_API_URL}/api/queue/status`, {
        method: "GET",
    });

    if (!response.ok) {
        throw new Error(`Queue status check failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Cancel a generation job
 */
export async function cancelGeneration(promptId: string): Promise<{ status: string }> {
    const response = await fetch(`${COMFYUI_API_URL}/api/cancel/${promptId}`, {
        method: "POST",
    });

    if (!response.ok) {
        throw new Error(`Cancel failed: ${response.status}`);
    }

    return response.json();
}
