import { tool, jsonSchema } from "ai";
import { callImagenEdit, isAsyncResult } from "@/lib/image-edit/client";
import { callFlux2Generate } from "@/lib/ai/flux2-client";
import {
  callWan22Imagen,
  isAsyncResult as isWan22ImagenAsyncResult,
} from "@/lib/ai/wan22-imagen-client";
import { createToolRun, updateToolRun, createImage } from "@/lib/db/queries";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

// Re-export shared utilities from image-tools-utils
export { imageToDataUrl, createDescribeImageTool } from "@/lib/ai/tools/image-tools-utils";

// Helper to get current timestamp as ISO string for SQLite
const now = () => new Date().toISOString();

// ==========================================================================
// Shared schema definitions
// ==========================================================================

const imageEditSchema = jsonSchema<{
  prompt: string;
  image_url: string;
  second_image_url?: string;
  temperature?: number;
}>({
  type: "object",
  title: "ImageEditInput",
  description: "Input schema for image editing and virtual try-on",
  properties: {
    prompt: {
      type: "string",
      description:
        "Instructions for how to edit the image. Be specific about what to change. For single image edits, describe the modification. For two-image combinations, describe how to blend elements.",
    },
    image_url: {
      type: "string",
      format: "uri",
      description: "URL of the main image to edit (required)",
    },
    second_image_url: {
      type: "string",
      format: "uri",
      description:
        "Optional URL of a second image to combine elements from (e.g., apply texture/style from this image to the main image)",
    },
    temperature: {
      type: "number",
      minimum: 0,
      maximum: 2,
      default: 1.0,
      description:
        "Creativity level for edits (0-2). Higher values produce more varied results. Default: 1.0",
    },
  },
  required: ["prompt", "image_url"],
  additionalProperties: false,
});

// Flux2 Image Generation Tool Schema
const flux2GenerateSchema = jsonSchema<{
  prompt: string;
  width?: number;
  height?: number;
  guidance?: number;
  steps?: number;
  seed?: number;
  referenceImages?: string[];
}>({
  type: "object",
  title: "Flux2GenerateInput",
  description: "Input schema for Flux2 image generation",
  properties: {
    prompt: {
      type: "string",
      description:
        "Text description of the image to generate. Be detailed and specific about the style, composition, lighting, and subjects you want in the image.",
    },
    width: {
      type: "number",
      minimum: 256,
      maximum: 2048,
      default: 1024,
      description:
        "Image width in pixels (256-2048, must be divisible by 8). Default is 1024.",
    },
    height: {
      type: "number",
      minimum: 256,
      maximum: 2048,
      default: 1024,
      description:
        "Image height in pixels (256-2048, must be divisible by 8). Default is 1024.",
    },
    guidance: {
      type: "number",
      minimum: 0.0,
      maximum: 20.0,
      default: 4.0,
      description:
        "Guidance scale (0.0-20.0). Higher values make the image more closely follow the prompt. Default is 4.0.",
    },
    steps: {
      type: "number",
      minimum: 1,
      maximum: 100,
      default: 20,
      description:
        "Number of sampling steps (1-100). More steps generally produce higher quality but take longer. Default is 20.",
    },
    seed: {
      type: "number",
      description:
        "Optional seed for reproducibility. If not provided, a random seed will be used.",
    },
    referenceImages: {
      type: "array",
      items: { type: "string" },
      minItems: 0,
      maxItems: 10,
      description:
        "Optional array of reference image URLs (0-10 images) to guide the generation. Can be used for style reference, composition guidance, or subject reference.",
    },
  },
  required: ["prompt"],
  additionalProperties: false,
});

const wan22ImagenSchema = jsonSchema<{
  positive: string;
  negative?: string;
  width?: 512 | 768 | 1024 | 1536;
  height?: 512 | 768 | 1024 | 1344 | 1536;
  seed?: number;
}>({
  type: "object",
  title: "Wan22ImagenInput",
  description: "Input schema for Wan22 image generation",
  properties: {
    positive: {
      type: "string",
      description:
        "Text prompt describing the image to generate. Be detailed about style, composition, lighting, and subjects.",
    },
    negative: {
      type: "string",
      description:
        "Negative prompt to avoid certain features. Default includes Chinese quality-related terms.",
    },
    width: {
      type: "number",
      enum: [512, 768, 1024, 1536],
      default: 768,
      description: "Image width in pixels. Default is 768.",
    },
    height: {
      type: "number",
      enum: [512, 768, 1024, 1344, 1536],
      default: 1344,
      description: "Image height in pixels. Default is 1344.",
    },
    seed: {
      type: "number",
      description:
        "Optional seed for reproducibility. If not provided, a random seed will be used.",
    },
  },
  required: ["positive"],
  additionalProperties: false,
});

