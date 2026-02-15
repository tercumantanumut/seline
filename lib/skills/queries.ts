import { and, desc, eq, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import { skills } from "@/lib/db/sqlite-skills-schema";
import { characters } from "@/lib/db/sqlite-character-schema";
import type {
  CreateSkillInput,
  SkillInputParameter,
  SkillListFilters,
  SkillRecord,
  SkillStatus,
  UpdateSkillInput,
} from "./types";

function normalizeInputParameters(value: unknown): SkillInputParameter[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is Record<string, unknown> => !!item && typeof item === "object")
    .map((item) => {
      const type: SkillInputParameter["type"] =
        item.type === "number" || item.type === "boolean" ? item.type : "string";

      return {
        name: String(item.name || ""),
        type,
        description: typeof item.description === "string" ? item.description : undefined,
        required: Boolean(item.required),
        defaultValue:
          typeof item.defaultValue === "string" || typeof item.defaultValue === "number" || typeof item.defaultValue === "boolean"
            ? item.defaultValue
            : null,
      };
    })
    .filter((item) => item.name.trim().length > 0);
}

function normalizeToolHints(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
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
    toolHints: normalizeToolHints(row.toolHints),
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

  if (filters.status) {
    conditions.push(eq(skills.status, filters.status));
  }

  const rows = await db.query.skills.findMany({
    where: and(...conditions),
    orderBy: [desc(skills.updatedAt)],
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
    where: and(
      eq(skills.userId, userId),
      eq(skills.characterId, characterId),
      eq(skills.name, skillName)
    ),
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
      or(like(skills.name, `%${query}%`), like(skills.description, `%${query}%`))
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
): Promise<SkillRecord | null> {
  const patch: Partial<typeof skills.$inferInsert> = {
    updatedAt: new Date().toISOString(),
  };

  if (updates.name !== undefined) patch.name = updates.name.trim();
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.icon !== undefined) patch.icon = updates.icon || null;
  if (updates.promptTemplate !== undefined) patch.promptTemplate = updates.promptTemplate.trim();
  if (updates.inputParameters !== undefined) patch.inputParameters = updates.inputParameters;
  if (updates.toolHints !== undefined) patch.toolHints = updates.toolHints;
  if (updates.status !== undefined) patch.status = updates.status;

  const [updated] = await db
    .update(skills)
    .set(patch)
    .where(and(eq(skills.id, skillId), eq(skills.userId, userId)))
    .returning();

  return updated ? mapSkillRecord(updated) : null;
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

export async function getSkillsSummaryForPrompt(characterId: string): Promise<Array<{
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
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
    status: row.status,
  }));
}
