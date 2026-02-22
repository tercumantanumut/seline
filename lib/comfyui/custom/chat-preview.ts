import { generateObject } from "ai";
import { z } from "zod";
import { getUtilityModel } from "@/lib/ai/providers";
import type { CustomComfyUIInput, CustomComfyUIOutput } from "./types";

const chatPreviewSchema = z.object({
  summary: z.string().min(1).max(220),
  importantInputIds: z.array(z.string()).max(8).default([]),
});

const IMPORTANT_INPUT_HINTS = [
  "prompt",
  "negative_prompt",
  "image",
  "mask",
  "video",
  "seed",
  "steps",
  "cfg",
  "width",
  "height",
  "sampler",
  "denoise",
];

function scoreInputForImportance(input: CustomComfyUIInput): number {
  const name = input.name.toLowerCase();
  let score = 0;

  IMPORTANT_INPUT_HINTS.forEach((hint, index) => {
    if (name.includes(hint)) {
      score += IMPORTANT_INPUT_HINTS.length - index;
    }
  });

  if (input.required) {
    score += 4;
  }

  if (input.type === "image" || input.type === "mask" || input.type === "video") {
    score += 6;
  }

  return score;
}

function buildFallbackPreview(
  inputs: CustomComfyUIInput[],
  outputs: CustomComfyUIOutput[],
  nodeCount: number
): { summary: string; importantInputIds: string[] } {
  const importantInputIds = [...inputs]
    .sort((a, b) => scoreInputForImportance(b) - scoreInputForImportance(a))
    .slice(0, 8)
    .map((input) => input.id);

  const mediaInputs = inputs.filter((input) => ["image", "mask", "video"].includes(input.type)).length;
  const summary = `Detected ${nodeCount} nodes, ${inputs.length} inputs, and ${outputs.length} outputs. ${mediaInputs > 0 ? `${mediaInputs} media inputs need file attachments.` : "Mostly text/number controls detected."}`;

  return { summary, importantInputIds };
}

export async function buildWorkflowChatPreview(params: {
  fileName: string;
  nodeCount: number;
  inputs: CustomComfyUIInput[];
  outputs: CustomComfyUIOutput[];
}): Promise<{ summary: string; importantInputIds: string[] }> {
  const { fileName, nodeCount, inputs, outputs } = params;
  const fallback = buildFallbackPreview(inputs, outputs, nodeCount);

  const shouldUseUtilityModel = nodeCount >= 20 || inputs.length >= 12;
  if (!shouldUseUtilityModel) {
    return fallback;
  }

  try {
    const compactInputs = inputs.slice(0, 30).map((input) => ({
      id: input.id,
      name: input.name,
      type: input.type,
      required: input.required ?? false,
    }));

    const { object } = await generateObject({
      model: getUtilityModel(),
      schema: chatPreviewSchema,
      prompt: [
        "You are preparing a concise UX preview for a ComfyUI workflow import modal.",
        "Write one practical summary sentence for end users.",
        "Choose up to 8 important input IDs users should review first.",
        "Prefer prompts, image inputs, dimensions, seeds, steps, and sampler controls.",
        "Do not mention internal reasoning.",
        `File: ${fileName}`,
        `Nodes: ${nodeCount}`,
        `Inputs: ${JSON.stringify(compactInputs)}`,
        `Outputs: ${JSON.stringify(outputs.slice(0, 10).map((output) => ({ id: output.id, type: output.type, name: output.name })))}`,
      ].join("\n"),
    });

    const knownIds = new Set(inputs.map((input) => input.id));
    const importantInputIds = object.importantInputIds.filter((id) => knownIds.has(id)).slice(0, 8);

    return {
      summary: object.summary,
      importantInputIds: importantInputIds.length > 0 ? importantInputIds : fallback.importantInputIds,
    };
  } catch {
    return fallback;
  }
}