// ==========================================================================
// Image Edit Tool
// ==========================================================================

// Args interface for imageEdit
interface ImageEditArgs {
  prompt: string;
  image_url: string;
  second_image_url?: string;
  temperature?: number;
}

/**
 * Core imageEdit execution logic (extracted for logging wrapper)
 */
async function executeImageEdit(
  sessionId: string,
  args: ImageEditArgs
) {
  const { prompt, image_url, second_image_url, temperature } = args;
  const effectiveTemperature = temperature ?? 1.0;

  // Create tool run record
  const toolRun = await createToolRun({
    sessionId,
    toolName: "editImage",
    args: { prompt, image_url, second_image_url, temperature: effectiveTemperature },
    status: "running",
  });

  try {
    const result = await callImagenEdit(
      second_image_url
        ? {
          prompt,
          imageUrl: image_url,
          secondImageUrl: second_image_url,
          temperature: effectiveTemperature,
        }
        : {
          prompt,
          imageUrl: image_url,
          temperature: effectiveTemperature,
        },
      sessionId
    );

    if (isAsyncResult(result)) {
      await updateToolRun(toolRun.id, {
        status: "pending",
        metadata: { jobId: result.jobId, statusUrl: result.statusUrl },
      });

      return {
        status: "processing",
        message:
          "Image edit job started. The result will be available shortly.",
        jobId: result.jobId,
      };
    }

    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url,
        url: img.url,
        width: img.width,
        height: img.height,
        format: img.format,
        metadata: { prompt },
      });
    }

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: { images: result.images },
      completedAt: now(),
    });

    return {
      status: "completed",
      images: result.images,
      text: result.text,
      timeTaken: result.timeTaken,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateToolRun(toolRun.id, {
      status: "failed",
      error: errorMessage,
      completedAt: now(),
    });

    return {
      status: "error",
      error: errorMessage,
    };
  }
}

export function createImageEditTool(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "editImage",
    sessionId,
    (args: ImageEditArgs) => executeImageEdit(sessionId, args)
  );

  return tool({
    description: `Edit images with text instructions, create variations, or combine elements from two images. Use searchTools first for parameters.`,
    inputSchema: imageEditSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// Flux2 Generate Tool
// ==========================================================================

/**
 * Options for creating the Flux2 generate tool
 */
export interface Flux2GenerateToolOptions {
  /** The character's avatar URL to use as a reference when generating images of themselves */
  characterAvatarUrl?: string;
  /** Description of the character's appearance */
  characterAppearanceDescription?: string;
}

// Args interface for flux2Generate
interface Flux2GenerateArgs {
  prompt: string;
  width?: number;
  height?: number;
  guidance?: number;
  steps?: number;
  seed?: number;
  referenceImages?: string[];
}

/**
 * Core flux2Generate execution logic (extracted for logging wrapper)
 */
async function executeFlux2Generate(
  sessionId: string,
  characterAvatarUrl: string | undefined,
  args: Flux2GenerateArgs
) {
  const { prompt, width, height, guidance, steps, seed, referenceImages } = args;

  const effectiveWidth = width ?? 1024;
  const effectiveHeight = height ?? 1024;

  if (effectiveWidth % 8 !== 0 || effectiveHeight % 8 !== 0) {
    return {
      status: "error",
      error: "Width and height must be divisible by 8",
    };
  }

  let effectiveReferenceImages = referenceImages || [];

  if (characterAvatarUrl && !effectiveReferenceImages.includes(characterAvatarUrl)) {
    const selfReferenceKeywords = [
      "myself", "me ", " me", "my ", " my", "i am", "i'm", "include me",
      "put me", "show me", "draw me", "generate me", "create me",
      "with me", "of me", "portrait of me", "picture of me", "image of me"
    ];
    const promptLower = prompt.toLowerCase();
    const shouldIncludeSelf = selfReferenceKeywords.some(keyword =>
      promptLower.includes(keyword)
    );

    if (shouldIncludeSelf) {
      effectiveReferenceImages = [characterAvatarUrl, ...effectiveReferenceImages];
      console.log(`[FLUX2 TOOL] Auto-including character avatar as reference: ${characterAvatarUrl}`);
    }
  }

  const toolRun = await createToolRun({
    sessionId,
    toolName: "generateImageFlux2",
    args: { prompt, width: effectiveWidth, height: effectiveHeight, guidance, steps, seed, referenceImages: effectiveReferenceImages },
    status: "running",
  });

  try {
    const result = await callFlux2Generate(
      {
        prompt,
        width: effectiveWidth,
        height: effectiveHeight,
        guidance,
        steps,
        seed,
        referenceImages: effectiveReferenceImages.length > 0 ? effectiveReferenceImages : undefined,
      },
      sessionId
    );

    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url,
        url: img.url,
        width: img.width,
        height: img.height,
        format: img.format,
        metadata: { prompt, seed: result.seed },
      });
    }

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: { images: result.images, seed: result.seed },
      completedAt: now(),
    });

    return {
      status: "completed",
      images: result.images,
      seed: result.seed,
      timeTaken: result.timeTaken,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateToolRun(toolRun.id, {
      status: "failed",
      error: errorMessage,
      completedAt: now(),
    });

    return {
      status: "error",
      error: errorMessage,
    };
  }
}

