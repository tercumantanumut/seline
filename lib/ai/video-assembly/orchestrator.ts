/**
 * Video Assembly Orchestrator
 *
 * Main coordinator for the AI-driven video assembly workflow.
 * Implements multi-phase orchestration: analyze → plan → compose → render → deliver
 */

import { generateText } from "ai";
import { getConfiguredProvider, getModelByName, getResearchModel, UTILITY_MODELS } from "../providers";
import { getSessionImages } from "@/lib/db/queries";
import { renderVideo as remotionRenderVideo } from "./renderer";
import type {
  VideoAssemblyState,
  VideoAssemblyConfig,
  VideoAssemblyEvent,
  VideoAssemblyPlan,
  MediaAsset,
  SceneAsset,
  VideoAssemblyInput,
  KenBurnsConfig,
} from "./types";

export type EventEmitter = (event: VideoAssemblyEvent) => void;

function createAbortError(): Error {
  const error = new Error("Video assembly cancelled");
  error.name = "AbortError";
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

/**
 * Create initial video assembly state
 */
export function createInitialState(
  sessionId: string,
  input: VideoAssemblyInput
): VideoAssemblyState {
  // Derive concept from input fields
  const concept = input.concept || input.theme || input.userInstructions || "Video compilation";

  return {
    sessionId,
    concept,
    assetIds: input.assetIds,
    input, // Store the complete input object for reference during workflow
    availableAssets: [],
    renderProgress: 0,
    renderedFrames: 0,
    totalFrames: 0,
    currentPhase: "idle",
  };
}

/**
 * Emit a phase change event
 */
function emitPhaseChange(
  emit: EventEmitter,
  phase: VideoAssemblyState["currentPhase"],
  message: string
) {
  emit({
    type: "phase_change",
    phase,
    message,
    timestamp: new Date(),
  });
}

/**
 * Parse JSON from LLM response, handling markdown code blocks
 */
function parseJsonResponse<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  return JSON.parse(cleaned.trim());
}

function isAntigravityQuotaError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const lower = message.toLowerCase();
  return lower.includes("resource_exhausted") || lower.includes("quota") || lower.includes("429");
}

/**
 * Phase 1: Analyze available assets in the session
 */
