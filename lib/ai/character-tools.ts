import { tool, jsonSchema } from "ai";
import { callFlux2Generate } from "@/lib/ai/flux2-client";
import { createToolRun, updateToolRun, createImage } from "@/lib/db/queries";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

// Helper to get current timestamp as ISO string for SQLite
const now = () => new Date().toISOString();

// Character draft type for image generation
export interface CharacterDraft {
  name?: string;
  displayName?: string;
  tagline?: string;
  purpose?: string;
  imagePrompt?: string;
}

// ============================================================================
// AGENT IMAGE GENERATION TOOL
// ============================================================================

const characterImageSchema = jsonSchema<{
  characterDescription: string;
  imageType: "portrait" | "full_body" | "avatar";
  style?: string;
  additionalPrompt?: string;
}>({
  type: "object",
  title: "CharacterImageInput",
  description: "Input schema for generating character/agent avatar images",
  properties: {
    characterDescription: {
      type: "string",
      description:
        "Detailed description of the agent persona's appearance, including physical features, clothing, and expression. This is used to render the agent's avatar or portrait.",
    },
    imageType: {
      type: "string",
      enum: ["portrait", "full_body", "avatar"],
      description: "Type of image to generate: portrait (head/shoulders), full_body, or avatar (icon-style).",
    },
    style: {
      type: "string",
      description: "Art style for the image (e.g., 'realistic', 'anime', 'oil painting', 'digital art').",
    },
    additionalPrompt: {
      type: "string",
      description: "Additional prompt elements like background, lighting, or mood.",
    },
  },
  required: ["characterDescription", "imageType"],
  additionalProperties: false,
});

// Args interface for characterImage
interface CharacterImageArgs {
  characterDescription: string;
  imageType: "portrait" | "full_body" | "avatar";
  style?: string;
  additionalPrompt?: string;
}

/**
 * Core characterImage execution logic (extracted for logging wrapper)
 */
async function executeCharacterImage(sessionId: string, args: CharacterImageArgs) {
  const { characterDescription, imageType, style, additionalPrompt } = args;

  // Build the full prompt
  const styleStr = style || "high quality digital art, detailed";
  const typePrompts = {
    portrait: "portrait, head and shoulders, facing camera, detailed face",
    full_body: "full body shot, standing pose, detailed outfit",
    avatar: "icon style, circular crop, simple background, profile picture",
  };

  const fullPrompt = [
    typePrompts[imageType],
    characterDescription,
    styleStr,
    additionalPrompt,
    "professional lighting, high detail",
  ]
    .filter(Boolean)
    .join(", ");

  // Dimensions based on image type
  const dimensions = {
    portrait: { width: 816, height: 1152 },
    full_body: { width: 816, height: 1152 },
    avatar: { width: 1024, height: 1024 },
  };

  const { width, height } = dimensions[imageType];

  // Create tool run record
  const toolRun = await createToolRun({
    sessionId,
    toolName: "generateCharacterImage",
    args: { characterDescription, imageType, style, additionalPrompt },
    status: "running",
  });

  try {
    const result = await callFlux2Generate(
      {
        prompt: fullPrompt,
        width,
        height,
        guidance: 4,
        steps: 20,
      },
      sessionId
    );

    // Save generated image to database
    for (const img of result.images) {
      await createImage({
        sessionId,
        toolRunId: toolRun.id,
        role: "generated",
        localPath: img.url.split("/").slice(-3).join("/"),
        url: img.url,
        width: img.width,
        height: img.height,
        format: img.format,
        metadata: { prompt: fullPrompt, seed: result.seed, imageType },
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
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
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

export function createCharacterImageTool(sessionId: string) {
  // Wrap the execute function with logging
  const executeWithLogging = withToolLogging(
    "generateCharacterImage",
    sessionId,
    (args: CharacterImageArgs) => executeCharacterImage(sessionId, args)
  );

  return tool({
    description: `Generate an agent portrait image using Flux2. Use this to create visual representations of agents based on their description.`,
    inputSchema: characterImageSchema,
    execute: executeWithLogging,
  });
}

// ============================================================================
// AGENT PORTRAIT PROMPT BUILDER
// ============================================================================

export function buildCharacterPrompt(draft: CharacterDraft): string {
  const parts: string[] = [];

  // Basic info
  if (draft.name) parts.push(`Agent named ${draft.name}`);
  if (draft.tagline) parts.push(draft.tagline);
  if (draft.purpose) parts.push(`Agent purpose: ${draft.purpose}`);

  return parts.join(", ");
}

