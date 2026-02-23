// ==========================================================================
// lib/ai/tools.ts
//
// Public API barrel file. All tool creator functions are implemented in
// sub-modules under lib/ai/tools/ and re-exported here for backward
// compatibility with existing import sites.
// ==========================================================================

// Docs tools
export {
  createDocsSearchTool,
  createRetrieveFullContentTool,
  type DocsSearchToolOptions,
  type RetrieveFullContentToolOptions,
} from "@/lib/ai/tools/docs-tools";

// Image tools (edit, describe, flux2, wan22 imagen)
export {
  createImageEditTool,
  createDescribeImageTool,
  createFlux2GenerateTool,
  createWan22ImagenTool,
  imageToDataUrl,
  type Flux2GenerateToolOptions,
} from "@/lib/ai/tools/image-tools";

// Video tools (wan22 video, wan22 pixel video, video assembly)
export {
  createWan22VideoTool,
  createWan22PixelVideoTool,
  createVideoAssemblyTool,
} from "@/lib/ai/tools/video-tools";

// OpenRouter image tools (Flux2 Flex, GPT-5 Image Mini, GPT-5 Image,
// Gemini 2.5 Flash, Gemini 3 Pro – generate / edit / reference variants)
export {
  createOpenRouterFlux2FlexGenerate,
  createOpenRouterFlux2FlexEdit,
  createOpenRouterFlux2FlexReference,
  createOpenRouterGpt5ImageMiniGenerate,
  createOpenRouterGpt5ImageMiniEdit,
  createOpenRouterGpt5ImageMiniReference,
  createOpenRouterGpt5ImageGenerate,
  createOpenRouterGpt5ImageEdit,
  createOpenRouterGpt5ImageReference,
  createOpenRouterGemini25FlashImageGenerate,
  createOpenRouterGemini25FlashImageEdit,
  createOpenRouterGemini25FlashImageReference,
  createOpenRouterGemini3ProImageGenerate,
  createOpenRouterGemini3ProImageEdit,
  createOpenRouterGemini3ProImageReference,
} from "@/lib/ai/tools/openrouter-image-tools";
