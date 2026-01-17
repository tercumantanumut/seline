/**
 * FLUX.2 Klein ComfyUI Backend - Client Library
 * HTTP client for communicating with FLUX.2 Klein 4B and 9B APIs
 * 
 * Both models use the same API schema and support:
 * - Text-to-image generation (no reference_images)
 * - Image editing with reference images (reference_images provided)
 */

// API endpoints for each model variant
const FLUX2_KLEIN_4B_API_URL = process.env.FLUX2_KLEIN_4B_API_URL || "http://localhost:5051";
const FLUX2_KLEIN_9B_API_URL = process.env.FLUX2_KLEIN_9B_API_URL || "http://localhost:5052";

// Default API key for local development
const DEFAULT_API_KEY = "internal-gateway-key";

export type Flux2KleinVariant = "4b" | "9b";

export interface Flux2KleinGenerateRequest {
    prompt: string;
    width?: number;
    height?: number;
    guidance?: number;
    steps?: number;
    seed?: number;
    reference_images?: string[]; // Base64 encoded images for editing mode
}

export interface Flux2KleinGenerateResponse {
    result: string; // Base64 encoded image
    seed: number;
    time_taken: number;
}

export interface Flux2KleinAsyncResponse {
    job_id: string;
    status: "pending" | "processing" | "complete" | "failed";
    message?: string;
}

export interface Flux2KleinJobStatusResponse {
    job_id: string;
    status: "pending" | "processing" | "complete" | "failed";
    result?: string; // Base64 encoded image when complete
    seed?: number;
    time_taken?: number;
    error?: string;
    created_at?: string;
    completed_at?: string;
}

export interface Flux2KleinHealthResponse {
    status: string;
    service: string;
    timestamp: number;
    max_concurrent_requests?: number;
    active_requests?: number;
}

/**
 * Get the API URL for a specific model variant
 */
function getApiUrl(variant: Flux2KleinVariant): string {
    return variant === "4b" ? FLUX2_KLEIN_4B_API_URL : FLUX2_KLEIN_9B_API_URL;
}

/**
 * Get headers for API requests
 */
function getHeaders(apiKey?: string): HeadersInit {
    return {
        "Content-Type": "application/json",
        "X-API-Key": apiKey || DEFAULT_API_KEY,
    };
}

/**
 * Check if the FLUX.2 Klein API is healthy
 */
export async function checkFlux2KleinHealth(variant: Flux2KleinVariant): Promise<Flux2KleinHealthResponse | null> {
    try {
        const response = await fetch(`${getApiUrl(variant)}/health`, {
            method: "GET",
            headers: getHeaders(),
            signal: AbortSignal.timeout(5000),
        });
        if (response.ok) {
            return response.json();
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Generate an image synchronously using FLUX.2 Klein
 * Note: May timeout for long generations - prefer async endpoint
 */
export async function generateFlux2KleinSync(
    variant: Flux2KleinVariant,
    request: Flux2KleinGenerateRequest,
    apiKey?: string
): Promise<Flux2KleinGenerateResponse> {
    const response = await fetch(`${getApiUrl(variant)}/flux2/generate`, {
        method: "POST",
        headers: getHeaders(apiKey),
        body: JSON.stringify({
            prompt: request.prompt,
            width: request.width ?? 1024,
            height: request.height ?? 1024,
            guidance: request.guidance ?? 4.0,
            steps: request.steps ?? 20,
            seed: request.seed,
            reference_images: request.reference_images,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `FLUX.2 Klein ${variant.toUpperCase()} API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Submit an async generation job to FLUX.2 Klein
 * Returns immediately with a job_id for polling
 */
export async function generateFlux2KleinAsync(
    variant: Flux2KleinVariant,
    request: Flux2KleinGenerateRequest,
    apiKey?: string
): Promise<Flux2KleinAsyncResponse> {
    const response = await fetch(`${getApiUrl(variant)}/flux2/generate-async`, {
        method: "POST",
        headers: getHeaders(apiKey),
        body: JSON.stringify({
            prompt: request.prompt,
            width: request.width ?? 1024,
            height: request.height ?? 1024,
            guidance: request.guidance ?? 4.0,
            steps: request.steps ?? 20,
            seed: request.seed,
            reference_images: request.reference_images,
        }),
    });

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `FLUX.2 Klein ${variant.toUpperCase()} API error: ${response.status}`);
    }

    return response.json();
}

/**
 * Check the status of an async generation job
 */
export async function checkFlux2KleinJobStatus(
    variant: Flux2KleinVariant,
    jobId: string,
    apiKey?: string
): Promise<Flux2KleinJobStatusResponse> {
    const response = await fetch(`${getApiUrl(variant)}/flux2/status/${jobId}`, {
        method: "GET",
        headers: getHeaders(apiKey),
    });

    if (!response.ok) {
        if (response.status === 404) {
            throw new Error(`Job ${jobId} not found or expired`);
        }
        throw new Error(`Status check failed: ${response.status}`);
    }

    return response.json();
}

/**
 * Generate an image with automatic polling for completion
 * This is the recommended method for integration - handles async submission and polling
 */
export async function generateFlux2KleinWithPolling(
    variant: Flux2KleinVariant,
    request: Flux2KleinGenerateRequest,
    options?: {
        apiKey?: string;
        maxAttempts?: number;
        pollIntervalMs?: number;
        onProgress?: (status: string) => void;
    }
): Promise<Flux2KleinJobStatusResponse> {
    const { apiKey, maxAttempts = 60, pollIntervalMs = 5000, onProgress } = options || {};

    // Submit async job
    onProgress?.("submitting");
    const asyncResponse = await generateFlux2KleinAsync(variant, request, apiKey);
    const jobId = asyncResponse.job_id;

    // Poll for completion
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, pollIntervalMs));

        const status = await checkFlux2KleinJobStatus(variant, jobId, apiKey);
        onProgress?.(status.status);

        if (status.status === "complete") {
            return status;
        }

        if (status.status === "failed") {
            throw new Error(status.error || "Generation failed");
        }
    }

    throw new Error(`Generation timed out after ${maxAttempts * pollIntervalMs / 1000} seconds`);
}

/**
 * Convert base64 result to a data URL for display
 */
export function base64ToDataUrl(base64: string, mimeType: string = "image/png"): string {
    // If already a data URL, return as-is
    if (base64.startsWith("data:")) {
        return base64;
    }
    return `data:${mimeType};base64,${base64}`;
}

