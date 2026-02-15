export type SkillStatus = "draft" | "active" | "archived";
export type SkillSourceType = "conversation" | "manual" | "template";

export interface SkillInputParameter {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
}

export interface SkillRecord {
  id: string;
  userId: string;
  characterId: string;
  name: string;
  description: string | null;
  icon: string | null;
  promptTemplate: string;
  inputParameters: SkillInputParameter[];
  toolHints: string[];
  sourceType: SkillSourceType;
  sourceSessionId: string | null;
  runCount: number;
  successCount: number;
  lastRunAt: string | null;
  status: SkillStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSkillInput {
  userId: string;
  characterId: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  promptTemplate: string;
  inputParameters?: SkillInputParameter[];
  toolHints?: string[];
  sourceType?: SkillSourceType;
  sourceSessionId?: string | null;
  status?: SkillStatus;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string | null;
  icon?: string | null;
  promptTemplate?: string;
  inputParameters?: SkillInputParameter[];
  toolHints?: string[];
  status?: SkillStatus;
}

export interface SkillListFilters {
  characterId?: string;
  status?: SkillStatus;
}
