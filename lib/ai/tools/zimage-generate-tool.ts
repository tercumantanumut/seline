/**
 * Z-Image Turbo FP8 Generation Tool
 * 
 * Local image generation tool using ComfyUI with Z-Image Turbo FP8 model.
 * Provides fast, high-quality text-to-image generation.
 */

import { tool, jsonSchema } from "ai";
import { generateImage, checkStatus } from "@/lib/comfyui";

interface ZImageGenerateInput {
    prompt: string;
    seed?: number;
    width?: number;
    height?: number;
    steps?: number;
    cfg?: number;
    lora_strength?: number;
}

interface ZImageGenerateOutput {
    status: "completed" | "processing" | "error";
    images?: Array<{ url: string }>;
    promptId?: string;
    seed?: number;
    error?: string;
}

// Define the schema outside the function
const zImageInputSchema = jsonSchema<ZImageGenerateInput>({
    type: "object",
    title: "ZImageGenerateInput",
    description: "Input for Z-Image Turbo FP8 local image generation",
    properties: {
        prompt: {
            type: "string",
            description: "Text prompt describing the image to generate",
        },
        seed: {
            type: "number",
            description: "Random seed (-1 for random)",
        },
        width: {
            type: "number",
            description: "Image width (512-2048)",
            minimum: 512,
            maximum: 2048,
        },
        height: {
            type: "number",
            description: "Image height (512-2048)",
            minimum: 512,
            maximum: 2048,
        },
        steps: {
            type: "number",
            description: "Sampling steps (1-50, default: 9)",
            minimum: 1,
            maximum: 50,
        },
        cfg: {
            type: "number",
            description: "CFG scale (0.1-10, default: 1.0)",
        },
        lora_strength: {
            type: "number",
            description: "LoRA strength (0-2, default: 0.5)",
        },
    },
    required: ["prompt"],
    additionalProperties: false,
});

/**
 * Create the Z-Image generation tool
 */
export function createZImageGenerateTool() {
    return tool({
        description: `Generate images using local Z-Image Turbo FP8 model via ComfyUI.
    
This is a fast, high-quality text-to-image model running locally. 
Optimized for 9 steps with CFG 1.0. Requires Docker and NVIDIA GPU.

### Parameters
- **prompt** (required): Text description of the image to generate
- **seed** (optional): Random seed for reproducibility (-1 for random)
- **width/height** (optional): Image dimensions (default: 1024x1024)
- **steps** (optional): Sampling steps (default: 9, optimized for Z-Image)
- **cfg** (optional): CFG scale (default: 1.0)
- **lora_strength** (optional): Z-Image Detailer LoRA strength (default: 0.5)`,

        inputSchema: zImageInputSchema,

        execute: async (input): Promise<ZImageGenerateOutput> => {
            try {
                // Generate image
                const result = await generateImage({
                    positive_prompt: input.prompt,
                    seed: input.seed ?? -1,
                    width: input.width ?? 1024,
                    height: input.height ?? 1024,
                    steps: input.steps ?? 9,
                    cfg: input.cfg ?? 1.0,
                    lora_strength: input.lora_strength ?? 0.5,
                    return_base64: false,
                });

                // If async (queued), poll for completion
                if (result.status === "queued" || result.status === "processing") {
                    // Poll for result (max 5 minutes)
                    const maxAttempts = 30;
                    let attempts = 0;

                    while (attempts < maxAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10s
                        attempts++;

                        const statusResult = await checkStatus(result.prompt_id);

                        if (statusResult.status === "completed") {
                            const imageUrl = statusResult.images?.[0];
                            return {
                                status: "completed",
                                images: imageUrl ? [{ url: imageUrl }] : undefined,
                                promptId: result.prompt_id,
                                seed: statusResult.seed,
                            };
                        }

                        if (statusResult.status === "failed") {
                            return {
                                status: "error",
                                error: statusResult.error || "Generation failed",
                                promptId: result.prompt_id,
                            };
                        }
                    }

                    return {
                        status: "error",
                        error: "Generation timed out after 5 minutes",
                        promptId: result.prompt_id,
                    };
                }

                // Immediate result
                const imageUrl = result.images?.[0];
                return {
                    status: "completed",
                    images: imageUrl ? [{ url: imageUrl }] : undefined,
                    promptId: result.prompt_id,
                    seed: result.seed,
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

