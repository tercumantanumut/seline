import { getSkillsSummaryForPrompt } from "./queries";

type SkillSummary = {
  id: string;
  name: string;
  description: string;
  triggerExamples?: string[];
};

const HARD_MAX_SKILLS = 20;
const SOFT_TOKEN_BUDGET = 420;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function formatSkillsForPromptFromSummary(skills: SkillSummary[]): {
  markdown: string;
  tokenEstimate: number;
  skillCount: number;
  truncated: boolean;
} {
  if (skills.length === 0) {
    return {
      markdown: "",
      tokenEstimate: 0,
      skillCount: 0,
      truncated: false,
    };
  }

  const lines: string[] = [
    "## Your Skills",
    "",
    "You have the following skills available.",
    "Skill-triggering policy:",
    "- Use `getSkill` action=\"list\" to discover runtime-available skills when needed.",
    "- Use `getSkill` action=\"inspect\" to read full skill content before execution.",
    "- If a user request clearly matches a skill trigger, call `getSkill` action=\"run\".",
    "- getSkill returns runnable instructions; you must execute those instructions to complete the task.",
    "- Use `updateSkill` for create/patch/replace/metadata/copy/archive operations.",
    "- If multiple skills plausibly match, ask a short clarification before running.",
    "- If confidence is low, ask for confirmation instead of guessing.",
    "",
  ];

  let consumedTokens = estimateTokens(lines.join("\n"));
  let included = 0;

  for (const skill of skills.slice(0, HARD_MAX_SKILLS)) {
    const description = skill.description.trim() || "No description provided.";
    const triggerExamples = Array.isArray(skill.triggerExamples)
      ? skill.triggerExamples.filter((item) => item.trim().length > 0).slice(0, 3)
      : [];
    const triggerLabel = triggerExamples.length > 0 ? ` Trigger examples: ${triggerExamples.join(" | ")}` : "";
    const line = `- **${skill.name}**: ${description}${triggerLabel}`;
    const estimated = estimateTokens(line);

    if (included > 0 && consumedTokens + estimated > SOFT_TOKEN_BUDGET) {
      break;
    }

    lines.push(line);
    consumedTokens += estimated;
    included += 1;
  }

  const truncated = included < skills.length;
  if (truncated) {
    lines.push("");
    lines.push("If you need the full catalog, call `getSkill` with action=\"list\".");
    consumedTokens += estimateTokens(lines[lines.length - 1]);
  }

  return {
    markdown: lines.join("\n"),
    tokenEstimate: consumedTokens,
    skillCount: included,
    truncated,
  };
}

export async function formatSkillsForPrompt(characterId: string): Promise<{
  markdown: string;
  tokenEstimate: number;
  skillCount: number;
  truncated: boolean;
}> {
  const skills = await getSkillsSummaryForPrompt(characterId);
  return formatSkillsForPromptFromSummary(skills);
}
