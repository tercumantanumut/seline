import { tool, jsonSchema, generateText, type ToolExecutionOptions } from "ai";
import { callImagenEdit, isAsyncResult } from "@/lib/image-edit/client";
import { callFlux2Generate } from "@/lib/ai/flux2-client";
import {
  callWan22Imagen,
  isAsyncResult as isWan22ImagenAsyncResult,
} from "@/lib/ai/wan22-imagen-client";
import {
  callWan22Video,
  isAsyncResult as isWan22VideoAsyncResult,
} from "@/lib/ai/wan22-video-client";
import { createToolRun, updateToolRun, createImage } from "@/lib/db/queries";
import { searchAgentDocumentsForCharacter } from "@/lib/documents/embeddings";
import { getVisionModel } from "@/lib/ai/providers";
import { readLocalFile, fileExists, saveBase64Image } from "@/lib/storage/local-storage";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

// Helper to get current timestamp as ISO string for SQLite
const now = () => new Date().toISOString();

// Define JSON Schemas with explicit "type": "object" at root level
// This is required by the Anthropic API
// AI SDK v5 uses `inputSchema` instead of `parameters`

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

const describeImageSchema = jsonSchema<{
  imageUrl: string;
  focusAreas?: string[];
  analysisType?: string;
}>({
  type: "object",
  title: "DescribeImageInput",
  description: "Input schema for image analysis using vision AI",
  properties: {
    imageUrl: {
      type: "string",
      format: "uri",
      description: "URL of the image to analyze (can be a user photo, room image, product image, etc.)",
    },
    focusAreas: {
      type: "array",
      items: { type: "string" },
      description:
        "Specific areas to focus on (e.g., 'person appearance', 'clothing style', 'room layout', 'materials', 'lighting')",
    },
    analysisType: {
      type: "string",
      description:
        "Type of analysis to perform: 'person' for analyzing people/portraits, 'room' for interior spaces, 'product' for items/clothing, 'general' for any image. Default is 'general'.",
    },
  },
  required: ["imageUrl"],
  additionalProperties: false,
});

// ==========================================================================
// Agent Docs Search Tool
// ==========================================================================

interface DocsSearchToolOptions {
  /** Current authenticated user ID (owner of the agent and documents) */
  userId: string;
  /** Optional agent/character ID to scope the search. If missing, tool is disabled. */
  characterId?: string | null;
  /** Session ID for logging */
  sessionId?: string;
}

const docsSearchSchema = jsonSchema<{
  query: string;
  maxResults?: number;
  minSimilarity?: number;
}>({
  type: "object",
  title: "DocsSearchInput",
  description: "Input schema for searching agent documents and knowledge base",
  properties: {
    query: {
      type: "string",
      description:
        "Natural language query to search the agent's attached documents (PDF, text, Markdown, HTML). Use this to look up facts, policies, or domain knowledge.",
    },
    maxResults: {
      type: "number",
      minimum: 1,
      maximum: 20,
      default: 6,
      description:
        "Maximum number of passages to return (default: 6, max: 20).",
    },
    minSimilarity: {
      type: "number",
      minimum: 0,
      maximum: 1,
      default: 0.2,
      description:
        "Minimum cosine similarity threshold (0-1). Higher values return only very close matches.",
    },
  },
  required: ["query"],
  additionalProperties: false,
});

// Args interface for docsSearch
interface DocsSearchArgs {
  query: string;
  maxResults?: number;
  minSimilarity?: number;
}

/**
 * Core docsSearch execution logic (extracted for logging wrapper)
 */
async function executeDocsSearch(
  options: DocsSearchToolOptions,
  args: DocsSearchArgs
) {
  const { userId, characterId } = options;
  const { query, maxResults, minSimilarity } = args;

  if (!characterId) {
    return {
      status: "no_agent",
      query,
      hits: [],
      message:
        "Docs Search is only available inside an agent chat. Ask the user to select or create an agent before searching its documents.",
    };
  }

  const hits = await searchAgentDocumentsForCharacter({
    userId,
    characterId,
    query,
    options: {
      topK: maxResults,
      minSimilarity,
    },
  });

  if (!hits.length) {
    return {
      status: "no_results",
      query,
      hits: [],
      message:
        "No relevant document passages were found for this query in this agent's knowledge base.",
    };
  }

  const results = hits.map((hit) => ({
    documentId: hit.documentId,
    chunkId: hit.chunkId,
    chunkIndex: hit.chunkIndex,
    similarity: hit.similarity,
    text: hit.text,
    source: {
      originalFilename: hit.originalFilename,
      title: hit.title,
      description: hit.description,
      tags: hit.tags,
    },
  }));

  return {
    status: "success",
    query,
    hitCount: results.length,
    hits: results,
  };
}

export function createDocsSearchTool(options: DocsSearchToolOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "docsSearch",
    sessionId,
    (args: DocsSearchArgs) => executeDocsSearch(options, args)
  );

  return tool({
    description:
      "Search this agent's attached documents (PDF, text, Markdown, HTML) for relevant passages. Use this whenever you need authoritative information from the user's knowledge base.",
    inputSchema: docsSearchSchema,
    execute: executeWithLogging,
  });
}

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
    // Call the image edit API
    // image_url is the main image to edit
    // second_image_url is optional secondary image for combining elements
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
      // Async job started
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

    // Sync result - save images to database
    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url, // For external API, use URL as path
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
  // Wrap the execute function with logging
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

/**
 * Convert an image URL/path to a data URL for vision model input.
 * Handles local paths, remote URLs, and already-encoded data URLs.
 */
