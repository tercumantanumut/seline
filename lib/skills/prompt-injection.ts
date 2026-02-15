import { getSkillsSummaryForPrompt } from "./queries";

type SkillSummary = {
  id: string;
  name: string;
  description: string;
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
    "You have the following skills available. Use the matching skill when the user's request clearly maps to it.",
    "",
  ];

  let consumedTokens = estimateTokens(lines.join("\n"));
  let included = 0;

  for (const skill of skills.slice(0, HARD_MAX_SKILLS)) {
    const description = skill.description.trim() || "No description provided.";
    const line = `- **${skill.name}**: ${description}`;
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
    lines.push("If you need the full catalog, call the `listSkills` tool.");
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
