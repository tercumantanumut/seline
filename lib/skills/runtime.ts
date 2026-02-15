import type { SkillInputParameter, SkillRecord } from "./types";

export interface SkillPromptRenderResult {
  prompt: string;
  missingParameters: string[];
  resolvedParameters: Record<string, string | number | boolean | null>;
}

function resolveParameterValue(
  param: SkillInputParameter,
  provided: Record<string, string | number | boolean | null>
): string | number | boolean | null | undefined {
  if (Object.prototype.hasOwnProperty.call(provided, param.name)) {
    return provided[param.name];
  }

  if (param.defaultValue !== undefined) {
    return param.defaultValue;
  }

  return undefined;
}

export function renderSkillPrompt(
  skill: SkillRecord,
  parameters: Record<string, string | number | boolean | null> = {}
): SkillPromptRenderResult {
  let prompt = skill.promptTemplate;
  const missingParameters: string[] = [];
  const resolvedParameters: Record<string, string | number | boolean | null> = {};

  for (const param of skill.inputParameters) {
    const value = resolveParameterValue(param, parameters);

    if (value === undefined || value === null || String(value).trim() === "") {
      if (param.required) {
        missingParameters.push(param.name);
      }
      continue;
    }

    resolvedParameters[param.name] = value;
    prompt = prompt.split(`{{${param.name}}}`).join(String(value));
  }

  return {
    prompt,
    missingParameters,
    resolvedParameters,
  };
}