async function imageToDataUrl(imageSource: string): Promise<string> {
  // Already a data URL
  if (imageSource.startsWith("data:image/")) {
    return imageSource;
  }

  // Local media path - read from local storage
  if (imageSource.startsWith("/api/media/") || imageSource.startsWith("local-media://")) {
    let relativePath = imageSource;
    if (imageSource.startsWith("/api/media/")) {
      relativePath = imageSource.replace("/api/media/", "");
    } else if (imageSource.startsWith("local-media://")) {
      relativePath = imageSource.replace("local-media://", "").replace(/^\/+/, "");
    }

    if (!fileExists(relativePath)) {
      throw new Error(`Local image file not found: ${relativePath}`);
    }

    const buffer = readLocalFile(relativePath);
    const base64 = buffer.toString("base64");
    // Detect format from extension
    const ext = relativePath.split(".").pop()?.toLowerCase() || "png";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
    };
    const mimeType = mimeTypes[ext] || "image/png";
    return `data:${mimeType};base64,${base64}`;
  }

  // Remote URL - fetch and convert
  if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
    const response = await fetch(imageSource);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString("base64");
    // Try to get mime type from response headers
    const contentType = response.headers.get("content-type") || "image/png";
    return `data:${contentType};base64,${base64}`;
  }

  throw new Error(`Unsupported image format: ${imageSource.substring(0, 50)}...`);
}

// Args interface for describeImage
interface DescribeImageArgs {
  imageUrl: string;
  focusAreas?: string[];
  analysisType?: string;
}

// Result type for describeImage
interface DescribeImageResult {
  success: boolean;
  imageUrl: string;
  analysisType?: string;
  focusAreas?: string[];
  description?: string;
  error?: string;
  suggestion?: string;
}

/**
 * Core describeImage execution logic (extracted for logging wrapper)
 */
async function executeDescribeImage(args: DescribeImageArgs): Promise<DescribeImageResult> {
  const { imageUrl, focusAreas, analysisType } = args;

  console.log(`[describeImage] Analyzing image: ${imageUrl}`);
  console.log(`[describeImage] Focus areas: ${focusAreas?.join(", ") || "general"}`);
  console.log(`[describeImage] Analysis type: ${analysisType || "general"}`);

  try {
    // Convert image to data URL for vision model
    const imageDataUrl = await imageToDataUrl(imageUrl);
    console.log(`[describeImage] Image converted to data URL (${imageDataUrl.length} chars)`);

    // Build the analysis prompt based on type and focus areas
    const type = analysisType || "general";
    const areas = focusAreas || [];

    let systemPrompt = "You are an expert image analyst. Provide detailed, accurate descriptions of images.";
    let userPrompt = "";

    switch (type) {
      case "person":
        systemPrompt = "You are an expert at analyzing photos of people. Provide detailed, respectful descriptions focusing on visible characteristics that would be relevant for fashion, styling, or personalization purposes.";
        userPrompt = `Analyze this photo of a person. Describe:
1. Apparent gender presentation
2. Approximate age range
3. Body type and build
4. Skin tone
5. Hair color and style
6. Current clothing/outfit if visible
7. Overall style aesthetic
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}

Be factual and objective. This information will be used for personalized fashion recommendations.`;
        break;

      case "room":
        systemPrompt = "You are an expert interior designer and space analyst. Provide detailed descriptions of rooms and spaces.";
        userPrompt = `Analyze this room/space image. Describe:
1. Room type and purpose
2. Overall style and aesthetic
3. Color palette
4. Flooring type and condition
5. Wall treatments
6. Lighting (natural and artificial)
7. Key furniture pieces
8. Decorative elements
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}

Provide insights useful for interior design recommendations.`;
        break;

      case "product":
        systemPrompt = "You are an expert product analyst specializing in fashion, furniture, and consumer goods.";
        userPrompt = `Analyze this product image. Describe:
1. Product type/category
2. Color(s) and pattern
3. Material/fabric (if discernible)
4. Style characteristics
5. Brand indicators (if visible)
6. Quality indicators
7. Suitable use cases
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}

Provide details useful for matching this product with user preferences.`;
        break;

      default:
        userPrompt = `Analyze this image in detail. Describe:
1. Main subject(s)
2. Setting/environment
3. Colors and lighting
4. Notable details
5. Overall mood/aesthetic
${areas.length > 0 ? `\nPay special attention to: ${areas.join(", ")}` : ""}`;
    }

    // Call the vision model
    const visionModel = getVisionModel();
    console.log(`[describeImage] Calling vision model...`);

    const result = await generateText({
      model: visionModel,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: imageDataUrl },
            { type: "text", text: userPrompt },
          ],
        },
      ],
      temperature: 0.3, // Lower temperature for more factual descriptions
    });

    console.log(`[describeImage] Vision analysis complete (${result.text.length} chars)`);

    return {
      success: true,
      imageUrl,
      analysisType: type,
      focusAreas: areas,
      description: result.text,
    };
  } catch (error) {
    console.error(`[describeImage] Error analyzing image:`, error);
    return {
      success: false,
      imageUrl,
      error: error instanceof Error ? error.message : "Unknown error analyzing image",
      suggestion: "Please ensure the image URL is accessible and try again.",
    };
  }
}

