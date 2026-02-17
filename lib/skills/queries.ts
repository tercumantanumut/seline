import { and, asc, desc, eq, gte, like, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import { characters } from "@/lib/db/sqlite-character-schema";
import { scheduledTaskRuns, scheduledTasks } from "@/lib/db/sqlite-schedule-schema";
import { skillFiles, skillVersions, skills } from "@/lib/db/sqlite-skills-schema";
import type { SkillFile } from "@/lib/db/sqlite-skills-schema";
import type { ParsedSkillPackage } from "./import-parser";
import path from "path";
import type {
  CreateSkillInput,
  SkillCopyInput,
  SkillInputParameter,
  SkillLibraryItem,
  SkillListFilters,
  SkillListPage,
  SkillRecord,
  SkillRunHistoryItem,
  SkillStatus,
  SkillUpdateField,
  SkillUpdateResult,
  SkillVersionRecord,
  UpdateSkillInput,
} from "./types";

function normalizeInputParameters(value: unknown): SkillInputParameter[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const type: SkillInputParameter["type"] =
        item.type === "number" || item.type === "boolean" ? item.type : "string";
      return {
        name: String(item.name || "").trim(),
        type,
        description: typeof item.description === "string" ? item.description : undefined,
        required: Boolean(item.required),
        defaultValue:
          typeof item.defaultValue === "string" || typeof item.defaultValue === "number" || typeof item.defaultValue === "boolean"
            ? item.defaultValue
            : null,
      };
    })
    .filter((item) => item.name.length > 0);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || "").trim()).filter((item) => item.length > 0);
}

function mapSkillRecord(row: typeof skills.$inferSelect): SkillRecord {
  return {
    id: row.id,
    userId: row.userId,
    characterId: row.characterId,
    name: row.name,
    description: row.description,
    icon: row.icon,
    promptTemplate: row.promptTemplate,
    inputParameters: normalizeInputParameters(row.inputParameters),
    toolHints: normalizeStringArray(row.toolHints),
    triggerExamples: normalizeStringArray(row.triggerExamples),
    category: row.category,
    version: row.version,
    copiedFromSkillId: row.copiedFromSkillId,
    copiedFromCharacterId: row.copiedFromCharacterId,
    sourceType: row.sourceType,
    sourceSessionId: row.sourceSessionId,
    runCount: row.runCount,
    successCount: row.successCount,
    lastRunAt: row.lastRunAt,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSkillVersionRecord(row: typeof skillVersions.$inferSelect): SkillVersionRecord {
  return {
    id: row.id,
    skillId: row.skillId,
    version: row.version,
    promptTemplate: row.promptTemplate,
    inputParameters: normalizeInputParameters(row.inputParameters),
    toolHints: normalizeStringArray(row.toolHints),
    description: row.description,
    changeReason: row.changeReason,
    createdAt: row.createdAt,
  };
}

function makeCopyName(baseName: string, existingNames: Set<string>): string {
  let candidate = `${baseName} (Copy)`;
  let suffix = 2;
  while (existingNames.has(candidate)) {
    candidate = `${baseName} (Copy ${suffix})`;
    suffix += 1;
  }
  return candidate;
}

function computeSuccessRate(successCount: number, runCount: number): number | null {
  if (runCount <= 0) return null;
  return Number(((successCount / runCount) * 100).toFixed(2));
}

function normalizeChangedFields(fields: SkillUpdateField[]): SkillUpdateField[] {
  return Array.from(new Set(fields));
}

export async function assertCharacterOwnership(characterId: string, userId: string): Promise<boolean> {
  const character = await db.query.characters.findFirst({
    where: and(eq(characters.id, characterId), eq(characters.userId, userId)),
  });

  return Boolean(character);
}

export async function createSkill(input: CreateSkillInput): Promise<SkillRecord> {
  const [inserted] = await db
    .insert(skills)
    .values({
      userId: input.userId,
      characterId: input.characterId,
      name: input.name.trim(),
      description: input.description?.trim() || null,
      icon: input.icon || null,
      promptTemplate: input.promptTemplate.trim(),
      inputParameters: input.inputParameters || [],
      toolHints: input.toolHints || [],
      triggerExamples: input.triggerExamples || [],
      category: (input.category || "general").trim(),
      copiedFromSkillId: input.copiedFromSkillId || null,
      copiedFromCharacterId: input.copiedFromCharacterId || null,
      sourceType: input.sourceType || "conversation",
      sourceSessionId: input.sourceSessionId || null,
      status: input.status || "active",
    })
    .returning();

  return mapSkillRecord(inserted);
}

export async function listSkillsForUser(
  userId: string,
  filters: SkillListFilters = {}
): Promise<SkillRecord[]> {
  const conditions = [eq(skills.userId, userId)];

  if (filters.characterId) {
    conditions.push(eq(skills.characterId, filters.characterId));
  }
  if (filters.status) conditions.push(eq(skills.status, filters.status));
  if (filters.category) conditions.push(eq(skills.category, filters.category));

  const textQuery = (filters.q || filters.query || "").trim();
  if (textQuery) {
    conditions.push(
      or(like(skills.name, `%${textQuery}%`), like(skills.description, `%${textQuery}%`))!
    );
  }
  if (filters.updatedFrom) conditions.push(gte(skills.updatedAt, filters.updatedFrom));
  if (filters.updatedTo) conditions.push(lte(skills.updatedAt, filters.updatedTo));

  const rows = await db.query.skills.findMany({
    where: and(...conditions),
    orderBy: [desc(skills.updatedAt)],
    limit: filters.limit ?? 100,
  });

  return rows.map(mapSkillRecord);
}

export async function getSkillById(skillId: string, userId: string): Promise<SkillRecord | null> {
  const row = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
  });
  return row ? mapSkillRecord(row) : null;
}

