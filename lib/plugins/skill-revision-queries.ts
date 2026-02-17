import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/sqlite-client";
import { plugins, pluginSkillRevisions } from "@/lib/db/sqlite-plugins-schema";
import type { PluginSkillEntry } from "./types";

export interface PluginSkillRevisionRecord {
  id: string;
  pluginId: string;
  namespacedName: string;
  content: string;
  version: number;
  changeReason: string | null;
  createdAt: string;
}

export interface CreatePluginSkillRevisionResult {
  success: boolean;
  stale?: boolean;
  staleVersion?: number;
  error?: string;
  revision?: PluginSkillRevisionRecord;
}

function mapRevisionRow(row: typeof pluginSkillRevisions.$inferSelect): PluginSkillRevisionRecord {
  return {
    id: row.id,
    pluginId: row.pluginId,
    namespacedName: row.namespacedName,
    content: row.content,
    version: row.version,
    changeReason: row.changeReason ?? null,
    createdAt: row.createdAt,
  };
}

export async function seedPluginSkillRevisions(
  pluginId: string,
  skills: PluginSkillEntry[],
): Promise<void> {
  if (skills.length === 0) return;

  const existing = await db
    .select({
      namespacedName: pluginSkillRevisions.namespacedName,
      version: pluginSkillRevisions.version,
    })
    .from(pluginSkillRevisions)
    .where(eq(pluginSkillRevisions.pluginId, pluginId));

  const hasRevision = new Set(
    existing
      .filter((row) => row.version >= 1)
      .map((row) => row.namespacedName),
  );

  const rowsToInsert = skills
    .filter((skill) => !hasRevision.has(skill.namespacedName))
    .map((skill) => ({
      pluginId,
      namespacedName: skill.namespacedName,
      content: skill.content,
      version: 1,
      changeReason: "initial import",
    }));

  if (rowsToInsert.length === 0) return;
  await db.insert(pluginSkillRevisions).values(rowsToInsert);
}

export async function getLatestPluginSkillRevision(
  pluginId: string,
  namespacedName: string,
): Promise<PluginSkillRevisionRecord | null> {
  const row = await db.query.pluginSkillRevisions.findFirst({
    where: and(
      eq(pluginSkillRevisions.pluginId, pluginId),
      eq(pluginSkillRevisions.namespacedName, namespacedName),
    ),
    orderBy: [desc(pluginSkillRevisions.version), desc(pluginSkillRevisions.createdAt)],
  });

  return row ? mapRevisionRow(row) : null;
}

export async function getLatestPluginSkillRevisionsForPlugins(
  pluginIds: string[],
): Promise<Map<string, PluginSkillRevisionRecord>> {
  const result = new Map<string, PluginSkillRevisionRecord>();
  if (pluginIds.length === 0) return result;

  const rows = await db.query.pluginSkillRevisions.findMany({
    where: inArray(pluginSkillRevisions.pluginId, pluginIds),
    orderBy: [
      desc(pluginSkillRevisions.version),
      desc(pluginSkillRevisions.createdAt),
    ],
  });

  for (const row of rows) {
    const key = `${row.pluginId}:${row.namespacedName}`;
    if (!result.has(key)) {
      result.set(key, mapRevisionRow(row));
    }
  }

  return result;
}

async function updatePluginSkillContentProjection(
  pluginId: string,
  namespacedName: string,
  content: string,
): Promise<boolean> {
  const pluginRow = await db.query.plugins.findFirst({
    where: eq(plugins.id, pluginId),
    columns: {
      id: true,
      components: true,
    },
  });

  if (!pluginRow) return false;

  const components = ((pluginRow.components || {}) as Record<string, unknown>);
  const skills = Array.isArray(components.skills)
    ? (components.skills as Array<Record<string, unknown>>)
    : [];

  let updated = false;
  const nextSkills = skills.map((skill) => {
    if (skill.namespacedName === namespacedName) {
      updated = true;
      return {
        ...skill,
        content,
      };
    }
    return skill;
  });

  if (!updated) return false;

  await db
    .update(plugins)
    .set({
      components: {
        ...components,
        skills: nextSkills,
      },
      updatedAt: new Date().toISOString(),
    })
    .where(eq(plugins.id, pluginId));

  return true;
}

export async function createPluginSkillRevision(input: {
  userId: string;
  pluginId: string;
  namespacedName: string;
  content: string;
  expectedVersion?: number;
  changeReason?: string;
}): Promise<CreatePluginSkillRevisionResult> {
  const pluginRow = await db.query.plugins.findFirst({
    where: and(
      eq(plugins.id, input.pluginId),
      eq(plugins.userId, input.userId),
    ),
    columns: {
      id: true,
    },
  });

  if (!pluginRow) {
    return {
      success: false,
      error: "Plugin not found or not owned by user.",
    };
  }

  const latest = await getLatestPluginSkillRevision(
    input.pluginId,
    input.namespacedName,
  );

  if (
    input.expectedVersion !== undefined &&
    latest &&
    latest.version !== input.expectedVersion
  ) {
    return {
      success: false,
      stale: true,
      staleVersion: latest.version,
      error: "Plugin skill was updated elsewhere. Refresh and retry.",
    };
  }

  const nextVersion = (latest?.version || 0) + 1;

  const [inserted] = await db
    .insert(pluginSkillRevisions)
    .values({
      pluginId: input.pluginId,
      namespacedName: input.namespacedName,
      content: input.content,
      version: nextVersion,
      changeReason: input.changeReason || null,
    })
    .returning();

  await updatePluginSkillContentProjection(
    input.pluginId,
    input.namespacedName,
    input.content,
  );

  return {
    success: true,
    revision: mapRevisionRow(inserted),
  };
}
