import type { ToolMetadata } from "./types";
import { ToolRegistry } from "./registry";
import {
  createFlux2GenerateTool,
  createImageEditTool,
  createOpenRouterFlux2FlexEdit,
  createOpenRouterFlux2FlexGenerate,
  createOpenRouterFlux2FlexReference,
  createOpenRouterGemini25FlashImageEdit,
  createOpenRouterGemini25FlashImageGenerate,
  createOpenRouterGemini25FlashImageReference,
  createOpenRouterGemini3ProImageEdit,
  createOpenRouterGemini3ProImageGenerate,
  createOpenRouterGemini3ProImageReference,
  createOpenRouterGpt5ImageEdit,
  createOpenRouterGpt5ImageGenerate,
  createOpenRouterGpt5ImageMiniEdit,
  createOpenRouterGpt5ImageMiniGenerate,
  createOpenRouterGpt5ImageMiniReference,
  createOpenRouterGpt5ImageReference,
  createVideoAssemblyTool,
  createWan22ImagenTool,
  createWan22PixelVideoTool,
  createWan22VideoTool,
} from "../tools";
import { createZImageGenerateTool } from "../tools/zimage-generate-tool";
import {
  createFlux2Klein4BEditTool,
  createFlux2Klein4BGenerateTool,
  createFlux2Klein4BReferenceTool,
} from "../tools/flux2-klein-4b-generate-tool";
import {
  createFlux2Klein9BEditTool,
  createFlux2Klein9BGenerateTool,
  createFlux2Klein9BReferenceTool,
} from "../tools/flux2-klein-9b-generate-tool";