export function createFlux2GenerateTool(sessionId: string, options?: Flux2GenerateToolOptions) {
  const { characterAvatarUrl, characterAppearanceDescription } = options || {};

  const executeWithLogging = withToolLogging(
    "generateImageFlux2",
    sessionId,
    (args: Flux2GenerateArgs) => executeFlux2Generate(sessionId, characterAvatarUrl, args)
  );

  let toolDescription = `Generate or edit images with Flux2. Use searchTools first for full parameters and edit detection rules.`;

  if (characterAvatarUrl) {
    toolDescription += ` Your avatar URL: ${characterAvatarUrl}`;
    if (characterAppearanceDescription) {
      toolDescription += ` (${characterAppearanceDescription})`;
    }
  }

  return tool({
    description: toolDescription,
    inputSchema: flux2GenerateSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// WAN 2.2 IMAGEN TOOL (Text-to-Image with LoRA)
// ==========================================================================

// Args interface for wan22Imagen
interface Wan22ImagenArgs {
  positive: string;
  negative?: string;
  width?: 512 | 768 | 1024 | 1536;
  height?: 512 | 768 | 1024 | 1344 | 1536;
  seed?: number;
}

/**
 * Core wan22Imagen execution logic (extracted for logging wrapper)
 */
async function executeWan22Imagen(sessionId: string, args: Wan22ImagenArgs) {
  const { positive, negative, width, height, seed } = args;

  const toolRun = await createToolRun({
    sessionId,
    toolName: "generateImageWan22",
    args: { positive, negative, width, height, seed },
    status: "running",
  });

  try {
    const result = await callWan22Imagen(
      {
        positive,
        negative,
        width,
        height,
        seed,
      },
      sessionId
    );

    if (isWan22ImagenAsyncResult(result)) {
      await updateToolRun(toolRun.id, {
        status: "pending",
        metadata: { jobId: result.jobId, statusUrl: result.statusUrl },
      });

      return {
        status: "processing",
        message: "WAN 2.2 image generation job started. The result will be available shortly.",
        jobId: result.jobId,
      };
    }

    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url,
        url: img.url,
        width: img.width,
        height: img.height,
        format: img.format,
        metadata: { prompt: positive },
      });
    }

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: { images: result.images },
      completedAt: now(),
    });

    return {
      status: "completed",
      images: result.images,
      timeTaken: result.timeTaken,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    await updateToolRun(toolRun.id, {
      status: "failed",
      error: errorMessage,
      completedAt: now(),
    });

    return {
      status: "error",
      error: errorMessage,
    };
  }
}

export function createWan22ImagenTool(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "generateImageWan22",
    sessionId,
    (args: Wan22ImagenArgs) => executeWan22Imagen(sessionId, args)
  );

  return tool({
    description: `Generate anime-style or artistic images with WAN 2.2. Use searchTools first for parameters.`,
    inputSchema: wan22ImagenSchema,
    execute: executeWithLogging,
  });
}