export async function getSkillByName(
  userId: string,
  characterId: string,
  skillName: string
): Promise<SkillRecord | null> {
  const row = await db.query.skills.findFirst({
    where: and(eq(skills.userId, userId), eq(skills.characterId, characterId), eq(skills.name, skillName)),
    orderBy: [desc(skills.updatedAt)],
  });
  return row ? mapSkillRecord(row) : null;
}

export async function findSkillByNameLike(
  userId: string,
  characterId: string,
  query: string
): Promise<SkillRecord[]> {
  const rows = await db.query.skills.findMany({
    where: and(
      eq(skills.userId, userId),
      eq(skills.characterId, characterId),
      eq(skills.status, "active"),
      or(like(skills.name, `%${query}%`), like(skills.description, `%${query}%`))!
    ),
    orderBy: [desc(skills.updatedAt)],
    limit: 10,
  });
  return rows.map(mapSkillRecord);
}

export async function updateSkill(
  skillId: string,
  userId: string,
  updates: UpdateSkillInput
): Promise<SkillUpdateResult> {
  const existing = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
  });
  if (!existing) {
    return {
      skill: null,
      noChanges: false,
      warnings: [],
      stale: false,
      changedFields: [],
    };
  }

  if (updates.expectedVersion !== undefined && updates.expectedVersion !== existing.version) {
    return {
      skill: mapSkillRecord(existing),
      noChanges: false,
      warnings: ["Skill was updated elsewhere. Refresh and retry with the latest version."],
      stale: true,
      staleVersion: existing.version,
      changedFields: [],
    };
  }

  const patch: Partial<typeof skills.$inferInsert> = { updatedAt: new Date().toISOString() };
  const changedFields: SkillUpdateField[] = [];
  const warnings: string[] = [];

  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (name !== existing.name) {
      patch.name = name;
      changedFields.push("name");
    }
  }
  if (updates.description !== undefined) {
    const description = updates.description?.trim() || null;
    if (description !== existing.description) {
      patch.description = description;
      changedFields.push("description");
    }
  }
  if (updates.icon !== undefined && (updates.icon || null) !== existing.icon) patch.icon = updates.icon || null;
  if (updates.promptTemplate !== undefined) {
    const promptTemplate = updates.promptTemplate.trim();
    if (promptTemplate !== existing.promptTemplate) {
      patch.promptTemplate = promptTemplate;
      changedFields.push("promptTemplate");
    }
  }
  if (updates.inputParameters !== undefined) {
    patch.inputParameters = updates.inputParameters;
    changedFields.push("inputParameters");
  }
  if (updates.toolHints !== undefined) {
    patch.toolHints = updates.toolHints;
    changedFields.push("toolHints");
  }
  if (updates.triggerExamples !== undefined) {
    patch.triggerExamples = updates.triggerExamples;
    changedFields.push("triggerExamples");
  }
  if (updates.category !== undefined) {
    const category = updates.category.trim();
    if (category !== existing.category) {
      patch.category = category;
      changedFields.push("category");
    }
  }
  if (updates.status !== undefined && updates.status !== existing.status) {
    patch.status = updates.status;
    changedFields.push("status");
  }

  const uniqueChangedFields = normalizeChangedFields(changedFields);
  if (uniqueChangedFields.length === 0) {
    return {
      skill: mapSkillRecord(existing),
      noChanges: true,
      warnings: ["No changes were applied."],
      stale: false,
      changedFields: [],
    };
  }

  if (!updates.skipVersionBump) {
    patch.version = existing.version + 1;
    await db.insert(skillVersions).values({
      skillId: existing.id,
      version: existing.version,
      promptTemplate: existing.promptTemplate,
      inputParameters: existing.inputParameters,
      toolHints: existing.toolHints,
      description: existing.description,
      changeReason: updates.changeReason?.trim() || null,
    });
  } else {
    warnings.push("Version bump was skipped for this update.");
  }

  const [updated] = await db
    .update(skills)
    .set(patch)
    .where(and(eq(skills.id, skillId), eq(skills.userId, userId)))
    .returning();

  return {
    skill: updated ? mapSkillRecord(updated) : null,
    noChanges: false,
    warnings,
    stale: false,
    changedFields: uniqueChangedFields,
  };
}

