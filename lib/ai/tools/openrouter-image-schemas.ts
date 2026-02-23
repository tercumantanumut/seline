import { jsonSchema } from "ai";

// ==========================================================================
// OpenRouter Image Generation Shared Schemas and Types
// ==========================================================================

export interface OpenRouterImageGenerationArgs {
  prompt: string;
  aspect_ratio?: string;  // "1:1", "16:9", "9:16", etc.
}

export interface OpenRouterImageEditingArgs {
  prompt: string;                    // Edit instructions
  source_image_urls: string[];       // Array of Base64 data URLs or HTTP URLs
  mask_url?: string;                 // Optional mask for inpainting
  aspect_ratio?: string;
}

export interface OpenRouterImageReferencingArgs {
  prompt: string;                    // Generation instructions
  reference_image_urls: string[];    // Array of style/content references
  reference_strength?: number;       // 0.0-1.0 (if supported by model)
  aspect_ratio?: string;
}

export const openRouterGenerateSchema = jsonSchema<OpenRouterImageGenerationArgs>({
  type: "object",
  title: "OpenRouterGenerateInput",
  description: "Input schema for OpenRouter image generation",
  properties: {
    prompt: { type: "string", description: "Text description of the image to generate" },
    aspect_ratio: { type: "string", description: "Aspect ratio (optional)", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"] }
  },
  required: ["prompt"],
  additionalProperties: false,
});

export const openRouterEditSchema = jsonSchema<OpenRouterImageEditingArgs>({
  type: "object",
  title: "OpenRouterEditInput",
  description: "Input schema for OpenRouter image editing",
  properties: {
    prompt: { type: "string", description: "Edit instructions for the images" },
    source_image_urls: { type: "array", items: { type: "string" }, description: "Array of source image URLs or base64 data URLs to edit (supports multiple images)" },
    mask_url: { type: "string", description: "Optional mask URL for inpainting (white = edit, black = preserve)" },
    aspect_ratio: { type: "string", description: "Aspect ratio (optional)", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"] }
  },
  required: ["prompt", "source_image_urls"],
  additionalProperties: false,
});

export const openRouterReferenceSchema = jsonSchema<OpenRouterImageReferencingArgs>({
  type: "object",
  title: "OpenRouterReferenceInput",
  description: "Input schema for OpenRouter reference-guided image generation",
  properties: {
    prompt: { type: "string", description: "Generation instructions guided by the reference images" },
    reference_image_urls: { type: "array", items: { type: "string" }, description: "Array of reference image URLs or base64 data URLs for style/content guidance (supports multiple images)" },
    reference_strength: { type: "number", description: "Reference influence strength (0.0-1.0, optional)", minimum: 0, maximum: 1 },
    aspect_ratio: { type: "string", description: "Aspect ratio (optional)", enum: ["1:1", "16:9", "9:16", "4:3", "3:4"] }
  },
  required: ["prompt", "reference_image_urls"],
  additionalProperties: false,
});

// OpenRouter Model Constants
export const OPENROUTER_MODELS = {
  FLUX2_FLEX: "black-forest-labs/flux.2-flex",
  GPT5_IMAGE_MINI: "openai/gpt-5-image-mini",
  GPT5_IMAGE: "openai/gpt-5-image",
  GEMINI_25_FLASH_IMAGE: "google/gemini-2.5-flash-image",
  GEMINI_3_PRO_IMAGE: "google/gemini-3-pro-image-preview",
} as const;
