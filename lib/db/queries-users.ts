import { db } from "./sqlite-client";
import { users } from "./sqlite-schema";
import { eq } from "drizzle-orm";

export async function getOrCreateUserByExternalId(externalId: string, email?: string | null) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.externalId, externalId),
  });

  if (existingUser) {
    return existingUser;
  }

  // Email is required - use provided email or generate placeholder from externalId
  const userEmail = email || `${externalId}@local.styly`;

  const [newUser] = await db
    .insert(users)
    .values({
      externalId,
      email: userEmail,
    })
    .returning();

  return newUser;
}

export async function getUserByExternalId(externalId: string) {
  return db.query.users.findFirst({
    where: eq(users.externalId, externalId),
  });
}

export async function getOrCreateLocalUser(userId: string, email: string) {
  const existingUser = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (existingUser) {
    return existingUser;
  }

  const [newUser] = await db
    .insert(users)
    .values({ id: userId, email })
    .returning();

  return newUser;
}
