import { tool, jsonSchema, type ToolExecutionOptions } from "ai";
import {
  callWan22Video,
  isAsyncResult as isWan22VideoAsyncResult,
} from "@/lib/ai/wan22-video-client";
import { createToolRun, updateToolRun, createImage } from "@/lib/db/queries";
import { withToolLogging } from "@/lib/ai/tool-registry/logging";

// Helper to get current timestamp as ISO string for SQLite
const now = () => new Date().toISOString();

// ==========================================================================
// WAN 2.2 VIDEO TOOL (Image-to-Video with PainterI2V)
// ==========================================================================

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

  if (!image_url && !base64_image) {
    return {
      status: "error",
      error: "Either image_url or base64_image must be provided",
    };
  }

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

    // Note: We use the images table with format="mp4" for videos
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

// ==========================================================================
// WAN 2.2 PIXEL VIDEO TOOL (Pixel Art Character Animation)
// ==========================================================================

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

  if (!image_url && !base64_image) {
    return {
      status: "error",
      error: "Either image_url or base64_image must be provided",
    };
  }

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

// ==========================================================================
// VIDEO ASSEMBLY TOOL
// ==========================================================================

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
    "@/lib/ai/video-assembly"
  );

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
    const config = {
      ...DEFAULT_VIDEO_ASSEMBLY_CONFIG,
      ...(fps && { fps }),
      ...(width && { outputWidth: width }),
      ...(height && { outputHeight: height }),
      ...(transitionDuration && { transitionDuration }),
      ...(defaultTransition && { defaultTransition }),
    };

    const input = {
      theme,
      style,
      targetDuration,
      includeTextOverlays: includeTextOverlays ?? true,
      userInstructions: instructions,
    };

    const progressEvents: Array<{
      type: string;
      progress?: number;
      message?: string;
    }> = [];

    const result = await runVideoAssembly(
      sessionId,
      input,
      (event) => {
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
