/**
 * FLUX.2 Klein 9B Generation Tool
 * 
 * Local image generation tool using ComfyUI with FLUX.2 Klein 9B model.
 * Supports both text-to-image generation and image editing with reference images.
 * Higher quality output compared to 4B variant.
 * 
 * Ports: API 5052, ComfyUI 8085
 * VRAM: ~16GB+ recommended
 */

import { tool, jsonSchema } from "ai";
import {
    generateFlux2KleinWithPolling,
    checkFlux2KleinHealth,
} from "@/lib/comfyui";
import { saveBase64Image } from "@/lib/storage/local-storage";

interface Flux2Klein9BGenerateInput {
    prompt: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    guidance?: number;
    reference_images?: string[];
}

interface Flux2Klein9BGenerateOutput {
    status: "completed" | "processing" | "error";
    images?: Array<{ url: string }>;
    jobId?: string;
    seed?: number;
    timeTaken?: number;
    error?: string;
}

// Define the schema for the tool
const flux2Klein9BInputSchema = jsonSchema<Flux2Klein9BGenerateInput>({
    type: "object",
    title: "Flux2Klein9BGenerateInput",
    description: "Input for FLUX.2 Klein 9B local image generation",
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

/**
 * Create the FLUX.2 Klein 9B generation tool
 * @param sessionId - Session ID for saving generated images to local storage
 */
export function createFlux2Klein9BGenerateTool(sessionId: string) {
    return tool({
        description: `Generate or edit images using local FLUX.2 Klein 9B model via ComfyUI.

This is a high-quality 9-billion parameter model running locally.
Produces more detailed output compared to the 4B variant.
Supports dual modes:
- **Text-to-Image**: Generate images from text prompts (no reference_images)
- **Image Editing**: Edit images using reference images + prompt (with reference_images)

Requires Docker, NVIDIA GPU with ~16GB+ VRAM.

### Parameters
- **prompt** (required): Text description of the image or edit to make
- **seed** (optional): Random seed for reproducibility
- **width/height** (optional): Image dimensions (default: 1024x1024, must be divisible by 8)
- **steps** (optional): Sampling steps (default: 20)
- **guidance** (optional): CFG scale (default: 4.0)
- **reference_images** (optional): Array of base64 images for editing mode (max 10)

### Generation Time
- Text-to-image: ~10-12 seconds at 1024x1024
- Image editing: ~14-18 seconds`,

        inputSchema: flux2Klein9BInputSchema,

        execute: async (input): Promise<Flux2Klein9BGenerateOutput> => {
            try {
                // Check if API is healthy first
                const health = await checkFlux2KleinHealth("9b");
                if (!health) {
                    return {
                        status: "error",
                        error: "FLUX.2 Klein 9B API is not available. Ensure Docker container is running on port 5052.",
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
                const result = await generateFlux2KleinWithPolling("9b", {
                    prompt: input.prompt,
                    seed: input.seed,
                    width,
                    height,
                    steps: input.steps ?? 20,
                    guidance: input.guidance ?? 4.0,
                    reference_images: input.reference_images,
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
        },
    });
}

