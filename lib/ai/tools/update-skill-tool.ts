import { tool, jsonSchema } from "ai";
import { updateSkill } from "@/lib/skills/queries";
import type { SkillInputParameter, SkillStatus } from "@/lib/skills/types";

interface UpdateSkillInput {
  skillId: string;
  name?: string;
  description?: string | null;
  icon?: string | null;
  promptTemplate?: string;
  inputParameters?: SkillInputParameter[];
  toolHints?: string[];
  triggerExamples?: string[];
  category?: string;
  status?: SkillStatus;
  expectedVersion?: number;
  changeReason?: string;
  skipVersionBump?: boolean;
}

export interface UpdateSkillToolOptions {
  userId: string;
}

const schema = jsonSchema<UpdateSkillInput>({
  type: "object",
  properties: {
    skillId: { type: "string", minLength: 1 },
    name: { type: "string", minLength: 1, maxLength: 120 },
    description: { type: ["string", "null"], maxLength: 1000 },
    icon: { type: ["string", "null"], maxLength: 20 },
    promptTemplate: { type: "string", minLength: 1, maxLength: 400000 },
    inputParameters: { type: "array", items: { type: "object", additionalProperties: true } },
    toolHints: { type: "array", items: { type: "string" } },
    triggerExamples: { type: "array", items: { type: "string" } },
    category: { type: "string", minLength: 1, maxLength: 80 },
    status: { type: "string", enum: ["draft", "active", "archived"] },
    expectedVersion: { type: "number" },
    changeReason: { type: "string", maxLength: 300 },
    skipVersionBump: { type: "boolean" },
  },
  required: ["skillId"],
  additionalProperties: false,
});

export function createUpdateSkillTool(options: UpdateSkillToolOptions) {
  return tool({
    description:
      "Update an existing skill with user feedback. Supports optimistic version checks and returns warnings for stale/no-op updates.",
    inputSchema: schema,
    execute: async (input: UpdateSkillInput) => {
      const result = await updateSkill(input.skillId, options.userId, {
        name: input.name,
        description: input.description,
        icon: input.icon,
        promptTemplate: input.promptTemplate,
        inputParameters: input.inputParameters,
        toolHints: input.toolHints,
        triggerExamples: input.triggerExamples,
        category: input.category,
        status: input.status,
        expectedVersion: input.expectedVersion,
        changeReason: input.changeReason,
        skipVersionBump: input.skipVersionBump,
      });

      if (!result.skill) {
        return { success: false, error: "Skill not found." };
      }

      if (result.stale) {
        return {
          success: false,
          stale: true,
          staleVersion: result.staleVersion,
          skill: result.skill,
          warnings: result.warnings,
          error: "Skill was updated elsewhere. Refresh and retry with latest version.",
        };
      }

      return {
        success: true,
        noChanges: result.noChanges,
        skill: result.skill,
        changedFields: result.changedFields,
        warnings: result.warnings,
        message: result.noChanges ? "No changes were applied." : `Updated skill \"${result.skill.name}\".`,
      };
    },
  });
}