export function createDescribeImageTool(sessionId?: string) {
  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "describeImage",
    sessionId,
    (args: DescribeImageArgs) => executeDescribeImage(args)
  );

  return tool({
    description: `Analyze and describe an image using vision AI. Use this tool to understand image content before making assumptions about people, rooms, products, or any visual content. ALWAYS use this tool to analyze user-uploaded photos before virtual try-on or personalized recommendations.`,
    inputSchema: describeImageSchema,
    execute: executeWithLogging,
  });
}

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

  // Validate dimensions are divisible by 8
  const effectiveWidth = width ?? 1024;
  const effectiveHeight = height ?? 1024;

  if (effectiveWidth % 8 !== 0 || effectiveHeight % 8 !== 0) {
    return {
      status: "error",
      error: "Width and height must be divisible by 8",
    };
  }

  // Combine character avatar with user-provided reference images if applicable
  // The character avatar is automatically included when the prompt suggests self-reference
  let effectiveReferenceImages = referenceImages || [];

  // If character has an avatar and the prompt suggests including themselves,
  // and the avatar isn't already in the reference images, add it
  if (characterAvatarUrl && !effectiveReferenceImages.includes(characterAvatarUrl)) {
    // Check if prompt suggests character should be in the image
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

  // Create tool run record
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

    // Save generated image to database
    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url, // For external API, use URL as path
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

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "generateImageFlux2",
    sessionId,
    (args: Flux2GenerateArgs) => executeFlux2Generate(sessionId, characterAvatarUrl, args)
  );

  // Build minimal description, with character context if available
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

// ============================================================================
// WAN 2.2 IMAGEN TOOL (Text-to-Image with LoRA)
// ============================================================================

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

  // Create tool run record
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
      // Async job started
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

    // Sync result - save images to database
    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url, // For external API, use URL as path
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
  // Wrap the execute function with logging
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

// ============================================================================
// WAN 2.2 VIDEO TOOL (Image-to-Video with PainterI2V)
// ============================================================================

