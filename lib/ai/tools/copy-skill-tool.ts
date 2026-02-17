import { tool, jsonSchema } from "ai";
import { copySkill } from "@/lib/skills/queries";

interface CopySkillInput {
  skillId: string;
  targetCharacterId: string;
  targetName?: string;
}

export interface CopySkillToolOptions {
  userId: string;
}

const schema = jsonSchema<CopySkillInput>({
  type: "object",
  properties: {
    skillId: { type: "string", minLength: 1 },
    targetCharacterId: { type: "string", minLength: 1 },
    targetName: { type: "string", minLength: 1, maxLength: 120 },
  },
  required: ["skillId", "targetCharacterId"],
  additionalProperties: false,
});

export function createCopySkillTool(options: CopySkillToolOptions) {
  return tool({
    description: "Copy a skill to another owned agent as an independent clone with provenance metadata.",
    inputSchema: schema,
    execute: async (input: CopySkillInput) => {
      const skill = await copySkill(
        {
          skillId: input.skillId,
          targetCharacterId: input.targetCharacterId,
          targetName: input.targetName,
        },
        options.userId
      );

      if (!skill) {
        return {
          success: false,
          error: "Skill not found or target agent is not owned by user.",
        };
      }

      return {
        success: true,
        skill,
        message: `Copied skill to target agent as \"${skill.name}\".`,
      };
    },
  });
}
