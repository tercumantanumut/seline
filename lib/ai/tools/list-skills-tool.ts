import { createGetSkillTool, type RunSkillToolOptions } from "./run-skill-tool";

export type ListSkillsToolOptions = RunSkillToolOptions;

type LegacyListSkillsInput = {
  characterId?: string;
  status?: "draft" | "active" | "archived";
};

/**
 * Backward-compatible wrapper that maps legacy listSkills usage to getSkill(action="list").
 * Intentionally not registered in tool discovery; getSkill is the single public surface.
 */
export function createListSkillsTool(options: ListSkillsToolOptions) {
  const getSkillTool = createGetSkillTool(options) as {
    inputSchema: unknown;
    execute: (input: {
      action?: "list" | "inspect" | "run";
      query?: string;
    }) => Promise<unknown>;
  };

  return {
    description:
      "Legacy alias for getSkill(action='list'). Prefer getSkill as the public interface.",
    inputSchema: getSkillTool.inputSchema,
    execute: async (input: LegacyListSkillsInput = {}) => {
      const query = input.status ? `status:${input.status}` : undefined;
      return getSkillTool.execute({ action: "list", query });
    },
  };
}