const wan22VideoSchema = jsonSchema<{
  image_url?: string;
  base64_image?: string;
  positive: string;
  negative?: string;
  fps?: 10 | 15 | 21 | 24 | 30 | 60;
  duration?: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 5;
  seed?: number;
}>({
  type: "object",
  title: "Wan22VideoInput",
  description: "Input schema for Wan22 video generation",
  properties: {
    image_url: {
      type: "string",
      format: "uri",
      description:
        "URL of the input image to animate. Either image_url or base64_image must be provided.",
    },
    base64_image: {
      type: "string",
      description:
        "Base64-encoded input image (with or without data:image prefix). Either image_url or base64_image must be provided.",
    },
    positive: {
      type: "string",
      description:
        "Motion prompt describing desired video motion and camera movement. Be specific about actions, movements, and camera angles.",
    },
    negative: {
      type: "string",
      description:
        "Negative prompt for unwanted elements. Default: 'static, blurry, distorted'.",
    },
    fps: {
      type: "number",
      enum: [10, 15, 21, 24, 30, 60],
      default: 21,
      description: "Frames per second. Default is 21.",
    },
    duration: {
      type: "number",
      enum: [0.5, 1, 1.5, 2, 2.5, 3, 5],
      default: 2,
      description: "Video duration in seconds. Default is 2.0 seconds.",
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

// Args interface for wan22Video
interface Wan22VideoArgs {
  image_url?: string;
  base64_image?: string;
  positive: string;
  negative?: string;
  fps?: 10 | 15 | 21 | 24 | 30 | 60;
  duration?: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 5;
  seed?: number;
}

/**
 * Core wan22Video execution logic (extracted for logging wrapper)
 */
async function executeWan22Video(sessionId: string, args: Wan22VideoArgs) {
  const { image_url, base64_image, positive, negative, fps, duration, seed } = args;

  // Validate that at least one image input is provided
  if (!image_url && !base64_image) {
    return {
      status: "error",
      error: "Either image_url or base64_image must be provided",
    };
  }

  // Create tool run record
  const toolRun = await createToolRun({
    sessionId,
    toolName: "generateVideoWan22",
    args: { image_url, positive, negative, fps, duration, seed },
    status: "running",
  });

  try {
    // Note: motion_amplitude is always hard-coded to 1.0 in the client
    const result = await callWan22Video(
      {
        image_url,
        base64_image,
        positive,
        negative,
        fps,
        duration,
        seed,
      },
      sessionId
    );

    if (isWan22VideoAsyncResult(result)) {
      // Async job started
      await updateToolRun(toolRun.id, {
        status: "pending",
        metadata: { jobId: result.jobId, statusUrl: result.statusUrl },
      });

      return {
        status: "processing",
        message: "WAN 2.2 video generation job started. The result will be available shortly.",
        jobId: result.jobId,
      };
    }

    // Sync result - save video metadata to database
    // Note: We use the images table with format="mp4" for videos
    for (const video of result.videos) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: video.url, // For external API, use URL as path
        url: video.url,
        format: video.format,
        metadata: {
          prompt: positive,
          fps: video.fps,
          duration: video.duration,
          mediaType: "video",
        },
      });
    }

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: { videos: result.videos },
      completedAt: now(),
    });

    return {
      status: "completed",
      videos: result.videos,
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

export function createWan22VideoTool(sessionId: string) {
  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "generateVideoWan22",
    sessionId,
    (args: Wan22VideoArgs) => executeWan22Video(sessionId, args)
  );

  return tool({
    description: `Animate images into videos with WAN 2.2. Use searchTools first for parameters.`,
    inputSchema: wan22VideoSchema,
    execute: executeWithLogging,
  });
}

// ============================================================
// WAN 2.2 PIXEL VIDEO TOOL (Pixel Art Character Animation)
// ============================================================

const wan22PixelVideoSchema = jsonSchema<{
  image_url?: string;
  base64_image?: string;
  positive: string;
  negative?: string;
  fps?: 10 | 15 | 21 | 24 | 30 | 60;
  duration?: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 5;
  seed?: number;
  lora_name?: string;
  lora_strength?: number;
}>({
  type: "object",
  title: "Wan22PixelVideoInput",
  description: "Input schema for Wan22 pixel art video generation",
  properties: {
    image_url: {
      type: "string",
      format: "uri",
      description:
        "URL of the character sprite base image to animate. Either image_url or base64_image must be provided.",
    },
    base64_image: {
      type: "string",
      description:
        "Base64-encoded character sprite image (with or without data:image prefix). Either image_url or base64_image must be provided.",
    },
    positive: {
      type: "string",
      description:
        "Simple, natural animation prompt (1-2 sentences). Describe the overall motion naturally - DO NOT use technical phase breakdowns or frame-by-frame specs. Example: 'Pixel character performs a smooth walking cycle with arm swings, cape flutter, and dust particles from feet.'",
    },
    negative: {
      type: "string",
      description:
        "Negative prompt for unwanted elements (e.g., 'blurry, distorted, low quality').",
    },
    fps: {
      type: "number",
      enum: [10, 15, 21, 24, 30, 60],
      default: 21,
      description: "Frames per second. Use 21 or 24 for smooth animations (recommended). Avoid fps=10 as it produces choppy results.",
    },
    duration: {
      type: "number",
      enum: [0.5, 1, 1.5, 2, 2.5, 3, 5],
      default: 2,
      description: "Video duration in seconds. Default: 2.0",
    },
    seed: {
      type: "number",
      description:
        "Optional seed for reproducibility. If not provided, a random seed will be used.",
    },
    lora_name: {
      type: "string",
      description:
        "LoRA model name. Default: 'wan2.2_animate_adapter_epoch_95.safetensors'. DO NOT CHANGE.",
    },
    lora_strength: {
      type: "number",
      minimum: 0.0,
      maximum: 2.0,
      description: "LoRA strength (0.0-2.0). Default: 1.0. DO NOT CHANGE.",
    },
  },
  required: ["positive"],
  additionalProperties: false,
});

// Args interface for wan22PixelVideo
interface Wan22PixelVideoArgs {
  image_url?: string;
  base64_image?: string;
  positive: string;
  negative?: string;
  fps?: 10 | 15 | 21 | 24 | 30 | 60;
  duration?: 0.5 | 1 | 1.5 | 2 | 2.5 | 3 | 5;
  seed?: number;
  lora_name?: string;
  lora_strength?: number;
}

/**
 * Core wan22PixelVideo execution logic (extracted for logging wrapper)
 */
async function executeWan22PixelVideo(sessionId: string, args: Wan22PixelVideoArgs) {
  const {
    image_url,
    base64_image,
    positive,
    negative,
    fps,
    duration,
    seed,
    lora_name,
    lora_strength,
  } = args;

  // Validate that at least one image input is provided
  if (!image_url && !base64_image) {
    return {
      status: "error",
      error: "Either image_url or base64_image must be provided",
    };
  }

  // Create tool run record
  const toolRun = await createToolRun({
    sessionId,
    toolName: "generatePixelVideoWan22",
    args: {
      image_url,
      positive,
      negative,
      fps,
      duration,
      seed,
      lora_name,
      lora_strength,
    },
    status: "running",
  });

  try {
    // Call WAN 2.2 Video API with LoRA parameters
    const result = await callWan22Video(
      {
        image_url,
        base64_image,
        positive,
        negative,
        fps,
        duration,
        seed,
        lora_name: lora_name ?? "wan2.2_animate_adapter_epoch_95.safetensors",
        lora_strength: lora_strength ?? 1.0,
      },
      sessionId
    );

    if (isWan22VideoAsyncResult(result)) {
      // Async job started
      await updateToolRun(toolRun.id, {
        status: "pending",
        metadata: { jobId: result.jobId, statusUrl: result.statusUrl },
      });

      return {
        status: "processing",
        message:
          "WAN 2.2 pixel animation generation job started. The result will be available shortly.",
        jobId: result.jobId,
      };
    }

    // Sync result - save video metadata to database
    for (const video of result.videos) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: video.url,
        url: video.url,
        format: video.format,
        metadata: {
          prompt: positive,
          fps: video.fps,
          duration: video.duration,
          mediaType: "video",
          toolType: "pixel-animation",
        },
      });
    }

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: { videos: result.videos },
      completedAt: now(),
    });

    return {
      status: "completed",
      videos: result.videos,
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

export function createWan22PixelVideoTool(sessionId: string) {
  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "generatePixelVideoWan22",
    sessionId,
    (args: Wan22PixelVideoArgs) => executeWan22PixelVideo(sessionId, args)
  );

  return tool({
    description: `Generate pixel art character sprite animations with WAN 2.2. Use searchTools first for parameters.`,
    inputSchema: wan22PixelVideoSchema,
    execute: executeWithLogging,
  });
}

// ============================================================
// VIDEO ASSEMBLY TOOL
// ============================================================