async function analyzeAssets(
  state: VideoAssemblyState,
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<MediaAsset[]> {
  throwIfAborted(abortSignal);
  emitPhaseChange(emit, "analyzing", "Analyzing available assets...");

  // Get all images/videos from the session
  const images = await getSessionImages(state.sessionId);
  throwIfAborted(abortSignal);

  // Allow generated outputs and user uploads for assembly
  const usableAssets = images.filter(
    (img) => img.role === "generated" || img.role === "upload"
  );

  // If specific asset IDs provided, filter to those
  let filteredAssets = usableAssets;
  if (state.assetIds && state.assetIds.length > 0) {
    filteredAssets = usableAssets.filter((img) =>
      state.assetIds!.includes(img.id)
    );
  }

  // Convert to MediaAsset format
  const assets: MediaAsset[] = filteredAssets.map((img) => {
    const metadata = img.metadata as Record<string, unknown> | null;
    const urlPath = img.localPath || img.url || "";
    const inferredExt = urlPath.split(".").pop()?.toLowerCase();
    const format = img.format || inferredExt;
    const isVideo = format === "mp4" || format === "webm" ||
      (metadata?.mediaType === "video");

    return {
      id: img.id,
      type: isVideo ? "video" : "image",
      url: img.url,
      localPath: img.localPath,
      width: img.width ?? undefined,
      height: img.height ?? undefined,
      format: format ?? undefined,
      duration: isVideo ? (metadata?.duration as number) ?? 2 : undefined,
      metadata: metadata ?? undefined,
      createdAt: img.createdAt,
    };
  });

  // Sort assets based on user-specified order or chronologically
  if (state.assetIds && state.assetIds.length > 0) {
    // Sort to match the exact order of IDs in state.assetIds
    assets.sort((a, b) => state.assetIds!.indexOf(a.id) - state.assetIds!.indexOf(b.id));
  } else {
    // Sort by createdAt timestamp in ascending order
    assets.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }

  emit({
    type: "assets_analyzed",
    assetCount: assets.length,
    assets,
    timestamp: new Date(),
  });

  return assets;
}

// Planning prompt for the LLM
const VIDEO_PLANNING_PROMPT = `You are a professional video editor AI and creative director. Given a concept and a list of available media assets, create a video assembly plan.

You have FULL CREATIVE FREEDOM over:
- Which assets to include (select the best subset for the narrative)
- How to order the assets (arrange them in any sequence that creates the best story)
- How many scenes to create
- Whether to reuse assets (e.g., bookending with the same asset for thematic effect)
- Narrative structure and flow
- Transition types and timing between scenes
- Text overlay generation for scenes without user-specified overlays
- Scene display durations (within guidelines)
- Ken Burns zoom/pan effects for each image scene (speed, intensity, direction, focal point)

However, you MUST strictly follow any explicit constraints in the User Requirements section, particularly regarding text overlay content, scene pacing, zoom behavior, and duration targets.

Your task:
1. Analyze the assets and their visual content (based on metadata/prompts)
2. Select the most appropriate assets for a compelling narrative
3. Arrange the assets in the optimal sequence for storytelling (you may reorder freely)
4. Create a narrative flow that tells a cohesive story
5. Suggest appropriate transitions between scenes
6. Recommend text overlays where appropriate (unless user has specified their own)
7. Configure Ken Burns zoom effects for each scene based on content and user instructions

What the USER controls (must be honored exactly):
- Specific text overlays (when provided in User Requirements)
- Target duration constraints
- Zoom behavior instructions (speed, intensity, direction, focal areas)
- Any explicit instructions in User Requirements

Output a JSON object with this structure:
{
  "narrative": "Brief description of the video's story/flow",
  "scenes": [
    {
      "assetId": "asset-id-here",
      "displayDuration": 3,
      "textOverlay": { "text": "Optional text", "position": "bottom", "style": "caption" } | null,
      "transitionToNext": { "type": "crossfade", "duration": 0.5 } | null,
      "kenBurnsEffect": {
        "enabled": true,
        "direction": "in",
        "endScale": 1.15,
        "focalPoint": { "x": 0.5, "y": 0.5 },
        "easing": "ease-in-out"
      } | null
    }
  ]
}

Ken Burns Effect Parameters:
- enabled: true/false - whether to apply zoom animation (default true for images, false for videos)
- direction: "in" (zoom into the image) or "out" (zoom out from closer view)
- endScale: zoom intensity (1.03 = subtle/slow, 1.15 = moderate, 1.3+ = dramatic/fast)
  - Slow/subtle: 1.03-1.08
  - Moderate: 1.10-1.20
  - Dramatic/fast: 1.25-1.50
- focalPoint: where the zoom focuses { x: 0-1, y: 0-1 }
  - Top area: y = 0.2-0.3
  - Center: x = 0.5, y = 0.5
  - Bottom area (e.g., floor tiles): y = 0.7-0.8
  - Left/right: x = 0.2-0.3 or x = 0.7-0.8
- easing: "linear", "ease-in", "ease-out", or "ease-in-out"

CRITICAL VIDEO DURATION RULE:
- For VIDEO assets, the displayDuration MUST NOT exceed the actual video duration shown in the asset list.
- Videos CANNOT be stretched, looped, or extended beyond their source duration.
- If a video is 2 seconds long, its displayDuration must be 2 seconds or less.
- This is a hard technical constraint - exceeding video duration causes black frames.
- Only IMAGES can have arbitrary displayDuration (typically 2-5 seconds).

Guidelines:
- Each scene should be 2-5 seconds for images
- For videos: use their EXACT duration as shown in the asset list (never exceed it)
- Use crossfade for smooth transitions, fade for dramatic moments
- Text overlays should be concise and impactful
- The last scene should have no transition (null)
- Select and arrange assets to create the most compelling story - you don't need to use all of them
- Consider dramatic arcs, thematic groupings, and visual flow when ordering scenes
- Match zoom intensity to scene duration: shorter scenes need more dramatic zoom to be noticeable
- Honor user instructions about zoom speed/intensity/focus areas exactly`;

/**
 * Phase 2: Create video assembly plan using LLM
 */
async function createPlan(
  state: VideoAssemblyState,
  config: VideoAssemblyConfig,
  emit: EventEmitter,
  input: VideoAssemblyInput,
  abortSignal?: AbortSignal
): Promise<VideoAssemblyPlan> {
  throwIfAborted(abortSignal);
  emitPhaseChange(emit, "planning", "Creating video assembly plan...");

  const assetsContext = state.availableAssets
    .map((asset, idx) => {
      const prompt = (asset.metadata?.prompt as string) || "No description";
      return `${idx + 1}. ID: ${asset.id}, Type: ${asset.type}, Duration: ${asset.duration || "N/A"}s, Description: ${prompt}`;
    })
    .join("\n");

  // Create user requirements section if instructions are provided
  const userRequirementsSection = input.userInstructions
    ? `\nUser Requirements:\n${input.userInstructions}\n`
    : "";

  let text: string;
  try {
    const result = await generateText({
      model: getResearchModel(),
      system: VIDEO_PLANNING_PROMPT,
      prompt: `Concept: ${state.concept}
${userRequirementsSection}
Available Assets (in required order - DO NOT reorder):
${assetsContext}

Target Duration: ${config.targetDuration || "auto"} seconds
Default Scene Duration: ${config.defaultSceneDuration} seconds
Preferred Transition: ${config.defaultTransition}

Create a video assembly plan. You have full creative freedom to select and arrange assets in any order that creates the best narrative.`,
      temperature: 0.7,
      abortSignal,
    });
    text = result.text;
  } catch (error) {
    const provider = getConfiguredProvider();
    const canFallback =
      provider === "antigravity" &&
      isAntigravityQuotaError(error) &&
      typeof process.env.OPENROUTER_API_KEY === "string" &&
      process.env.OPENROUTER_API_KEY.trim().length > 0;

    if (!canFallback) {
      throw error;
    }

    console.warn("[VIDEO-ASSEMBLY] Antigravity quota hit, falling back to OpenRouter utility model.");
    const fallbackModel = getModelByName(UTILITY_MODELS.openrouter);
    const result = await generateText({
      model: fallbackModel,
      system: VIDEO_PLANNING_PROMPT,
      prompt: `Concept: ${state.concept}
${userRequirementsSection}
Available Assets (in required order - DO NOT reorder):
${assetsContext}

Target Duration: ${config.targetDuration || "auto"} seconds
Default Scene Duration: ${config.defaultSceneDuration} seconds
Preferred Transition: ${config.defaultTransition}

Create a video assembly plan. You have full creative freedom to select and arrange assets in any order that creates the best narrative.`,
      temperature: 0.7,
      abortSignal,
    });
    text = result.text;
  }
  throwIfAborted(abortSignal);

  const planData = parseJsonResponse<{
    narrative: string;
    scenes: Array<{
      assetId: string;
      displayDuration: number;
      textOverlay?: { text: string; position: string; style: string } | null;
      transitionToNext?: { type: string; duration: number } | null;
      kenBurnsEffect?: {
        enabled: boolean;
        direction: string;
        endScale: number;
        focalPoint: { x: number; y: number };
        easing: string;
      } | null;
    }>;
  }>(text);

  // Validate that all selected assets exist in the available assets list
  const availableAssetIds = new Set(state.availableAssets.map((a) => a.id));
  for (const scene of planData.scenes) {
    if (!availableAssetIds.has(scene.assetId)) {
      throw new Error(
        `Asset not found: ${scene.assetId}. Selected asset must be from the available assets list.`
      );
    }
  }

  // Convert to SceneAsset format
  const scenes: SceneAsset[] = planData.scenes.map((scene, idx) => {
    const asset = state.availableAssets.find((a) => a.id === scene.assetId);
    if (!asset) {
      throw new Error(`Asset not found: ${scene.assetId}`);
    }

    // Default Ken Burns config for images (videos default to disabled)
    const defaultKenBurns: KenBurnsConfig = {
      enabled: asset.type === "image",
      direction: "in",
      endScale: 1.08,
      focalPoint: { x: 0.5, y: 0.5 },
      easing: "ease-in-out",
    };

    return {
      ...asset,
      sceneIndex: idx,
      displayDuration: scene.displayDuration,
      textOverlay: scene.textOverlay
        ? {
            text: scene.textOverlay.text,
            position: scene.textOverlay.position as "top" | "center" | "bottom",
            style: scene.textOverlay.style as "title" | "subtitle" | "caption" | "streaming",
          }
        : undefined,
      transitionToNext: scene.transitionToNext
        ? {
            type: scene.transitionToNext.type as "fade" | "crossfade" | "slide" | "wipe" | "zoom" | "none",
            duration: scene.transitionToNext.duration,
          }
        : undefined,
      kenBurnsEffect: scene.kenBurnsEffect
        ? {
            enabled: scene.kenBurnsEffect.enabled,
            direction: scene.kenBurnsEffect.direction as "in" | "out",
            endScale: Math.max(1.0, Math.min(2.0, scene.kenBurnsEffect.endScale)),
            focalPoint: {
              x: Math.max(0, Math.min(1, scene.kenBurnsEffect.focalPoint?.x ?? 0.5)),
              y: Math.max(0, Math.min(1, scene.kenBurnsEffect.focalPoint?.y ?? 0.5)),
            },
            easing: scene.kenBurnsEffect.easing as "linear" | "ease-in" | "ease-out" | "ease-in-out",
          }
        : defaultKenBurns,
    };
  });

  // Honor user-specified text overlays (override LLM-generated ones)
  if (input.textOverlays && input.textOverlays.length > 0) {
    for (const userOverlay of input.textOverlays) {
      const sceneIdx = userOverlay.sceneIndex;
      if (sceneIdx >= 0 && sceneIdx < scenes.length) {
        scenes[sceneIdx].textOverlay = {
          text: userOverlay.text,
          position: userOverlay.position ?? "bottom",
          style: userOverlay.style ?? "caption",
        };
      }
    }
  }

  // Apply CTA overlay to the last scene if specified
  if (input.ctaOverlay && scenes.length > 0) {
    const lastScene = scenes[scenes.length - 1];
    lastScene.textOverlay = {
      text: input.ctaOverlay.text,
      position: input.ctaOverlay.position ?? "bottom",
      style: input.ctaOverlay.style ?? "caption",
    };
    if (input.ctaOverlay.duration !== undefined) {
      lastScene.displayDuration = input.ctaOverlay.duration;
    }
  }

  // Calculate total duration
  const totalDuration = scenes.reduce((sum, scene) => {
    const sceneDuration = scene.displayDuration;
    const transitionDuration = scene.transitionToNext?.duration || 0;
    return sum + sceneDuration - transitionDuration; // Transitions overlap
  }, 0);

  const plan: VideoAssemblyPlan = {
    concept: state.concept,
    narrative: planData.narrative,
    scenes,
    totalDuration,
    outputWidth: config.outputWidth,
    outputHeight: config.outputHeight,
    fps: config.fps,
  };

  emit({
    type: "plan_created",
    plan,
    timestamp: new Date(),
  });

  return plan;
}

/**
 * Phase 3 & 4: Compose and render the video using Remotion
 */
async function renderVideoPhase(
  state: VideoAssemblyState,
  config: VideoAssemblyConfig,
  emit: EventEmitter,
  abortSignal?: AbortSignal
): Promise<{ url: string; localPath: string }> {
  throwIfAborted(abortSignal);
  emitPhaseChange(emit, "composing", "Preparing video composition...");

  const plan = state.plan!;
  const totalFrames = Math.ceil(plan.totalDuration * plan.fps);

  state.totalFrames = totalFrames;

  emitPhaseChange(emit, "rendering", `Rendering ${totalFrames} frames with Remotion...`);

  try {
    // Render video using Remotion
    const result = await remotionRenderVideo(
      plan,
      config,
      state.sessionId,
      (progress) => {
        state.renderProgress = progress.percent;
        state.renderedFrames = progress.renderedFrames;

        emit({
          type: "render_progress",
          progress: progress.percent,
          renderedFrames: progress.renderedFrames,
          totalFrames: progress.totalFrames,
          estimatedTimeRemaining: progress.estimatedTimeRemaining,
          timestamp: new Date(),
        });
      },
      abortSignal
    );

    console.log(`[VIDEO-ASSEMBLY] Render complete: ${result.url}`);

    return {
      url: result.url,
      localPath: result.outputPath,
    };
  } catch (error) {
    console.error("[VIDEO-ASSEMBLY] Render failed:", error);
    throw error;
  }
}

/**
 * Main orchestration function - runs the complete video assembly workflow
 */
export async function runVideoAssembly(
  sessionId: string,
  input: VideoAssemblyInput,
  emit: EventEmitter,
  userConfig: Partial<VideoAssemblyConfig> = {},
  abortSignal?: AbortSignal
): Promise<VideoAssemblyState> {
  // Merge with default config
  const config: VideoAssemblyConfig = {
    outputWidth: userConfig.outputWidth ?? input.outputWidth ?? 1920,
    outputHeight: userConfig.outputHeight ?? input.outputHeight ?? 1080,
    fps: userConfig.fps ?? 30,
    defaultSceneDuration: userConfig.defaultSceneDuration ?? 3,
    defaultTransition: userConfig.defaultTransition ?? input.transitionStyle ?? "crossfade",
    defaultTransitionDuration: userConfig.defaultTransitionDuration ?? 0.5,
    codec: userConfig.codec ?? "h264",
    outputFormat: userConfig.outputFormat ?? "mp4",
    targetDuration: userConfig.targetDuration ?? input.targetDuration,
  };

  const state = createInitialState(sessionId, input);

  try {
    throwIfAborted(abortSignal);
    // Phase 1: Analyze assets
    state.currentPhase = "analyzing";
    state.availableAssets = await analyzeAssets(state, emit, abortSignal);

    if (state.availableAssets.length === 0) {
      throw new Error("No assets found in session. Generate some images or videos first.");
    }

    // Phase 2: Create plan
    state.currentPhase = "planning";
    state.plan = await createPlan(state, config, emit, state.input, abortSignal);

    // Phase 3 & 4: Compose and render
    const { url, localPath } = await renderVideoPhase(state, config, emit, abortSignal);
    state.outputUrl = url;
    state.outputLocalPath = localPath;

    // Phase 5: Deliver
    emitPhaseChange(emit, "delivering", "Finalizing video...");

    emit({
      type: "video_complete",
      videoUrl: url,
      duration: state.plan.totalDuration,
      width: config.outputWidth,
      height: config.outputHeight,
      timestamp: new Date(),
    });

    // Complete
    state.currentPhase = "complete";
    emit({
      type: "complete",
      state,
      timestamp: new Date(),
    });

    return state;
  } catch (error) {
    state.currentPhase = "error";
    state.error = error instanceof Error ? error.message : "Unknown error";

    emit({
      type: "error",
      error: state.error,
      phase: state.currentPhase,
      timestamp: new Date(),
    });

    throw error;
  }
}
