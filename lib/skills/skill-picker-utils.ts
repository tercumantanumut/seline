import type { SkillInputParameter } from "@/lib/skills/types";

export interface SlashSkillTrigger {
  query: string;
  matchStart: number;
  matchEnd: number;
  hasLeadingWhitespace: boolean;
}

export interface SkillInsertResult {
  value: string;
  nextCursor: number;
}

export function detectSlashSkillTrigger(inputValue: string, cursorPosition: number): SlashSkillTrigger | null {
  const safeCursor = Math.max(0, Math.min(cursorPosition, inputValue.length));
  const textBeforeCursor = inputValue.slice(0, safeCursor);
  const slashMatch = textBeforeCursor.match(/(^|\s)\/([\w-]*)$/);

  if (!slashMatch) {
    return null;
  }

  const matchStart = textBeforeCursor.length - slashMatch[0].length;

  return {
    query: slashMatch[2] ?? "",
    matchStart,
    matchEnd: safeCursor,
    hasLeadingWhitespace: slashMatch[0].startsWith(" "),
  };
}

export function getRequiredSkillInputs(inputParameters: SkillInputParameter[] | null | undefined): string[] {
  if (!Array.isArray(inputParameters)) {
    return [];
  }

  return inputParameters
    .filter((parameter) => parameter.required && typeof parameter.name === "string" && parameter.name.trim().length > 0)
    .map((parameter) => parameter.name.trim());
}

export function buildSkillRunIntent(skillName: string, requiredInputs: string[]): string {
  const baseIntent = `Run the ${skillName} skill`;
  if (requiredInputs.length === 0) {
    return baseIntent;
  }

  return `${baseIntent} (I'll need: ${requiredInputs.join(", ")})`;
}

export function insertSkillRunIntent(
  inputValue: string,
  cursorPosition: number,
  skillName: string,
  requiredInputs: string[]
): SkillInsertResult {
  const safeCursor = Math.max(0, Math.min(cursorPosition, inputValue.length));
  const textBeforeCursor = inputValue.slice(0, safeCursor);
  const textAfterCursor = inputValue.slice(safeCursor);
  const slashTrigger = detectSlashSkillTrigger(inputValue, safeCursor);
  const runIntent = `${buildSkillRunIntent(skillName, requiredInputs)} `;

  if (slashTrigger) {
    const leadingWhitespace = slashTrigger.hasLeadingWhitespace ? " " : "";
    const updatedBeforeCursor = `${textBeforeCursor.slice(0, slashTrigger.matchStart)}${leadingWhitespace}${runIntent}`;
    return {
      value: `${updatedBeforeCursor}${textAfterCursor}`,
      nextCursor: updatedBeforeCursor.length,
    };
  }

  const needsLeadingWhitespace = textBeforeCursor.length > 0 && !/\s$/.test(textBeforeCursor);
  const insertion = `${needsLeadingWhitespace ? " " : ""}${runIntent}`;
  const updatedBeforeCursor = `${textBeforeCursor}${insertion}`;

  return {
    value: `${updatedBeforeCursor}${textAfterCursor}`,
    nextCursor: updatedBeforeCursor.length,
  };
}