export function registerImageAndVideoTools(registry: ToolRegistry): void {
// ============================================================
// DEFERRED TOOLS - AI Model Pipelines (require searchTools to discover)
// ============================================================

// ============================================================================
// LOCAL COMFYUI IMAGE GENERATION TOOLS
// These tools use the local ComfyUI backend for image generation
// Enable via Settings > ComfyUI Settings
// ============================================================================

// Z-Image Turbo FP8 - Local Generation
registry.register(
  "generateImageZImage",
  {
    displayName: "Generate Image (Z-Image Local)",
    category: "image-generation",
    keywords: [
      "generate", "create", "image", "local", "comfyui", "z-image", "turbo", "fp8",
      "text-to-image", "fast", "offline", "private", "local image", "generate locally",
    ],
    shortDescription: "Generate images locally using Z-Image Turbo FP8 via ComfyUI",
    fullInstructions: `## Z-Image Turbo FP8 (Local ComfyUI)

Fast local image generation. Defaults optimized (steps=9, cfg=1.0). Seed=-1 for random.`,
    loading: { deferLoading: true },
    requiresSession: false,
    // Only available when local ComfyUI is enabled
    enableEnvVar: "COMFYUI_LOCAL_ENABLED",
  } satisfies ToolMetadata,
  () => createZImageGenerateTool()
);

// FLUX.2 Klein 4B - Local Generation
registry.register(
  "generateImageFlux2Klein4B",
  {
    displayName: "Generate Image (FLUX.2 Klein 4B Local)",
    category: "image-generation",
    keywords: [
      "generate", "create", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
      "text-to-image", "fast", "offline", "private", "local image", "generate locally",
      "edit", "reference", "image-to-image",
    ],
    shortDescription: "Generate or edit images locally using FLUX.2 Klein 4B via ComfyUI",
    fullInstructions: `## FLUX.2 Klein 4B (Local ComfyUI)

Dual-mode: text-to-image (no reference_images) or image editing (with reference_images).
~7-8s generation, ~10-14s editing. Requires ~12GB VRAM. Dimensions must be divisible by 8.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createFlux2Klein4BGenerateTool(sessionId!)
);

// FLUX.2 Klein 4B - Local Editing
registry.register(
  "editImageFlux2Klein4B",
  {
    displayName: "Edit Image (FLUX.2 Klein 4B Local)",
    category: "image-editing",
    keywords: [
      "edit", "modify", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
      "image-to-image", "img2img", "reference", "transform", "inpaint", "variations",
    ],
    shortDescription: "Edit images locally using FLUX.2 Klein 4B via ComfyUI",
    fullInstructions: `## FLUX.2 Klein 4B Editing (Local)

Edit images locally. Supports multiple source images (1-10) for composition/style mixing. Dimensions divisible by 8.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createFlux2Klein4BEditTool(sessionId!)
);

// FLUX.2 Klein 4B - Local Reference
registry.register(
  "referenceImageFlux2Klein4B",
  {
    displayName: "Reference Image (FLUX.2 Klein 4B Local)",
    category: "image-generation",
    keywords: [
      "reference", "style", "image", "local", "comfyui", "flux", "flux2", "klein", "4b",
      "guided generation", "style transfer", "image-to-image",
    ],
    shortDescription: "Reference-guided generation using FLUX.2 Klein 4B via ComfyUI",
    fullInstructions: `## FLUX.2 Klein 4B Reference (Local)

Generate images guided by 1-10 reference images locally. Style transfer and content-guided generation.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "FLUX2_KLEIN_4B_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createFlux2Klein4BReferenceTool(sessionId!)
);

// FLUX.2 Klein 9B - Local Generation (Higher Quality)
registry.register(
  "generateImageFlux2Klein9B",
  {
    displayName: "Generate Image (FLUX.2 Klein 9B Local)",
    category: "image-generation",
    keywords: [
      "generate", "create", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
      "text-to-image", "high-quality", "detailed", "offline", "private", "local image",
      "edit", "reference", "image-to-image", "premium",
    ],
    shortDescription: "Generate or edit high-quality images locally using FLUX.2 Klein 9B via ComfyUI",
    fullInstructions: `## FLUX.2 Klein 9B (Local ComfyUI)

Premium quality variant of 4B. Dual-mode: text-to-image or image editing (with reference_images).
~10-12s generation, ~14-18s editing. Requires ~16GB+ VRAM. Dimensions divisible by 8.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createFlux2Klein9BGenerateTool(sessionId!)
);

// FLUX.2 Klein 9B - Local Editing
registry.register(
  "editImageFlux2Klein9B",
  {
    displayName: "Edit Image (FLUX.2 Klein 9B Local)",
    category: "image-editing",
    keywords: [
      "edit", "modify", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
      "image-to-image", "img2img", "reference", "transform", "inpaint", "variations",
    ],
    shortDescription: "Edit images locally using FLUX.2 Klein 9B via ComfyUI",
    fullInstructions: `## FLUX.2 Klein 9B Editing (Local)

Premium local image editing. Supports multiple source images (1-10). Dimensions divisible by 8.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createFlux2Klein9BEditTool(sessionId!)
);

// FLUX.2 Klein 9B - Local Reference
registry.register(
  "referenceImageFlux2Klein9B",
  {
    displayName: "Reference Image (FLUX.2 Klein 9B Local)",
    category: "image-generation",
    keywords: [
      "reference", "style", "image", "local", "comfyui", "flux", "flux2", "klein", "9b",
      "guided generation", "style transfer", "image-to-image",
    ],
    shortDescription: "Reference-guided generation using FLUX.2 Klein 9B via ComfyUI",
    fullInstructions: `## FLUX.2 Klein 9B Reference (Local)

Premium reference-guided generation with 1-10 reference images locally.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "FLUX2_KLEIN_9B_ENABLED",
  } satisfies ToolMetadata,
  ({ sessionId }) => createFlux2Klein9BReferenceTool(sessionId!)
);

// ============================================================================
// LEGACY STYLY IO API TOOLS
// These tools use the STYLY IO API and are disabled by default.
// Set ENABLE_LEGACY_IMAGE_TOOLS=true to enable them.
// ============================================================================
if (process.env.ENABLE_LEGACY_IMAGE_TOOLS === "true") {
  // Image Editor Tool (Gemini) - General Image-to-Image editing and Virtual Try-On
  registry.register(
    "editImage",
    {
      displayName: "Image Editor (Gemini)",
      category: "image-editing",
      keywords: [
        // General image editing terms - HIGH PRIORITY for search
        "edit", "edit image", "image edit", "modify", "transform", "change", "adjust",
        "image editing", "photo editing", "edit photo", "photo edit",
        // Variations/remix terms
        "variations", "variation", "remix", "create variations", "generate variations",
        "image-to-image", "img2img", "i2i",
        // Style/transfer terms
        "style transfer", "apply style", "combine images", "blend",
        // Room/interior (original use case, still supported)
        "room", "interior", "material", "texture", "color", "wall", "floor",
        // Furniture visualization
        "furniture", "how would", "look in my room", "place", "visualize",
        "couch", "sofa", "chair", "table", "desk", "bed", "bookcase", "shelf",
        "IKEA", "decor", "staging", "virtual staging",
        // Virtual try-on - KEY USE CASE
        "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
        "shirt", "dress", "pants", "jacket", "suit", "formal wear", "attire",
        "how would I look", "wear", "wearing", "style me",
        // Technical
        "gemini", "flash",
      ],
      shortDescription: "Edit images, combine elements from two images, or create virtual try-on visualizations",
      fullInstructions: `## Image Editor (Gemini)

Edit images with Gemini 2.5 Flash. Two modes: single image edit, or two-image combine (try-on/furniture).

**⚠️ Virtual Try-On Workflow (3 mandatory steps):**
1. \`describeImage\` FIRST → analyze user's photo (never skip!)
2. Get reference image URL (webSearch)
3. \`editImage\` with BOTH image_url + second_image_url + insights from step 1

**Common mistakes:** Skipping describeImage, omitting second_image_url for try-on, assuming gender without analysis.`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
      enableEnvVar: "STYLY_AI_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createImageEditTool(sessionId!)
  );

  // Flux2 Generate Tool
  registry.register(
    "generateImageFlux2",
    {
      displayName: "Generate Image (Flux2)",
      category: "image-generation",
      keywords: [
        "generate",
        "create",
        "image",
        "flux",
        "text-to-image",
        "art",
        "illustration",
        "reference",
      ],
      shortDescription: "Generate or edit images with Flux2 text-to-image model",
      fullInstructions: `## Flux2 Generation & Editing

Dual-mode: text-to-image (no referenceImages) or image editing (with referenceImages array).

**Mode detection:** If user says "edit/modify/change" + existing image → use referenceImages. Otherwise → pure generation.
**Edit prompts:** Write SHORT, change-focused prompts (e.g., "Add sunset painting to wall"). Don't describe the full scene.
**Image URLs:** Look for \`[Image URL: ...]\` or \`[Previous generateImageFlux2 result - Generated image URLs: ...]\` in conversation.`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
      enableEnvVar: "STYLY_AI_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId, characterAvatarUrl, characterAppearanceDescription }) =>
      createFlux2GenerateTool(sessionId!, {
        characterAvatarUrl,
        characterAppearanceDescription,
      })
  );

  // WAN 2.2 Imagen Tool
  registry.register(
    "generateImageWan22",
    {
      displayName: "Generate Image (WAN 2.2)",
      category: "image-generation",
      keywords: [
        "generate",
        "create",
        "image",
        "wan",
        "anime",
        "artistic",
        "illustration",
        "portrait",
      ],
      shortDescription: "Generate anime-style or artistic images with WAN 2.2",
      fullInstructions: `## WAN 2.2 Image Generation

Anime-style/artistic image generation. Default 768x1344. Use \`positive\` for prompt, \`negative\` to exclude unwanted elements.`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
      enableEnvVar: "STYLY_AI_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createWan22ImagenTool(sessionId!)
  );

  // WAN 2.2 Video Tool
  registry.register(
    "generateVideoWan22",
    {
      displayName: "Generate Video (WAN 2.2)",
      category: "video-generation",
      keywords: [
        "video",
        "animate",
        "motion",
        "movement",
        "wan",
        "image-to-video",
      ],
      shortDescription: "Animate images into videos with WAN 2.2",
      fullInstructions: `## WAN 2.2 Video Generation

Animate still images into video. Provide image_url + motion prompt (\`positive\`).
Be specific about motion: "Wind blowing through hair" not just "moving". Default fps=21, duration=2s.`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
      enableEnvVar: "STYLY_AI_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createWan22VideoTool(sessionId!)
  );

  // WAN 2.2 Pixel Animation Tool
  registry.register(
    "generatePixelVideoWan22",
    {
      displayName: "Generate Pixel Animation (WAN 2.2)",
      category: "video-generation",
      keywords: [
        "pixel",
        "sprite",
        "animation",
        "character",
        "game",
        "retro",
        "wan",
        "video",
        "8-bit",
        "16-bit",
      ],
      shortDescription:
        "Generate pixel art character sprite animations with WAN 2.2",
      fullInstructions: `## WAN 2.2 Pixel Animation

Pixel art sprite animations using specialized LoRA. DO NOT change lora_name or lora_strength defaults.

**CRITICAL prompt style:** Use simple 1-2 sentence natural descriptions. DO NOT write phase-by-phase or frame-by-frame specs.
- Good: "Pixel knight swings sword in a powerful slash. Cape billows, glowing trail effect."
- Bad: "Phase 1 (0-20%): Wind-up... Phase 2 (20-45%): Acceleration..." ← produces poor results

Use fps=21-24 for smooth animations. Always add negative: "blurry, distorted, low quality, smeared".`,
      loading: { deferLoading: true }, // Deferred - discover via searchTools
      requiresSession: true,
      enableEnvVar: "STYLY_AI_API_KEY",
    } satisfies ToolMetadata,
    ({ sessionId }) => createWan22PixelVideoTool(sessionId!)
  );
} // End LEGACY STYLY IO API TOOLS conditional

// ============================================================================
// OpenRouter Image Tools
// These tools use OpenRouter API for image generation, editing, and referencing
// ============================================================================

// Flux.2 Flex - Generate
registry.register(
  "generateImageFlux2Flex",
  {
    displayName: "Generate Image (Flux.2 Flex)",
    category: "image-generation",
    keywords: ["generate", "create", "image", "flux", "text-to-image", "art", "illustration"],
    shortDescription: "Generate images from text using Flux.2 Flex via OpenRouter",
    fullInstructions: `## Flux.2 Flex (OpenRouter)

High-quality text-to-image generation via OpenRouter.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterFlux2FlexGenerate(sessionId!)
);

// Flux.2 Flex - Edit
registry.register(
  "editImageFlux2Flex",
  {
    displayName: "Edit Image (Flux.2 Flex)",
    category: "image-editing",
    keywords: ["edit", "modify", "transform", "image", "flux", "image-to-image"],
    shortDescription: "Edit existing images using Flux.2 Flex via OpenRouter",
    fullInstructions: `## Flux.2 Flex Editing (OpenRouter)

Edit/transform images via OpenRouter. Supports mask for inpainting (white=edit, black=preserve).`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterFlux2FlexEdit(sessionId!)
);

// Flux.2 Flex - Reference
registry.register(
  "referenceImageFlux2Flex",
  {
    displayName: "Reference Image (Flux.2 Flex)",
    category: "image-generation",
    keywords: ["reference", "style", "transfer", "image", "flux", "guided"],
    shortDescription: "Generate images guided by a reference using Flux.2 Flex via OpenRouter",
    fullInstructions: `## Flux.2 Flex Reference (OpenRouter)

Reference-guided generation for style transfer and consistency. Adjust reference_strength (0-1) to control influence.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterFlux2FlexReference(sessionId!)
);

// GPT-5 Image Mini - Generate
registry.register(
  "generateImageGpt5Mini",
  {
    displayName: "Generate Image (GPT-5 Mini)",
    category: "image-generation",
    keywords: ["generate", "create", "image", "gpt", "openai", "fast", "mini"],
    shortDescription: "Generate images quickly using GPT-5 Image Mini via OpenRouter",
    fullInstructions: `## GPT-5 Image Mini (OpenRouter)

Fast image generation. Good for quick iterations where speed > max quality.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGpt5ImageMiniGenerate(sessionId!)
);

// GPT-5 Image Mini - Edit
registry.register(
  "editImageGpt5Mini",
  {
    displayName: "Edit Image (GPT-5 Mini)",
    category: "image-editing",
    keywords: [
      "edit", "modify", "image", "gpt", "openai", "fast", "mini",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "image editing", "photo editing", "transform",
    ],
    shortDescription: "Edit images quickly using GPT-5 Image Mini via OpenRouter",
    fullInstructions: `## GPT-5 Image Mini Editing (OpenRouter)

Fast image editing. Supports mask for inpainting.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGpt5ImageMiniEdit(sessionId!)
);

// GPT-5 Image Mini - Reference
registry.register(
  "referenceImageGpt5Mini",
  {
    displayName: "Reference Image (GPT-5 Mini)",
    category: "image-generation",
    keywords: [
      "reference", "style", "image", "gpt", "openai", "fast", "mini",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "style transfer", "guided generation",
    ],
    shortDescription: "Generate images with reference using GPT-5 Image Mini via OpenRouter",
    fullInstructions: `## GPT-5 Image Mini Reference (OpenRouter)

Fast reference-guided generation. Adjust reference_strength (0-1).`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGpt5ImageMiniReference(sessionId!)
);

// GPT-5 Image - Generate
registry.register(
  "generateImageGpt5",
  {
    displayName: "Generate Image (GPT-5)",
    category: "image-generation",
    keywords: ["generate", "create", "image", "gpt", "openai", "premium", "quality"],
    shortDescription: "Generate premium quality images using GPT-5 Image via OpenRouter",
    fullInstructions: `## GPT-5 Image (OpenRouter)

Premium quality image generation for complex, detailed, professional-grade outputs.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGpt5ImageGenerate(sessionId!)
);

// GPT-5 Image - Edit
registry.register(
  "editImageGpt5",
  {
    displayName: "Edit Image (GPT-5)",
    category: "image-editing",
    keywords: [
      "edit", "modify", "transform", "image", "gpt", "openai", "premium",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "image editing", "photo editing",
    ],
    shortDescription: "Premium image editing using GPT-5 Image via OpenRouter",
    fullInstructions: `## GPT-5 Image Editing (OpenRouter)

Premium image editing. Supports mask for inpainting.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGpt5ImageEdit(sessionId!)
);

// GPT-5 Image - Reference
registry.register(
  "referenceImageGpt5",
  {
    displayName: "Reference Image (GPT-5)",
    category: "image-generation",
    keywords: [
      "reference", "style", "transfer", "image", "gpt", "openai", "premium",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "style transfer", "guided generation",
    ],
    shortDescription: "Premium reference-guided generation using GPT-5 Image via OpenRouter",
    fullInstructions: `## GPT-5 Image Reference (OpenRouter)

Premium reference-guided generation and style transfer. Adjust reference_strength (0-1).`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGpt5ImageReference(sessionId!)
);

// Gemini 2.5 Flash Image - Generate
registry.register(
  "generateImageGemini25Flash",
  {
    displayName: "Generate Image (Gemini 2.5 Flash)",
    category: "image-generation",
    keywords: ["generate", "create", "image", "gemini", "google", "flash", "fast"],
    shortDescription: "Fast image generation using Gemini 2.5 Flash Image via OpenRouter",
    fullInstructions: `## Gemini 2.5 Flash Image (OpenRouter)

Fast, high-quality generation via Google's Gemini 2.5 Flash.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGemini25FlashImageGenerate(sessionId!)
);

// Gemini 2.5 Flash Image - Edit
registry.register(
  "editImageGemini25Flash",
  {
    displayName: "Edit Image (Gemini 2.5 Flash)",
    category: "image-editing",
    keywords: [
      "edit", "modify", "image", "gemini", "google", "flash", "fast",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "image editing", "photo editing", "transform",
    ],
    shortDescription: "Fast image editing using Gemini 2.5 Flash Image via OpenRouter",
    fullInstructions: `## Gemini 2.5 Flash Editing (OpenRouter)

Fast image editing. Supports mask for inpainting.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGemini25FlashImageEdit(sessionId!)
);

// Gemini 2.5 Flash Image - Reference
registry.register(
  "referenceImageGemini25Flash",
  {
    displayName: "Reference Image (Gemini 2.5 Flash)",
    category: "image-generation",
    keywords: [
      "reference", "style", "image", "gemini", "google", "flash",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "style transfer", "guided generation",
    ],
    shortDescription: "Fast reference-guided generation using Gemini 2.5 Flash Image via OpenRouter",
    fullInstructions: `## Gemini 2.5 Flash Reference (OpenRouter)

Fast reference-guided generation. Adjust reference_strength (0-1).`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGemini25FlashImageReference(sessionId!)
);

// Gemini 3 Pro Image - Generate
registry.register(
  "generateImageGemini3Pro",
  {
    displayName: "Generate Image (Gemini 3 Pro)",
    category: "image-generation",
    keywords: ["generate", "create", "image", "gemini", "google", "pro", "latest"],
    shortDescription: "Latest Gemini image generation using Gemini 3 Pro Image via OpenRouter",
    fullInstructions: `## Gemini 3 Pro Image (OpenRouter)

Google's most advanced image model (preview). Best for complex, detailed generation.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGemini3ProImageGenerate(sessionId!)
);

// Gemini 3 Pro Image - Edit
registry.register(
  "editImageGemini3Pro",
  {
    displayName: "Edit Image (Gemini 3 Pro)",
    category: "image-editing",
    keywords: [
      "edit", "modify", "image", "gemini", "google", "pro", "advanced",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "image editing", "photo editing", "transform",
    ],
    shortDescription: "Advanced image editing using Gemini 3 Pro Image via OpenRouter",
    fullInstructions: `## Gemini 3 Pro Editing (OpenRouter)

Advanced image editing with Google's latest model. Supports mask for inpainting.`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGemini3ProImageEdit(sessionId!)
);

// Gemini 3 Pro Image - Reference
registry.register(
  "referenceImageGemini3Pro",
  {
    displayName: "Reference Image (Gemini 3 Pro)",
    category: "image-generation",
    keywords: [
      "reference", "style", "transfer", "image", "gemini", "google", "pro",
      // Virtual try-on and fashion keywords
      "try on", "try-on", "virtual try-on", "clothing", "outfit", "fashion",
      "style transfer", "guided generation",
    ],
    shortDescription: "Advanced reference-guided generation using Gemini 3 Pro Image via OpenRouter",
    fullInstructions: `## Gemini 3 Pro Reference (OpenRouter)

Advanced reference-guided generation and style transfer. Adjust reference_strength (0-1).`,
    loading: { deferLoading: true },
    requiresSession: true,
    enableEnvVar: "OPENROUTER_API_KEY",
  } satisfies ToolMetadata,
  ({ sessionId }) => createOpenRouterGemini3ProImageReference(sessionId!)
);

// Video Assembly Tool (NOT a legacy tool - uses FFmpeg, not STYLY IO API)
registry.register(
  "assembleVideo",
  {
    displayName: "Assemble Video",
    category: "video-generation",
    keywords: [
      "assemble",
      "video",
      "compile",
      "montage",
      "slideshow",
      "combine",
      "edit",
      "production",
      "transitions",
      "remotion",
    ],
    shortDescription:
      "Assemble session images and videos into a cohesive video with transitions and effects",
    fullInstructions: `## Video Assembly

Assemble session images/videos into a cohesive video using Remotion. AI-driven scene planning, transitions (fade/crossfade/slide/wipe/zoom), Ken Burns, text overlays.
Automatically uses all media from the current session. Rendering may take time for longer videos.`,
    loading: { deferLoading: true }, // Deferred - discover via searchTools
    requiresSession: true,
  } satisfies ToolMetadata,
  ({ sessionId }) => createVideoAssemblyTool(sessionId!)
);

}