export async function deleteSkill(skillId: string, userId: string): Promise<boolean> {
  const deleted = await db
    .delete(skills)
    .where(and(eq(skills.id, skillId), eq(skills.userId, userId)))
    .returning({ id: skills.id });

  return deleted.length > 0;
}

export async function updateSkillRunStats(
  skillId: string,
  userId: string,
  succeeded: boolean
): Promise<void> {
  await db
    .update(skills)
    .set({
      runCount: sql`${skills.runCount} + 1`,
      successCount: succeeded ? sql`${skills.successCount} + 1` : sql`${skills.successCount}`,
      lastRunAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .where(and(eq(skills.id, skillId), eq(skills.userId, userId)));
}

export async function copySkill(input: SkillCopyInput, userId: string): Promise<SkillRecord | null> {
  const source = await db.query.skills.findFirst({
    where: and(eq(skills.id, input.skillId), eq(skills.userId, userId)),
  });
  if (!source) return null;

  const ownsTarget = await assertCharacterOwnership(input.targetCharacterId, userId);
  if (!ownsTarget) return null;

  const existing = await db.query.skills.findMany({
    where: and(eq(skills.userId, userId), eq(skills.characterId, input.targetCharacterId)),
    columns: { name: true },
  });
  const existingNames = new Set<string>(existing.map((item) => String(item.name)));
  const baseName = (input.targetName || source.name).trim();
  const resolvedName = existingNames.has(baseName) ? makeCopyName(baseName, existingNames) : baseName;

  const [inserted] = await db
    .insert(skills)
    .values({
      userId,
      characterId: input.targetCharacterId,
      name: resolvedName,
      description: source.description,
      icon: source.icon,
      promptTemplate: source.promptTemplate,
      inputParameters: source.inputParameters,
      toolHints: source.toolHints,
      triggerExamples: source.triggerExamples,
      category: source.category,
      copiedFromSkillId: source.id,
      copiedFromCharacterId: source.characterId,
      sourceType: "manual",
      sourceSessionId: null,
      status: source.status,
    })
    .returning();

  return mapSkillRecord(inserted);
}

export async function listSkillLibrary(
  userId: string,
  filters: SkillListFilters = {}
): Promise<SkillListPage<SkillLibraryItem>> {
  const pageSize = Math.min(Math.max(filters.limit ?? 25, 1), 100);
  const items = await listSkillsForUser(userId, { ...filters, all: true, limit: 500 });

  const filtered = items.filter((item) => {
    if (filters.usageBucket === "unused" && item.runCount !== 0) return false;
    if (filters.usageBucket === "low" && !(item.runCount > 0 && item.runCount <= 5)) return false;
    if (filters.usageBucket === "medium" && !(item.runCount > 5 && item.runCount <= 20)) return false;
    if (filters.usageBucket === "high" && item.runCount <= 20) return false;

    const successRate = computeSuccessRate(item.successCount, item.runCount);
    if (filters.successBucket === "poor" && !(successRate !== null && successRate < 40)) return false;
    if (filters.successBucket === "fair" && !(successRate !== null && successRate >= 40 && successRate < 70)) return false;
    if (filters.successBucket === "good" && !(successRate !== null && successRate >= 70 && successRate < 90)) return false;
    if (filters.successBucket === "great" && !(successRate !== null && successRate >= 90)) return false;

    return true;
  });

  const byCharacter = new Map<string, string>();
  const characterRows = await db.query.characters.findMany({
    where: eq(characters.userId, userId),
    columns: { id: true, name: true, displayName: true },
  });
  for (const row of characterRows) {
    byCharacter.set(row.id, row.displayName || row.name);
  }

  const mapped: SkillLibraryItem[] = filtered.map((skill) => ({
    skillId: skill.id,
    characterId: skill.characterId,
    characterName: byCharacter.get(skill.characterId) || "Unknown agent",
    name: skill.name,
    description: skill.description || "",
    category: skill.category || null,
    version: skill.version,
    runCount30d: skill.runCount,
    successRate30d: computeSuccessRate(skill.successCount, skill.runCount),
    updatedAt: skill.updatedAt,
  }));

  const textQuery = (filters.q || filters.query || "").trim().toLowerCase();
  const sorted = mapped.sort((a, b) => {
    if (filters.sort === "updated_asc") return a.updatedAt.localeCompare(b.updatedAt);
    if (filters.sort === "success_desc") return (b.successRate30d ?? -1) - (a.successRate30d ?? -1);
    if (filters.sort === "runs_desc") return b.runCount30d - a.runCount30d;
    if (filters.sort === "relevance" || textQuery.length > 0) {
      const aName = a.name.toLowerCase();
      const bName = b.name.toLowerCase();
      const aDesc = a.description.toLowerCase();
      const bDesc = b.description.toLowerCase();
      const aScore = (aName.includes(textQuery) ? 3 : 0) + (aDesc.includes(textQuery) ? 1 : 0);
      const bScore = (bName.includes(textQuery) ? 3 : 0) + (bDesc.includes(textQuery) ? 1 : 0);
      if (bScore !== aScore) return bScore - aScore;
      if ((b.successRate30d ?? -1) !== (a.successRate30d ?? -1)) return (b.successRate30d ?? -1) - (a.successRate30d ?? -1);
      if (b.runCount30d !== a.runCount30d) return b.runCount30d - a.runCount30d;
      return b.updatedAt.localeCompare(a.updatedAt);
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });

  const cursor = filters.cursor ? Number.parseInt(filters.cursor, 10) : 0;
  const offset = Number.isFinite(cursor) && cursor >= 0 ? cursor : 0;
  const page = sorted.slice(offset, offset + pageSize);
  const nextCursor = offset + pageSize < sorted.length ? String(offset + pageSize) : null;

  return {
    items: page,
    nextCursor,
  };
}

export async function listSkillVersions(skillId: string, userId: string): Promise<SkillVersionRecord[]> {
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
    columns: { id: true },
  });
  if (!skill) return [];

  const rows = await db.query.skillVersions.findMany({
    where: eq(skillVersions.skillId, skillId),
    orderBy: [desc(skillVersions.version)],
    limit: 20,
  });

  return rows.map(mapSkillVersionRecord);
}

export async function listSkillRunHistory(skillId: string, userId: string, limit = 20): Promise<SkillRunHistoryItem[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 100);

  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
    columns: { id: true },
  });
  if (!skill) return [];

  const rows = await db
    .select({
      runId: scheduledTaskRuns.id,
      taskId: scheduledTasks.id,
      taskName: scheduledTasks.name,
      status: scheduledTaskRuns.status,
      scheduledFor: scheduledTaskRuns.scheduledFor,
      startedAt: scheduledTaskRuns.startedAt,
      completedAt: scheduledTaskRuns.completedAt,
      durationMs: scheduledTaskRuns.durationMs,
      error: scheduledTaskRuns.error,
      createdAt: scheduledTaskRuns.createdAt,
    })
    .from(scheduledTaskRuns)
    .innerJoin(scheduledTasks, eq(scheduledTasks.id, scheduledTaskRuns.taskId))
    .where(and(eq(scheduledTasks.userId, userId), eq(scheduledTasks.skillId, skillId)))
    .orderBy(desc(scheduledTaskRuns.createdAt))
    .limit(safeLimit);

  return rows.map((row) => ({
    runId: row.runId,
    taskId: row.taskId,
    taskName: row.taskName,
    status: row.status,
    scheduledFor: row.scheduledFor,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    durationMs: row.durationMs,
    error: row.error,
    createdAt: row.createdAt,
  }));
}

