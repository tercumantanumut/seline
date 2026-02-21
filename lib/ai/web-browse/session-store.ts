/**
 * Web Browse Session Store
 *
 * In-memory-only storage for fetched web content.
 * Results are intentionally ephemeral and never persisted to embeddings or DB.
 */

import { nanoid } from "nanoid";
import type { WebContentEntry, WebBrowseSession } from "./types";
import { logToolEvent } from "@/lib/ai/tool-registry/logging";

// ============================================================================
// Configuration
// ============================================================================

const DEFAULT_TTL_MS = 30 * 60 * 1000; // 30 minutes
const MAX_ENTRIES_PER_SESSION = 20;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;

// ============================================================================
// Session Store
// ============================================================================

const sessionStore = new Map<string, WebBrowseSession>();

export function getWebBrowseSession(sessionId: string): WebBrowseSession {
  let session = sessionStore.get(sessionId);

  if (!session) {
    session = {
      sessionId,
      entries: [],
      lastFetchedUrls: [],
      createdAt: new Date(),
      lastAccessedAt: new Date(),
    };
    sessionStore.set(sessionId, session);
  }

  session.lastAccessedAt = new Date();
  return session;
}

export interface AddWebContentOptions {
  images?: string[];
  ogImage?: string;
  ttlMs?: number;
}

export async function addWebContent(
  sessionId: string,
  url: string,
  title: string,
  content: string,
  options: AddWebContentOptions = {}
): Promise<WebContentEntry> {
  const { images, ogImage, ttlMs = DEFAULT_TTL_MS } = options;
  const session = getWebBrowseSession(sessionId);

  const existingIndex = session.entries.findIndex((e) => e.url === url);
  if (existingIndex >= 0) {
    const entry = session.entries[existingIndex];
    entry.content = content;
    entry.title = title;
    entry.contentLength = content.length;
    entry.fetchedAt = new Date();
    entry.expiresAt = new Date(Date.now() + ttlMs);
    entry.images = images;
    entry.ogImage = ogImage;

    logToolEvent({
      level: "info",
      toolName: "webBrowse.sessionStore",
      sessionId,
      event: "success",
      result: {
        action: "updated",
        url,
        contentLength: content.length,
        imageCount: images?.length || 0,
        hasOgImage: !!ogImage,
      },
    });

    return entry;
  }

  const entry: WebContentEntry = {
    id: nanoid(),
    sessionId,
    url,
    title,
    content,
    contentLength: content.length,
    fetchedAt: new Date(),
    expiresAt: new Date(Date.now() + ttlMs),
    images,
    ogImage,
  };

  if (session.entries.length >= MAX_ENTRIES_PER_SESSION) {
    const removed = session.entries.shift();
    logToolEvent({
      level: "warn",
      toolName: "webBrowse.sessionStore",
      sessionId,
      event: "success",
      result: { action: "evicted", evictedUrl: removed?.url },
    });
  }

  session.entries.push(entry);

  logToolEvent({
    level: "info",
    toolName: "webBrowse.sessionStore",
    sessionId,
    event: "success",
    result: {
      action: "added",
      url,
      title,
      contentLength: content.length,
      imageCount: images?.length || 0,
      hasOgImage: !!ogImage,
      sampleImages: images?.slice(0, 3),
    },
  });

  return entry;
}

export async function getSessionContent(sessionId: string): Promise<WebContentEntry[]> {
  const session = sessionStore.get(sessionId);
  if (!session) return [];

  const now = Date.now();
  session.entries = session.entries.filter((e) => e.expiresAt.getTime() > now);
  return session.entries;
}

export async function getContentByUrls(
  sessionId: string,
  urls: string[]
): Promise<WebContentEntry[]> {
  if (urls.length === 0) return [];

  const session = sessionStore.get(sessionId);
  if (!session) return [];

  const now = Date.now();
  session.entries = session.entries.filter((e) => e.expiresAt.getTime() > now);
  const urlSet = new Set(urls);
  return session.entries.filter((e) => urlSet.has(e.url));
}

export async function setSessionRecentUrls(sessionId: string, urls: string[]): Promise<void> {
  const session = getWebBrowseSession(sessionId);
  session.lastFetchedUrls = urls;
  session.lastFetchedAt = new Date();
  session.lastAccessedAt = new Date();
}

export async function getSessionRecentUrls(sessionId: string): Promise<string[]> {
  const session = sessionStore.get(sessionId);
  if (session?.lastFetchedUrls && session.lastFetchedUrls.length > 0) {
    return session.lastFetchedUrls;
  }

  return [];
}

export async function clearSession(sessionId: string): Promise<void> {
  sessionStore.delete(sessionId);
}

export async function cleanupExpiredEntries(): Promise<number> {
  const now = Date.now();
  let totalCleaned = 0;
  const sessionsToDelete: string[] = [];

  for (const [sessionId, session] of sessionStore) {
    const beforeCount = session.entries.length;
    session.entries = session.entries.filter((e) => e.expiresAt.getTime() > now);
    totalCleaned += beforeCount - session.entries.length;

    if (session.entries.length === 0) {
      sessionsToDelete.push(sessionId);
    }
  }

  for (const sessionId of sessionsToDelete) {
    sessionStore.delete(sessionId);
  }

  return totalCleaned;
}

if (typeof setInterval !== "undefined") {
  setInterval(() => {
    cleanupExpiredEntries().catch((error) => {
      console.warn("[WebBrowseSession] Cleanup failed:", error);
    });
  }, CLEANUP_INTERVAL_MS);
}
