export type SkillStatus = "draft" | "active" | "archived";
export type SkillSourceType = "conversation" | "manual" | "template";

export interface SkillInputParameter {
  name: string;
  type?: "string" | "number" | "boolean";
  description?: string;
  required?: boolean;
  defaultValue?: string | number | boolean | null;
}

export type SkillUpdateField =
  | "name"
  | "description"
  | "promptTemplate"
  | "inputParameters"
  | "toolHints"
  | "triggerExamples"
  | "category"
  | "status";

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
  triggerExamples: string[];
  category: string;
  version: number;
  copiedFromSkillId: string | null;
  copiedFromCharacterId: string | null;
  sourceType: SkillSourceType;
  sourceSessionId: string | null;
  runCount: number;
  successCount: number;
  lastRunAt: string | null;
  status: SkillStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SkillVersionRecord {
  id: string;
  skillId: string;
  version: number;
  promptTemplate: string;
  inputParameters: SkillInputParameter[];
  toolHints: string[];
  description: string | null;
  changeReason: string | null;
  createdAt: string;
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
  triggerExamples?: string[];
  category?: string;
  copiedFromSkillId?: string | null;
  copiedFromCharacterId?: string | null;
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
  triggerExamples?: string[];
  category?: string;
  status?: SkillStatus;
  expectedVersion?: number;
  changeReason?: string;
  skipVersionBump?: boolean;
}

export interface SkillUpdateResult {
  skill: SkillRecord | null;
  noChanges: boolean;
  warnings: string[];
  stale: boolean;
  staleVersion?: number;
  changedFields: SkillUpdateField[];
}

export interface SkillCopyInput {
  skillId: string;
  targetCharacterId: string;
  targetName?: string;
}

export interface SkillListFilters {
  characterId?: string;
  status?: SkillStatus;
  all?: boolean;
  category?: string;
  query?: string;
  q?: string;
  usageBucket?: "unused" | "low" | "medium" | "high";
  successBucket?: "poor" | "fair" | "good" | "great";
  updatedFrom?: string;
  updatedTo?: string;
  sort?: "updated_desc" | "updated_asc" | "relevance" | "success_desc" | "runs_desc";
  cursor?: string;
  limit?: number;
}

export interface SkillLibraryItem {
  skillId: string;
  characterId: string;
  characterName: string;
  name: string;
  description: string;
  category: string | null;
  version: number;
  runCount30d: number;
  successRate30d: number | null;
  updatedAt: string;
}

export interface SkillListPage<TItem> {
  items: TItem[];
  nextCursor: string | null;
}

export interface SkillRunHistoryItem {
  runId: string;
  taskId: string;
  taskName: string;
  status: "pending" | "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timeout";
  scheduledFor: string;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
  createdAt: string;
}