const videoAssemblySchema = jsonSchema<{
  theme?: string;
  style?: string;
  targetDuration?: number;
  fps?: number;
  width?: number;
  height?: number;
  transitionDuration?: number;
  defaultTransition?: "fade" | "crossfade" | "slide" | "wipe" | "zoom" | "none";
  includeTextOverlays?: boolean;
  instructions?: string;
}>({
  type: "object",
  title: "VideoAssemblyInput",
  description: "Input schema for assembling videos from session images",
  properties: {
    theme: {
      type: "string",
      description:
        "Overall theme or concept for the video. Used by AI to plan scene sequencing.",
    },
    style: {
      type: "string",
      description:
        "Visual style (e.g., 'cinematic', 'documentary', 'dynamic', 'calm', 'energetic')",
    },
    targetDuration: {
      type: "number",
      minimum: 5,
      maximum: 300,
      default: 30,
      description:
        "Target video duration in seconds. Default: 30. Range: 5-300 seconds.",
    },
    fps: {
      type: "number",
      default: 30,
      minimum: 24,
      maximum: 60,
      description: "Frames per second (24, 30, or 60). Default: 30",
    },
    width: {
      type: "number",
      default: 1920,
      description: "Output video width. Default: 1920",
    },
    height: {
      type: "number",
      default: 1080,
      description: "Output video height. Default: 1080",
    },
    transitionDuration: {
      type: "number",
      minimum: 0.1,
      maximum: 3,
      default: 0.5,
      description: "Default transition duration in seconds. Default: 0.5",
    },
    defaultTransition: {
      type: "string",
      enum: ["fade", "crossfade", "slide", "wipe", "zoom", "none"],
      default: "crossfade",
      description: "Default transition type between scenes. Default: crossfade",
    },
    includeTextOverlays: {
      type: "boolean",
      default: true,
      description:
        "Whether to include AI-generated text overlays. Default: true",
    },
    instructions: {
      type: "string",
      description:
        "Additional instructions for the AI when planning the video (e.g., 'focus on the architectural details', 'create a story arc')",
    },
  },
  required: [],
  additionalProperties: false,
});

// Args interface for videoAssembly
interface VideoAssemblyArgs {
  theme?: string;
  style?: string;
  targetDuration?: number;
  fps?: number;
  width?: number;
  height?: number;
  transitionDuration?: number;
  defaultTransition?: "fade" | "crossfade" | "slide" | "wipe" | "zoom" | "none";
  includeTextOverlays?: boolean;
  instructions?: string;
}

/**
 * Core videoAssembly execution logic (extracted for logging wrapper)
 */
async function executeVideoAssembly(
  sessionId: string,
  args: VideoAssemblyArgs,
  toolCallOptions?: ToolExecutionOptions
) {
  const {
    theme,
    style,
    targetDuration,
    fps,
    width,
    height,
    transitionDuration,
    defaultTransition,
    includeTextOverlays,
    instructions,
  } = args;

  const { runVideoAssembly, DEFAULT_VIDEO_ASSEMBLY_CONFIG } = await import(
    "./video-assembly"
  );

  // Create tool run record
  const toolRun = await createToolRun({
    sessionId,
    toolName: "assembleVideo",
    args: {
      theme,
      style,
      targetDuration,
      fps,
      width,
      height,
      transitionDuration,
      defaultTransition,
      includeTextOverlays,
      instructions,
    },
    status: "running",
  });

  try {
    // Build config from inputs
    const config = {
      ...DEFAULT_VIDEO_ASSEMBLY_CONFIG,
      ...(fps && { fps }),
      ...(width && { outputWidth: width }),
      ...(height && { outputHeight: height }),
      ...(transitionDuration && { transitionDuration }),
      ...(defaultTransition && { defaultTransition }),
    };

    // Build input from parameters
    const input = {
      theme,
      style,
      targetDuration,
      includeTextOverlays: includeTextOverlays ?? true,
      userInstructions: instructions,
    };

    // Progress events collected during assembly
    const progressEvents: Array<{
      type: string;
      progress?: number;
      message?: string;
    }> = [];

    // Run the video assembly
    const result = await runVideoAssembly(
      sessionId,
      input,
      (event) => {
        // Collect progress events for logging
        if (event.type === "phase_change") {
          progressEvents.push({
            type: event.type,
            message: `Phase: ${event.phase} - ${event.message}`,
          });
        } else if (event.type === "render_progress") {
          progressEvents.push({
            type: event.type,
            progress: event.progress,
            message: `Rendering: ${event.progress}%`,
          });
        }
      },
      config,
      toolCallOptions?.abortSignal
    );

    // Save video metadata to database
    await createImage({
      sessionId,
      toolRunId: toolRun.id,
      role: "generated",
      localPath: result.outputLocalPath ?? result.outputUrl ?? "",
      url: result.outputUrl ?? "",
      width: result.plan?.outputWidth || width || 1920,
      height: result.plan?.outputHeight || height || 1080,
      format: config.outputFormat,
      metadata: {
        mediaType: "video",
        duration: result.plan?.totalDuration,
        fps: result.plan?.fps || fps || 30,
        sceneCount: result.plan?.scenes.length,
        concept: result.plan?.concept,
      },
    });

    // Build video object in same format as WAN2.2 video tool for UI compatibility
    const videoOutput = {
      url: result.outputUrl ?? "",
      format: config.outputFormat,
      fps: result.plan?.fps || fps || 30,
      duration: result.plan?.totalDuration || 0,
      width: result.plan?.outputWidth || width || 1920,
      height: result.plan?.outputHeight || height || 1080,
    };

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: {
        videos: [videoOutput],
        duration: result.plan?.totalDuration,
        sceneCount: result.plan?.scenes.length,
      },
      completedAt: now(),
    });

    return {
      status: "completed",
      // Include videos array for UI display (same format as WAN2.2 video tool)
      videos: [videoOutput],
      videoUrl: result.outputUrl,
      duration: result.plan?.totalDuration,
      sceneCount: result.plan?.scenes.length,
      concept: result.plan?.concept,
      narrative: result.plan?.narrative,
      message: `Successfully assembled ${result.plan?.scenes.length} scenes into a ${result.plan?.totalDuration}s video.`,
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      await updateToolRun(toolRun.id, {
        status: "cancelled",
        error: error.message,
        completedAt: now(),
      });

      return {
        status: "cancelled",
        error: error.message,
      };
    }
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