export async function getSkillsSummaryForPrompt(characterId: string): Promise<Array<{
  id: string;
  name: string;
  description: string;
  triggerExamples: string[];
  status: SkillStatus;
  hasScripts: boolean;
  scriptLanguages: string[];
}>> {
  const rows = await db.query.skills.findMany({
    where: and(eq(skills.characterId, characterId), eq(skills.status, "active")),
    orderBy: [desc(skills.updatedAt)],
    limit: 50,
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description || "",
    triggerExamples: normalizeStringArray(row.triggerExamples),
    status: row.status,
    hasScripts: Boolean(row.hasScripts),
    scriptLanguages: normalizeStringArray(row.scriptLanguages),
  }));
}

/**
 * Import a parsed skill package into the database.
 */
export async function importSkillPackage(input: {
  userId: string;
  characterId: string;
  parsedSkill: ParsedSkillPackage;
}): Promise<SkillRecord> {
  const { userId, characterId, parsedSkill } = input;

  // Detect script languages
  const scriptLanguages = Array.from(
    new Set(
      parsedSkill.scripts
        .map((file) => {
          const ext = path.extname(file.relativePath).toLowerCase();
          if (ext === ".py") return "python" as const;
          if (ext === ".js" || ext === ".ts") return "javascript" as const;
          if (ext === ".sh" || ext === ".bash") return "bash" as const;
          return null;
        })
        .filter((lang): lang is "python" | "javascript" | "bash" => lang !== null)
    )
  );

  // Create skill record
  const [skill] = await db
    .insert(skills)
    .values({
      userId,
      characterId,
      name: parsedSkill.name,
      description: parsedSkill.description,
      promptTemplate: parsedSkill.promptTemplate,
      sourceFormat: "agentskills-package",
      sourceType: "manual",
      hasScripts: parsedSkill.scripts.length > 0,
      hasReferences: parsedSkill.references.length > 0,
      hasAssets: parsedSkill.assets.length > 0,
      scriptLanguages: scriptLanguages,
      license: parsedSkill.license || null,
      compatibility: parsedSkill.compatibility || null,
      toolHints: parsedSkill.allowedTools || [],
      status: "active",
    })
    .returning();

  // Insert all files
  if (parsedSkill.files.length > 0) {
    await db.insert(skillFiles).values(
      parsedSkill.files.map((file) => ({
        skillId: skill.id,
        relativePath: file.relativePath,
        content: file.content,
        mimeType: file.mimeType,
        size: file.size,
        isExecutable: file.isExecutable,
      }))
    );
  }

  return mapSkillRecord(skill);
}

/**
 * Get all files for a skill.
 */
export async function getSkillFiles(
  skillId: string,
  userId: string
): Promise<SkillFile[]> {
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
    columns: { id: true },
  });

  if (!skill) return [];

  return db.query.skillFiles.findMany({
    where: eq(skillFiles.skillId, skillId),
    orderBy: [asc(skillFiles.relativePath)],
  });
}

/**
 * Get a single file by path.
 */
export async function getSkillFile(
  skillId: string,
  relativePath: string,
  userId: string
): Promise<SkillFile | null> {
  const skill = await db.query.skills.findFirst({
    where: and(eq(skills.id, skillId), eq(skills.userId, userId)),
    columns: { id: true },
  });

  if (!skill) return null;

  const file = await db.query.skillFiles.findFirst({
    where: and(
      eq(skillFiles.skillId, skillId),
      eq(skillFiles.relativePath, relativePath)
    ),
  });

  return file || null;
}

/**
 * Get all executable scripts for a skill.
 */
export async function getSkillScripts(
  skillId: string,
  userId: string
): Promise<SkillFile[]> {
  const allFiles = await getSkillFiles(skillId, userId);
  return allFiles.filter((file) => 
    file.relativePath.startsWith("scripts/") && file.isExecutable
  );
}
