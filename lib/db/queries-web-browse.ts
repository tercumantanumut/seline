import { db } from "./sqlite-client";
import { webBrowseEntries, images } from "./sqlite-schema";
import type { NewWebBrowseEntry, WebBrowseEntry, NewImage } from "./sqlite-schema";
import { eq, desc, and, lt, gt, inArray } from "drizzle-orm";

// Web Browse Entries
export async function upsertWebBrowseEntry(data: NewWebBrowseEntry): Promise<WebBrowseEntry> {
  await db
    .delete(webBrowseEntries)
    .where(and(eq(webBrowseEntries.sessionId, data.sessionId), eq(webBrowseEntries.url, data.url)));

  const [entry] = await db
    .insert(webBrowseEntries)
    .values(data)
    .returning();

  return entry;
}

export async function listWebBrowseEntries(sessionId: string): Promise<WebBrowseEntry[]> {
  const now = new Date().toISOString();
  return db.query.webBrowseEntries.findMany({
    where: and(eq(webBrowseEntries.sessionId, sessionId), gt(webBrowseEntries.expiresAt, now)),
    orderBy: desc(webBrowseEntries.fetchedAt),
  });
}

export async function listWebBrowseEntriesByUrls(
  sessionId: string,
  urls: string[]
): Promise<WebBrowseEntry[]> {
  if (urls.length === 0) return [];
  const now = new Date().toISOString();
  return db.query.webBrowseEntries.findMany({
    where: and(
      eq(webBrowseEntries.sessionId, sessionId),
      inArray(webBrowseEntries.url, urls),
      gt(webBrowseEntries.expiresAt, now)
    ),
    orderBy: desc(webBrowseEntries.fetchedAt),
  });
}

export async function deleteWebBrowseEntries(sessionId: string): Promise<void> {
  await db.delete(webBrowseEntries).where(eq(webBrowseEntries.sessionId, sessionId));
}

export async function deleteExpiredWebBrowseEntries(): Promise<number> {
  const now = new Date().toISOString();
  const deleted = await db
    .delete(webBrowseEntries)
    .where(lt(webBrowseEntries.expiresAt, now))
    .returning({ id: webBrowseEntries.id });
  return deleted.length;
}

// Images
export async function createImage(data: NewImage) {
  const [image] = await db.insert(images).values(data).returning();
  return image;
}

export async function getSessionImages(sessionId: string) {
  return db.query.images.findMany({
    where: eq(images.sessionId, sessionId),
    orderBy: desc(images.createdAt),
  });
}

export async function getImage(id: string) {
  return db.query.images.findFirst({
    where: eq(images.id, id),
  });
}
