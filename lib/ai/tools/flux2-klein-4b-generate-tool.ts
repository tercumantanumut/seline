/**
 * FLUX.2 Klein 4B Generation Tool
 * 
 * Local image generation tool using ComfyUI with FLUX.2 Klein 4B model.
 * Supports both text-to-image generation and image editing with reference images.
 * 
 * Ports: API 5051, ComfyUI 8084
 * VRAM: ~12GB recommended
 */

import { tool, jsonSchema } from "ai";
import {
    generateFlux2KleinWithPolling,
    checkFlux2KleinHealth,
} from "@/lib/comfyui";
import { saveBase64Image, readLocalFile, fileExists } from "@/lib/storage/local-storage";

interface Flux2Klein4BGenerateInput {
    prompt: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
    reference_images?: string[];
}

interface Flux2Klein4BGenerateOutput {
    status: "completed" | "processing" | "error";
    images?: Array<{ url: string }>;
    jobId?: string;
    seed?: number;
    timeTaken?: number;
    error?: string;
}

interface Flux2Klein4BEditInput {
    prompt: string;
    source_image_urls: string[];
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
}

interface Flux2Klein4BReferenceInput {
    prompt: string;
    reference_image_urls: string[];
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
}

function isLocalMediaPath(path: string): boolean {
    return path.startsWith("/api/media/") || path.startsWith("local-media://");
}

async function urlToBase64(imageUrl: string): Promise<string> {
    const response = await fetch(imageUrl);
    if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    return buffer.toString("base64");
}

function localPathToBase64(imagePath: string): string {
    let relativePath = imagePath;
    if (imagePath.startsWith("/api/media/")) {
        relativePath = imagePath.replace("/api/media/", "");
    } else if (imagePath.startsWith("local-media://")) {
        relativePath = imagePath.replace("local-media://", "").replace(/^\/+/, "");
    }

    if (!fileExists(relativePath)) {
        throw new Error(`Local image file not found: ${relativePath}`);
    }

    const buffer = readLocalFile(relativePath);
    return buffer.toString("base64");
}

function isValidBase64(str: string): boolean {
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
    const cleanStr = str.replace(/^data:image\/\w+;base64,/, "");
    if (cleanStr.length < 100) {
        return false;
    }
    return base64Regex.test(cleanStr);
}

async function normalizeReferenceImages(referenceImages?: string[]): Promise<string[] | undefined> {
    if (!referenceImages || referenceImages.length === 0) {
        return undefined;
    }

    const base64Images: string[] = [];
    for (const image of referenceImages) {
        try {
            let base64: string;
            if (isLocalMediaPath(image)) {
                base64 = localPathToBase64(image);
            } else if (image.startsWith("http://") || image.startsWith("https://")) {
                base64 = await urlToBase64(image);
            } else if (image.startsWith("data:image/")) {
                const match = image.match(/^data:image\/\w+;base64,(.+)$/);
                if (!match) {
                    throw new Error("Invalid data URL format");
                }
                base64 = match[1];
            } else if (isValidBase64(image)) {
                base64 = image.replace(/^data:image\/\w+;base64,/, "");
            } else {
                throw new Error(`Unsupported image format: ${image.substring(0, 50)}...`);
            }

            base64Images.push(base64);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.warn(`[FLUX.2 Klein 4B] Skipping reference image: ${message}`);
        }
    }

    return base64Images.length > 0 ? base64Images : undefined;
}

