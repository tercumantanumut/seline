import { tool, jsonSchema } from "ai";
import { createSkill, assertCharacterOwnership } from "@/lib/skills/queries";
import { inferSkillToolHintsFromSession } from "@/lib/skills/extraction";
import type { SkillInputParameter } from "@/lib/skills/types";

interface CreateSkillInput {
  name: string;
  description?: string;
  promptTemplate: string;
  inputParameters?: SkillInputParameter[];
  toolHints?: string[];
  triggerExamples?: string[];
  category?: string;
  icon?: string;
  inferFromSession?: boolean;
}

export interface CreateSkillToolOptions {
  sessionId: string;
  userId: string;
  characterId: string;
}

const schema = jsonSchema<CreateSkillInput>({
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: "string", maxLength: 1000 },
    promptTemplate: { type: "string", minLength: 1, maxLength: 400000 },
    inputParameters: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["string", "number", "boolean"] },
          description: { type: "string" },
          required: { type: "boolean" },
          defaultValue: { type: ["string", "number", "boolean", "null"] },
        },
        required: ["name"],
      },
    },
    toolHints: { type: "array", items: { type: "string" } },
    triggerExamples: { type: "array", items: { type: "string", maxLength: 240 } },
    category: { type: "string", minLength: 1, maxLength: 80 },
    icon: { type: "string", maxLength: 20 },
    inferFromSession: {
      type: "boolean",
      description: "Infer ordered tool hints from recent tool calls in this session.",
    },
  },
  required: ["name", "promptTemplate"],
  additionalProperties: false,
});

export function createCreateSkillTool(options: CreateSkillToolOptions) {
  return tool({
    description:
      "Create and save a reusable skill recipe for this agent. Use this when user asks to save the current workflow as a skill.",
    inputSchema: schema,
    execute: async (input: CreateSkillInput) => {
      const ownsCharacter = await assertCharacterOwnership(options.characterId, options.userId);
      if (!ownsCharacter) {
        return { success: false, error: "Character not found or not owned by user." };
      }

      const extractionWarnings: string[] = [];
      let extractedToolHints: string[] = [];

      if (input.inferFromSession && options.sessionId !== "UNSCOPED") {
        const inferred = await inferSkillToolHintsFromSession(options.sessionId);
        extractedToolHints = inferred.toolHints;
        extractionWarnings.push(...inferred.warnings);
      }

      const finalToolHints =
        input.toolHints && input.toolHints.length > 0
          ? input.toolHints
          : extractedToolHints;

      const skill = await createSkill({
        userId: options.userId,
        characterId: options.characterId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        promptTemplate: input.promptTemplate,
        inputParameters: input.inputParameters || [],
        toolHints: finalToolHints,
        triggerExamples: input.triggerExamples || [],
        category: input.category || "general",
        sourceType: "conversation",
        sourceSessionId: options.sessionId,
        status: "active",
      });

      return {
        success: true,
        skill,
        warnings: extractionWarnings,
        message: `Saved skill \"${skill.name}\".`,
        nextActions: ["Run this skill", "Schedule this skill", "Edit parameters"],
      };
    },
  });
}
