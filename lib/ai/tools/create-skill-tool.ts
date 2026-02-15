import { tool, jsonSchema } from "ai";
import { createSkill, assertCharacterOwnership } from "@/lib/skills/queries";
import type { SkillInputParameter } from "@/lib/skills/types";

interface CreateSkillInput {
  name: string;
  description?: string;
  promptTemplate: string;
  inputParameters?: SkillInputParameter[];
  toolHints?: string[];
  icon?: string;
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
    promptTemplate: { type: "string", minLength: 1, maxLength: 8000 },
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
    icon: { type: "string", maxLength: 20 },
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

      const skill = await createSkill({
        userId: options.userId,
        characterId: options.characterId,
        name: input.name,
        description: input.description,
        icon: input.icon,
        promptTemplate: input.promptTemplate,
        inputParameters: input.inputParameters || [],
        toolHints: input.toolHints || [],
        sourceType: "conversation",
        sourceSessionId: options.sessionId,
        status: "active",
      });

      return {
        success: true,
        skill,
        message: `Saved skill \"${skill.name}\".`,
        nextActions: ["Run this skill", "Schedule this skill", "Edit parameters"],
      };
    },
  });
}