async function executeFlux2Klein4B(
    sessionId: string,
    input: Flux2Klein4BGenerateInput
): Promise<Flux2Klein4BGenerateOutput> {
    try {
        // Check if API is healthy first
        const health = await checkFlux2KleinHealth("4b");
        if (!health) {
            return {
                status: "error",
                error: "FLUX.2 Klein 4B API is not available. Ensure Docker container is running on port 5051.",
            };
        }

        // Validate dimensions are divisible by 8
        const width = input.width ?? 1024;
        const height = input.height ?? 1024;
        if (width % 8 !== 0 || height % 8 !== 0) {
            return {
                status: "error",
                error: "Width and height must be divisible by 8",
            };
        }

        // Generate image with polling
        const result = await generateFlux2KleinWithPolling("4b", {
            prompt: input.prompt,
            seed: input.seed,
            width,
            height,
            steps: input.steps ?? 20,
            guidance: input.guidance ?? 4.0,
            reference_images: await normalizeReferenceImages(input.reference_images),
        });

        // Save base64 result to local storage and get URL
        let imageUrl: string | undefined;
        if (result.result) {
            const uploadResult = await saveBase64Image(
                result.result,
                sessionId,
                "generated",
                "png"
            );
            imageUrl = uploadResult.url;
        }

        return {
            status: "completed",
            images: imageUrl ? [{ url: imageUrl }] : undefined,
            seed: result.seed,
            timeTaken: result.time_taken,
        };
    } catch (error) {
        return {
            status: "error",
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

// Define the schema for the tool
const flux2Klein4BInputSchema = jsonSchema<Flux2Klein4BGenerateInput>({
    type: "object",
    title: "Flux2Klein4BGenerateInput",
    description: "Input for FLUX.2 Klein 4B local image generation",
    properties: {
        prompt: {
            type: "string",
            description: "Text prompt describing the image to generate or the edit to make",
        },
        seed: {
            type: "number",
            description: "Random seed for reproducibility (random if not specified)",
        },
        width: {
            type: "number",
            description: "Image width (256-2048, must be divisible by 8, default: 1024)",
            minimum: 256,
            maximum: 2048,
        },
        height: {
            type: "number",
            description: "Image height (256-2048, must be divisible by 8, default: 1024)",
            minimum: 256,
            maximum: 2048,
        },
        steps: {
            type: "number",
            description: "Sampling steps (1-100, default: 20)",
            minimum: 1,
            maximum: 100,
        },
        guidance: {
            type: "number",
            description: "CFG guidance scale (0-20, default: 4.0)",
            minimum: 0,
            maximum: 20,
        },
        reference_images: {
            type: "array",
            items: { type: "string" },
            description: "Array of base64-encoded reference images for editing mode (0-10 images). When provided, the model edits based on these references.",
        },
    },
    required: ["prompt"],
    additionalProperties: false,
});

const flux2Klein4BEditInputSchema = jsonSchema<Flux2Klein4BEditInput>({
    type: "object",
    title: "Flux2Klein4BEditInput",
    description: "Input for FLUX.2 Klein 4B local image editing",
    properties: {
        prompt: {
            type: "string",
            description: "Text prompt describing the edits to make",
        },
        source_image_urls: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
            description: "Array of source image URLs or base64 data for editing (1-10 images).",
        },
        seed: {
            type: "number",
            description: "Random seed for reproducibility (random if not specified)",
        },
        width: {
            type: "number",
            description: "Image width (256-2048, must be divisible by 8, default: 1024)",
            minimum: 256,
            maximum: 2048,
        },
        height: {
            type: "number",
            description: "Image height (256-2048, must be divisible by 8, default: 1024)",
            minimum: 256,
            maximum: 2048,
        },
        steps: {
            type: "number",
            description: "Sampling steps (1-100, default: 20)",
            minimum: 1,
            maximum: 100,
        },
        guidance: {
            type: "number",
            description: "CFG guidance scale (0-20, default: 4.0)",
            minimum: 0,
            maximum: 20,
        },
    },
    required: ["prompt", "source_image_urls"],
    additionalProperties: false,
});

const flux2Klein4BReferenceInputSchema = jsonSchema<Flux2Klein4BReferenceInput>({
    type: "object",
    title: "Flux2Klein4BReferenceInput",
    description: "Input for FLUX.2 Klein 4B reference-guided generation",
    properties: {
        prompt: {
            type: "string",
            description: "Text prompt describing the image to generate",
        },
        reference_image_urls: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
            description: "Array of reference image URLs or base64 data (1-10 images).",
        },
        seed: {
            type: "number",
            description: "Random seed for reproducibility (random if not specified)",
        },
        width: {
            type: "number",
            description: "Image width (256-2048, must be divisible by 8, default: 1024)",
            minimum: 256,
            maximum: 2048,
        },
        height: {
            type: "number",
            description: "Image height (256-2048, must be divisible by 8, default: 1024)",
            minimum: 256,
            maximum: 2048,
        },
        steps: {
            type: "number",
            description: "Sampling steps (1-100, default: 20)",
            minimum: 1,
            maximum: 100,
        },
        guidance: {
            type: "number",
            description: "CFG guidance scale (0-20, default: 4.0)",
            minimum: 0,
            maximum: 20,
        },
    },
    required: ["prompt", "reference_image_urls"],
    additionalProperties: false,
});

/**
 * Create the FLUX.2 Klein 4B generation tool
 * @param sessionId - Session ID for saving generated images to local storage
 */
export function createFlux2Klein4BGenerateTool(sessionId: string) {
    return tool({
        description: `Generate or edit images using local FLUX.2 Klein 4B model via ComfyUI.

This is a fast, high-quality 4-billion parameter model running locally.
Supports dual modes:
- **Text-to-Image**: Generate images from text prompts (no reference_images)
- **Image Editing**: Edit images using reference images + prompt (with reference_images)

Requires Docker, NVIDIA GPU with ~12GB VRAM.

### Parameters
- **prompt** (required): Text description of the image or edit to make
- **seed** (optional): Random seed for reproducibility
- **width/height** (optional): Image dimensions (default: 1024x1024, must be divisible by 8)
- **steps** (optional): Sampling steps (default: 20)
- **guidance** (optional): CFG scale (default: 4.0)
- **reference_images** (optional): Array of base64 images for editing mode (max 10)

### Generation Time
- Text-to-image: ~7-8 seconds at 1024x1024
- Image editing: ~10-14 seconds`,

        inputSchema: flux2Klein4BInputSchema,

        execute: async (input): Promise<Flux2Klein4BGenerateOutput> => {
            return executeFlux2Klein4B(sessionId, input);
        },
    });
}

/**
 * Create the FLUX.2 Klein 4B edit tool
 * @param sessionId - Session ID for saving generated images to local storage
 */
export function createFlux2Klein4BEditTool(sessionId: string) {
    return tool({
        description: `Edit one or more images using local FLUX.2 Klein 4B model via ComfyUI.

Provide source images and an edit prompt to transform or refine them.
Supports multiple source images for composition or style mixing.

### Parameters
- **prompt** (required): Edit instructions
- **source_image_urls** (required): Array of images to edit (1-10)
- **seed** (optional): Random seed for reproducibility
- **width/height** (optional): Output dimensions (default: 1024x1024)
- **steps** (optional): Sampling steps (default: 20)
- **guidance** (optional): CFG scale (default: 4.0)`,

        inputSchema: flux2Klein4BEditInputSchema,

        execute: async (input): Promise<Flux2Klein4BGenerateOutput> => {
            return executeFlux2Klein4B(sessionId, {
                prompt: input.prompt,
                seed: input.seed,
                width: input.width,
                height: input.height,
                steps: input.steps,
                guidance: input.guidance,
                reference_images: input.source_image_urls,
            });
        },
    });
}

/**
 * Create the FLUX.2 Klein 4B reference tool
 * @param sessionId - Session ID for saving generated images to local storage
 */
export function createFlux2Klein4BReferenceTool(sessionId: string) {
    return tool({
        description: `Generate images guided by reference images using local FLUX.2 Klein 4B model via ComfyUI.

Use reference images for style, composition, or subject guidance.
Supports multiple reference images.

### Parameters
- **prompt** (required): Generation instructions
- **reference_image_urls** (required): Array of reference images (1-10)
- **seed** (optional): Random seed for reproducibility
- **width/height** (optional): Output dimensions (default: 1024x1024)
- **steps** (optional): Sampling steps (default: 20)
- **guidance** (optional): CFG scale (default: 4.0)`,

        inputSchema: flux2Klein4BReferenceInputSchema,

        execute: async (input): Promise<Flux2Klein4BGenerateOutput> => {
            return executeFlux2Klein4B(sessionId, {
                prompt: input.prompt,
                seed: input.seed,
                width: input.width,
                height: input.height,
                steps: input.steps,
                guidance: input.guidance,
                reference_images: input.reference_image_urls,
            });
        },
    });
}
