import { db } from "@/lib/db/sqlite-client";
import {
  characters,
  characterImages,
  type NewCharacter,
  type NewCharacterImage,
  type CharacterFull,
} from "@/lib/db/sqlite-character-schema";
import { skills } from "@/lib/db/sqlite-skills-schema";
import { eq, desc, and, sql } from "drizzle-orm";

// Helper to get current timestamp as ISO string for SQLite
const now = () => new Date().toISOString();

// ============================================================================
// CHARACTER CRUD OPERATIONS
// ============================================================================

export async function createCharacter(data: NewCharacter) {
  const [character] = await db.insert(characters).values(data).returning();
  return character;
}

export async function getCharacter(id: string) {
  return db.query.characters.findFirst({
    where: eq(characters.id, id),
  });
}

export async function getCharacterFull(id: string): Promise<CharacterFull | null> {
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, id),
  });

  if (!character) return null;

  const images = await db.query.characterImages.findMany({
    where: eq(characterImages.characterId, id),
    orderBy: [desc(characterImages.isPrimary), characterImages.sortOrder],
  });

  return {
    ...character,
    images: images ?? [],
  };
}

export async function getUserCharacters(userId: string) {
  return db.query.characters.findMany({
    where: eq(characters.userId, userId),
    orderBy: [desc(characters.updatedAt)],
    with: {
      images: true,
    },
  });
}

export interface CharacterStatsRecord {
  characterId: string;
  skillCount: number;
  runCount: number;
  successRate: number | null;
  activeSince: string | null;
  lastActive: string | null;
  statsWarning?: string;
}

export async function getCharacterStats(userId: string, characterId: string): Promise<CharacterStatsRecord | null> {
  const character = await db.query.characters.findFirst({
    where: and(eq(characters.id, characterId), eq(characters.userId, userId)),
    columns: { id: true, createdAt: true },
  });
  if (!character) return null;

  const [skillAgg] = await db
    .select({
      skillCount: sql<number>`COALESCE(COUNT(*), 0)`,
      runCount: sql<number>`COALESCE(SUM(${skills.runCount}), 0)`,
      successCount: sql<number>`COALESCE(SUM(${skills.successCount}), 0)`,
      lastRunAt: sql<string | null>`MAX(${skills.lastRunAt})`,
    })
    .from(skills)
    .where(
      and(
        eq(skills.userId, userId),
        eq(skills.characterId, characterId),
        eq(skills.status, "active")
      )
    );

  const runCount = Number(skillAgg?.runCount || 0);
  const successCount = Number(skillAgg?.successCount || 0);
  const successRate = runCount > 0 ? Number(((successCount / runCount) * 100).toFixed(2)) : null;

  return {
    characterId,
    skillCount: Number(skillAgg?.skillCount || 0),
    runCount,
    successRate,
    activeSince: character.createdAt || null,
    lastActive: skillAgg?.lastRunAt || null,
    statsWarning: runCount === 0 ? "No runs recorded yet." : undefined,
  };
}

export async function getUserActiveCharacters(userId: string) {
  return db.query.characters.findMany({
    where: and(
      eq(characters.userId, userId),
      eq(characters.status, "active"),
    ),
    orderBy: [desc(characters.lastInteractionAt), desc(characters.updatedAt)],
  });
}

export async function getUserDefaultCharacter(userId: string) {
  return db.query.characters.findFirst({
    where: and(
      eq(characters.userId, userId),
      eq(characters.isDefault, true),
    ),
  });
}

export async function updateCharacter(id: string, data: Partial<NewCharacter>) {
  const [updated] = await db
    .update(characters)
    .set({ ...data, updatedAt: now() })
    .where(eq(characters.id, id))
    .returning();
  return updated;
}

export async function deleteCharacter(id: string) {
  await db.delete(characters).where(eq(characters.id, id));
}

export async function archiveCharacter(id: string) {
  return updateCharacter(id, { status: "archived" });
}

export async function setDefaultCharacter(userId: string, characterId: string) {
  // Use a transaction to atomically unset old default and set new default
  return db.transaction((tx) => {
    // First, unset any existing default
    tx
      .update(characters)
      .set({ isDefault: false })
      .where(and(eq(characters.userId, userId), eq(characters.isDefault, true)))
      .run();

    // Then set the new default
    const [updated] = tx
      .update(characters)
      .set({ isDefault: true, updatedAt: now() })
      .where(eq(characters.id, characterId))
      .returning()
      .all();

    return updated;
  });
}

// ============================================================================
// IMAGE OPERATIONS
// ============================================================================

export async function createCharacterImage(data: NewCharacterImage) {
  if (data.isPrimary) {
    await db
      .update(characterImages)
      .set({ isPrimary: false })
      .where(and(
        eq(characterImages.characterId, data.characterId),
        eq(characterImages.isPrimary, true),
      ));
  }

  const [image] = await db.insert(characterImages).values(data).returning();
  return image;
}

export async function getCharacterImages(characterId: string) {
  return db.query.characterImages.findMany({
    where: eq(characterImages.characterId, characterId),
    orderBy: [desc(characterImages.isPrimary), characterImages.sortOrder],
  });
}

export async function getPrimaryCharacterImage(characterId: string) {
  return db.query.characterImages.findFirst({
    where: and(
      eq(characterImages.characterId, characterId),
      eq(characterImages.isPrimary, true),
    ),
  });
}

export async function deleteCharacterImage(imageId: string) {
  await db.delete(characterImages).where(eq(characterImages.id, imageId));
}

export async function setPrimaryCharacterImage(characterId: string, imageId: string) {
  await db
    .update(characterImages)
    .set({ isPrimary: false })
    .where(and(
      eq(characterImages.characterId, characterId),
      eq(characterImages.isPrimary, true),
    ));

  const [updated] = await db
    .update(characterImages)
    .set({ isPrimary: true })
    .where(eq(characterImages.id, imageId))
    .returning();
  return updated;
}

// ============================================================================
// DRAFT/PROGRESS OPERATIONS
// ============================================================================

export async function getDraftCharacter(userId: string) {
  return db.query.characters.findFirst({
    where: and(
      eq(characters.userId, userId),
      eq(characters.status, "draft"),
    ),
    orderBy: [desc(characters.updatedAt)],
  });
}

export async function completeCharacterCreation(characterId: string) {
  return updateCharacter(characterId, {
    status: "active"
  });
}

// ============================================================================
// INTERACTION TRACKING
// ============================================================================

export async function updateLastInteraction(characterId: string) {
  return db
    .update(characters)
    .set({ lastInteractionAt: now() })
    .where(eq(characters.id, characterId));
}

