import { tool } from "ai";
import { createToolRun, updateToolRun, createImage } from "@/lib/db/queries";
import { saveBase64Image } from "@/lib/storage/local-storage";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";
import { imageToDataUrl } from "@/lib/ai/tools/image-tools";
import {
  openRouterGenerateSchema,
  openRouterEditSchema,
  openRouterReferenceSchema,
  type OpenRouterImageGenerationArgs,
  type OpenRouterImageEditingArgs,
  type OpenRouterImageReferencingArgs,
  OPENROUTER_MODELS,
} from "@/lib/ai/tools/openrouter-image-schemas";

// Helper to get current timestamp as ISO string for SQLite
const now = () => new Date().toISOString();

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
    let messages: Array<{ role: string; content: string | Array<{ type: string; text?: string; image_url?: { url: string } }> }>;

    if (operation === "generate") {
      messages = [{ role: "user", content: args.prompt }];
    } else if (operation === "edit") {
      const editArgs = args as OpenRouterImageEditingArgs;
      const imageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      for (const imageUrl of editArgs.source_image_urls) {
        const imageDataUrl = await imageToDataUrl(imageUrl);
        imageContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
      }
      imageContent.push({ type: "text", text: editArgs.prompt });
      messages = [{ role: "user", content: imageContent }];
    } else { // reference
      const refArgs = args as OpenRouterImageReferencingArgs;
      const imageContent: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
      for (const imageUrl of refArgs.reference_image_urls) {
        const imageDataUrl = await imageToDataUrl(imageUrl);
        imageContent.push({ type: "image_url", image_url: { url: imageDataUrl } });
      }
      imageContent.push({ type: "text", text: refArgs.prompt });
      messages = [{ role: "user", content: imageContent }];
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
    const processedImages: Array<{ url: string; localPath: string }> = [];

    for (const img of images) {
      const rawUrl = img.image_url.url;

      if (rawUrl.startsWith("data:image/")) {
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
        processedImages.push({
          url: rawUrl,
          localPath: rawUrl,
        });
      }
    }

    const imageObjects = processedImages.map((img) => ({ url: img.url }));

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
