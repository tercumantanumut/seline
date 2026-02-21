import { createRunSkillTool, type RunSkillToolOptions } from "./run-skill-tool";

export type ListSkillsToolOptions = RunSkillToolOptions;

type LegacyListSkillsInput = {
  characterId?: string;
  status?: "draft" | "active" | "archived";
};

/**
 * Backward-compatible wrapper that maps legacy listSkills usage to runSkill(action="list").
 * Intentionally not registered in tool discovery; runSkill is the single public surface.
 */
export function createListSkillsTool(options: ListSkillsToolOptions) {
  const runSkillTool = createRunSkillTool(options) as {
    inputSchema: unknown;
    execute: (input: {
      action?: "list" | "inspect" | "run";
      query?: string;
    }) => Promise<unknown>;
  };

  return {
    description:
      "Legacy alias for runSkill(action='list'). Prefer runSkill as the public interface.",
    inputSchema: runSkillTool.inputSchema,
    execute: async (input: LegacyListSkillsInput = {}) => {
      const query = input.status ? `status:${input.status}` : undefined;
      return runSkillTool.execute({ action: "list", query });
    },
  };
}
