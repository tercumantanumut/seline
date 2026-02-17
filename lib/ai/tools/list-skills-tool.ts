import { tool, jsonSchema } from "ai";
import { listSkillsForUser, assertCharacterOwnership } from "@/lib/skills/queries";

interface ListSkillsInput {
  characterId?: string;
  status?: "draft" | "active" | "archived";
}

export interface ListSkillsToolOptions {
  userId: string;
  characterId: string;
}

const schema = jsonSchema<ListSkillsInput>({
  type: "object",
  properties: {
    characterId: { type: "string" },
    status: { type: "string", enum: ["draft", "active", "archived"] },
  },
  additionalProperties: false,
});

export function createListSkillsTool(options: ListSkillsToolOptions) {
  return tool({
    description:
      "List saved skills for the current agent. Use this when user asks what skills are available.",
    inputSchema: schema,
    execute: async (input: ListSkillsInput = {}) => {
      const scopedCharacterId = input.characterId || options.characterId;
      const ownsCharacter = await assertCharacterOwnership(scopedCharacterId, options.userId);
      if (!ownsCharacter) {
        return { success: false, error: "Character not found or not owned by user." };
      }

      const skills = await listSkillsForUser(options.userId, {
        characterId: scopedCharacterId,
        status: input.status,
      });

      return {
        success: true,
        count: skills.length,
        skills: skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          status: skill.status,
          runCount: skill.runCount,
          successCount: skill.successCount,
          lastRunAt: skill.lastRunAt,
        })),
      };
    },
  });
}