/**
 * Create Video Assembly Tool
 *
 * This tool allows AI agents to assemble images and videos generated during
 * a chat session into a cohesive, professionally-edited video.
 */
export function createVideoAssemblyTool(sessionId: string) {
  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "assembleVideo",
    sessionId,
    (args: VideoAssemblyArgs, toolCallOptions?: ToolExecutionOptions) =>
      executeVideoAssembly(sessionId, args, toolCallOptions)
  );

  return tool({
    description: `Assemble images and videos from this session into a cohesive video. Use searchTools first for full parameters.`,
    inputSchema: videoAssemblySchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// OpenRouter Image Generation Tools
// ==========================================================================

// Interfaces for OpenRouter Image Operations
interface OpenRouterImageGenerationArgs {
  prompt: string;
  aspect_ratio?: string;  // "1:1", "16:9", "9:16", etc.
}

interface OpenRouterImageEditingArgs {
  prompt: string;                    // Edit instructions
  source_image_urls: string[];       // Array of Base64 data URLs or HTTP URLs
  mask_url?: string;                 // Optional mask for inpainting
  aspect_ratio?: string;
}

interface OpenRouterImageReferencingArgs {
  prompt: string;                    // Generation instructions
  reference_image_urls: string[];    // Array of style/content references
  reference_strength?: number;       // 0.0-1.0 (if supported by model)
  aspect_ratio?: string;
}

// Schemas for OpenRouter Image Tools
const openRouterGenerateSchema = jsonSchema<OpenRouterImageGenerationArgs>({
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

const openRouterEditSchema = jsonSchema<OpenRouterImageEditingArgs>({
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

const openRouterReferenceSchema = jsonSchema<OpenRouterImageReferencingArgs>({
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

/**
 * Core execution function for OpenRouter image operations
 */
async function executeOpenRouterImage(
  sessionId: string,
  model: string,
  operation: "generate" | "edit" | "reference",
  args: OpenRouterImageGenerationArgs | OpenRouterImageEditingArgs | OpenRouterImageReferencingArgs
): Promise<{ status: "completed" | "error"; images?: Array<{ url: string }>; error?: string }> {
  const toolName = `${operation}ImageOpenRouter${model.replace(/[^a-zA-Z0-9]/g, "")}`;
  const toolRun = await createToolRun({
    sessionId,
    toolName,
    args: args as unknown as Record<string, unknown>,
    status: "running",
  });

  try {
    // Build messages array based on operation
    // IMPORTANT: Convert local paths (/api/media/...) to base64 data URLs before sending to external API
    let messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;

    if (operation === "generate") {
      messages = [{ role: "user", content: args.prompt }];
    } else if (operation === "edit") {
      const editArgs = args as OpenRouterImageEditingArgs;
      // Convert all local paths to base64 data URLs for external API
      const imageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      for (const imageUrl of editArgs.source_image_urls) {
        const imageDataUrl = await imageToDataUrl(imageUrl);
        imageContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
      }
      imageContent.push({ type: "text", text: editArgs.prompt });
      messages = [
        {
          role: "user",
          content: imageContent
        }
      ];
    } else { // reference
      const refArgs = args as OpenRouterImageReferencingArgs;
      // Convert all local paths to base64 data URLs for external API
      const imageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      for (const imageUrl of refArgs.reference_image_urls) {
        const imageDataUrl = await imageToDataUrl(imageUrl);
        imageContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
      }
      imageContent.push({ type: "text", text: refArgs.prompt });
      messages = [
        {
          role: "user",
          content: imageContent
        }
      ];
    }

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "https://styly-agent.com",
        "X-Title": "Styly Agent",
      },
      body: JSON.stringify({
        model,
        messages,
        modalities: ["image", "text"],
        stream: false,
        ...((args as OpenRouterImageGenerationArgs).aspect_ratio && {
          image_config: { aspect_ratio: (args as OpenRouterImageGenerationArgs).aspect_ratio }
        }),
      }),
    });

    if (!response.ok) {
      const err = await response.json() as { error?: { message?: string } };
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { images?: Array<{ image_url: { url: string } }> } }>
    };
    const rawImages = data.choices?.[0]?.message?.images || [];

    // Gemini 3 Pro (and occasionally others) can return identical duplicate images in a single response.
    // Deduplicate by URL fingerprint to avoid saving and rendering duplicates.
    const seen = new Set<string>();
    const images = rawImages.filter((img) => {
      const url = img?.image_url?.url;
      if (!url) return false;
      const key = url.startsWith("data:") ? url.substring(0, 200) : url;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (images.length !== rawImages.length) {
      console.log(
        `[OpenRouter Image] Deduplicated ${rawImages.length} -> ${images.length} images (model: ${model}, operation: ${operation})`
      );
    }

    if (images.length === 0) {
      throw new Error("No images returned from OpenRouter API");
    }

    // Process images: if base64 data URLs, save to local storage to avoid token bloat
    // This follows the same pattern as legacy tools (flux2-client, image-edit/client)
    const processedImages: Array<{ url: string; localPath: string }> = [];

    for (const img of images) {
      const rawUrl = img.image_url.url;

      if (rawUrl.startsWith("data:image/")) {
        // Base64 data URL - save to local storage
        // Extract format from data URL (e.g., "data:image/png;base64,..." -> "png")
        const formatMatch = rawUrl.match(/^data:image\/(\w+);base64,/);
        const format = formatMatch?.[1] || "png";

        const uploadResult = await saveBase64Image(
          rawUrl,
          sessionId,
          "generated",
          format
        );

        processedImages.push({
          url: uploadResult.url,
          localPath: uploadResult.localPath,
        });
      } else {
        // Regular URL - use as-is
        processedImages.push({
          url: rawUrl,
          localPath: rawUrl,
        });
      }
    }

    // Convert to the expected format: Array<{ url: string }> (matches legacy tools)
    // This is required for chat context extraction to work correctly
    const imageObjects = processedImages.map((img) => ({ url: img.url }));

    // Save to database with local paths
    for (const img of processedImages) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        url: img.url,
        localPath: img.localPath,
        metadata: { model, operation, prompt: args.prompt },
      });
    }

    await updateToolRun(toolRun.id, {
      status: "succeeded",
      result: { images: imageObjects },
      completedAt: now(),
    });

    return { status: "completed", images: imageObjects };

  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    await updateToolRun(toolRun.id, {
      status: "failed",
      error: msg,
      completedAt: now(),
    });
    return { status: "error", error: msg };
  }
}

// OpenRouter Model Constants
const OPENROUTER_MODELS = {
  FLUX2_FLEX: "black-forest-labs/flux.2-flex",
  GPT5_IMAGE_MINI: "openai/gpt-5-image-mini",
  GPT5_IMAGE: "openai/gpt-5-image",
  GEMINI_25_FLASH_IMAGE: "google/gemini-2.5-flash-image",
  GEMINI_3_PRO_IMAGE: "google/gemini-3-pro-image-preview",
} as const;

// ==========================================================================
// Flux.2 Flex Tools (black-forest-labs/flux.2-flex)
// ==========================================================================

export function createOpenRouterFlux2FlexGenerate(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "generateImageFlux2Flex",
    sessionId,
    (args: OpenRouterImageGenerationArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.FLUX2_FLEX, "generate", args)
  );

  return tool({
    description: "Generate images from text using Flux.2 Flex via OpenRouter. High-quality, versatile image generation.",
    inputSchema: openRouterGenerateSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterFlux2FlexEdit(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "editImageFlux2Flex",
    sessionId,
    (args: OpenRouterImageEditingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.FLUX2_FLEX, "edit", args)
  );

  return tool({
    description: "Edit one or more images using Flux.2 Flex via OpenRouter. Supports multiple source images for batch editing, transformation, or enhancement.",
    inputSchema: openRouterEditSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterFlux2FlexReference(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "referenceImageFlux2Flex",
    sessionId,
    (args: OpenRouterImageReferencingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.FLUX2_FLEX, "reference", args)
  );

  return tool({
    description: "Generate images guided by one or more reference images using Flux.2 Flex via OpenRouter. Supports multiple references for style transfer and content-guided generation.",
    inputSchema: openRouterReferenceSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// GPT-5 Image Mini Tools (openai/gpt-5-image-mini)
// ==========================================================================

export function createOpenRouterGpt5ImageMiniGenerate(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "generateImageGpt5Mini",
    sessionId,
    (args: OpenRouterImageGenerationArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GPT5_IMAGE_MINI, "generate", args)
  );

  return tool({
    description: "Generate images from text using GPT-5 Image Mini via OpenRouter. Fast, efficient image generation.",
    inputSchema: openRouterGenerateSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGpt5ImageMiniEdit(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "editImageGpt5Mini",
    sessionId,
    (args: OpenRouterImageEditingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GPT5_IMAGE_MINI, "edit", args)
  );

  return tool({
    description: "Edit one or more images using GPT-5 Image Mini via OpenRouter. Supports multiple source images for quick batch modifications.",
    inputSchema: openRouterEditSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGpt5ImageMiniReference(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "referenceImageGpt5Mini",
    sessionId,
    (args: OpenRouterImageReferencingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GPT5_IMAGE_MINI, "reference", args)
  );

  return tool({
    description: "Generate images guided by one or more reference images using GPT-5 Image Mini via OpenRouter. Supports multiple references.",
    inputSchema: openRouterReferenceSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// GPT-5 Image Tools (openai/gpt-5-image)
// ==========================================================================

export function createOpenRouterGpt5ImageGenerate(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "generateImageGpt5",
    sessionId,
    (args: OpenRouterImageGenerationArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GPT5_IMAGE, "generate", args)
  );

  return tool({
    description: "Generate images from text using GPT-5 Image via OpenRouter. Premium quality image generation.",
    inputSchema: openRouterGenerateSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGpt5ImageEdit(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "editImageGpt5",
    sessionId,
    (args: OpenRouterImageEditingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GPT5_IMAGE, "edit", args)
  );

  return tool({
    description: "Edit one or more images using GPT-5 Image via OpenRouter. Supports multiple source images for premium batch editing.",
    inputSchema: openRouterEditSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGpt5ImageReference(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "referenceImageGpt5",
    sessionId,
    (args: OpenRouterImageReferencingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GPT5_IMAGE, "reference", args)
  );

  return tool({
    description: "Generate images guided by one or more reference images using GPT-5 Image via OpenRouter. Supports multiple references for premium style transfer.",
    inputSchema: openRouterReferenceSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// Gemini 2.5 Flash Image Tools (google/gemini-2.5-flash-image)
// ==========================================================================

export function createOpenRouterGemini25FlashImageGenerate(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "generateImageGemini25Flash",
    sessionId,
    (args: OpenRouterImageGenerationArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GEMINI_25_FLASH_IMAGE, "generate", args)
  );

  return tool({
    description: "Generate images from text using Gemini 2.5 Flash Image via OpenRouter. Fast, high-quality generation.",
    inputSchema: openRouterGenerateSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGemini25FlashImageEdit(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "editImageGemini25Flash",
    sessionId,
    (args: OpenRouterImageEditingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GEMINI_25_FLASH_IMAGE, "edit", args)
  );

  return tool({
    description: "Edit one or more images using Gemini 2.5 Flash Image via OpenRouter. Supports multiple source images for fast batch modifications.",
    inputSchema: openRouterEditSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGemini25FlashImageReference(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "referenceImageGemini25Flash",
    sessionId,
    (args: OpenRouterImageReferencingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GEMINI_25_FLASH_IMAGE, "reference", args)
  );

  return tool({
    description: "Generate images guided by one or more reference images using Gemini 2.5 Flash Image via OpenRouter. Supports multiple references.",
    inputSchema: openRouterReferenceSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// Gemini 3 Pro Image Tools (google/gemini-3-pro-image-preview)
// ==========================================================================

export function createOpenRouterGemini3ProImageGenerate(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "generateImageGemini3Pro",
    sessionId,
    (args: OpenRouterImageGenerationArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GEMINI_3_PRO_IMAGE, "generate", args)
  );

  return tool({
    description: "Generate images from text using Gemini 3 Pro Image via OpenRouter. Latest Gemini image generation.",
    inputSchema: openRouterGenerateSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGemini3ProImageEdit(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "editImageGemini3Pro",
    sessionId,
    (args: OpenRouterImageEditingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GEMINI_3_PRO_IMAGE, "edit", args)
  );

  return tool({
    description: "Edit one or more images using Gemini 3 Pro Image via OpenRouter. Supports multiple source images for advanced batch editing.",
    inputSchema: openRouterEditSchema,
    execute: executeWithLogging,
  });
}

export function createOpenRouterGemini3ProImageReference(sessionId: string) {
  const executeWithLogging = withToolLogging(
    "referenceImageGemini3Pro",
    sessionId,
    (args: OpenRouterImageReferencingArgs) =>
      executeOpenRouterImage(sessionId, OPENROUTER_MODELS.GEMINI_3_PRO_IMAGE, "reference", args)
  );

  return tool({
    description: "Generate images guided by one or more reference images using Gemini 3 Pro Image via OpenRouter. Supports multiple references for advanced style transfer.",
    inputSchema: openRouterReferenceSchema,
    execute: executeWithLogging,
  });
}

// ==========================================================================
// Retrieve Full Content Tool
// ==========================================================================
// This tool allows the AI to retrieve full untruncated content when text
// was truncated for token efficiency. The full content is stored in the
// session and can be retrieved using the reference ID.

import { retrieveFullContent as getFullContent, listStoredContent } from "@/lib/ai/truncated-content-store";

const retrieveFullContentSchema = jsonSchema<{
  contentId: string;
}>({
  type: "object",
  title: "RetrieveFullContentInput",
  description: "Input schema for retrieving full untruncated content",
  properties: {
    contentId: {
      type: "string",
      description:
        "The reference ID of the truncated content to retrieve (format: trunc_XXXXXXXX). This ID is provided in truncation notices.",
    },
  },
  required: ["contentId"],
  additionalProperties: false,
});

interface RetrieveFullContentToolOptions {
  /** Current session ID for retrieving content */
  sessionId: string;
}

interface RetrieveFullContentArgs {
  contentId: string;
}

/**
 * Core retrieveFullContent execution logic
 */
async function executeRetrieveFullContent(
  options: RetrieveFullContentToolOptions,
  args: RetrieveFullContentArgs
) {
  const { sessionId } = options;
  const { contentId } = args;

  // Retrieve the full content
  const entry = getFullContent(sessionId, contentId);

  if (!entry) {
    // Check if there's any stored content for debugging
    const storedContent = listStoredContent(sessionId);

    return {
      status: "not_found",
      contentId,
      message: `Content with ID "${contentId}" was not found. It may have expired (TTL: 1 hour) or the ID is incorrect.`,
      availableContentIds: storedContent.map(c => ({
        id: c.id,
        context: c.context,
        fullLength: c.fullLength,
      })),
    };
  }

  return {
    status: "success",
    contentId: entry.id,
    context: entry.context,
    fullLength: entry.fullLength,
    truncatedLength: entry.truncatedLength,
    fullContent: entry.fullContent,
    message: `Successfully retrieved full content (${entry.fullLength.toLocaleString()} characters). The content was originally truncated to ${entry.truncatedLength.toLocaleString()} characters.`,
  };
}

export function createRetrieveFullContentTool(options: RetrieveFullContentToolOptions) {
  const { sessionId } = options;

  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "retrieveFullContent",
    sessionId,
    (args: RetrieveFullContentArgs) => executeRetrieveFullContent(options, args)
  );

  return tool({
    description: `**⚠️ ONLY for truncated content, NOT for file reading!**

This retrieves content that was previously TRUNCATED in a tool response.

**When to use:**
- You see "Content truncated. Reference ID: trunc_XXXXXXXX" in a previous tool result
- You need the full content that was cut off

**When NOT to use (WRONG):**
- ❌ Reading file contents (use readFile instead)
- ❌ Getting full file paths (use localGrep or vectorSearch)
- ❌ Any contentId that doesn't start with "trunc_"

**Parameter:** contentId must be exactly like "trunc_ABC123" from a truncation notice.`,
    inputSchema: retrieveFullContentSchema,
    execute: executeWithLogging,
  });
}
