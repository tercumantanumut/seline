import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { sessions } from "@/lib/db/sqlite-schema";
import { characters, characterImages } from "@/lib/db/sqlite-character-schema";
import { and, desc, eq, sql, sum } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const uid = dbUser.id;

    const dayMs = 24 * 60 * 60 * 1000;
    const todayThreshold = new Date(Date.now() - dayMs).toISOString();
    const weekThreshold = new Date(Date.now() - 7 * dayMs).toISOString();

    // Total sessions + total messages in parallel
    const [totalsRow, sessionsToday, sessionsThisWeek, pinnedRows, recentRows, agentRows] =
      await Promise.all([
        // Totals: session count + message sum
        db
          .select({
            totalSessions: sql<number>`count(*)`,
            totalMessages: sql<number>`coalesce(sum(${sessions.messageCount}), 0)`,
          })
          .from(sessions)
          .where(and(eq(sessions.userId, uid), eq(sessions.status, "active")))
          .then((r) => r[0] ?? { totalSessions: 0, totalMessages: 0 }),

        // Sessions today
        db
          .select({ count: sql<number>`count(*)` })
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, uid),
              eq(sessions.status, "active"),
              sql`${sessions.lastMessageAt} >= ${todayThreshold}`,
            ),
          )
          .then((r) => r[0]?.count ?? 0),

        // Sessions this week
        db
          .select({ count: sql<number>`count(*)` })
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, uid),
              eq(sessions.status, "active"),
              sql`${sessions.lastMessageAt} >= ${weekThreshold}`,
            ),
          )
          .then((r) => r[0]?.count ?? 0),

        // Pinned sessions (json_extract on metadata)
        db
          .select()
          .from(sessions)
          .where(
            and(
              eq(sessions.userId, uid),
              eq(sessions.status, "active"),
              sql`json_extract(${sessions.metadata}, '$.pinned') = 1`,
            ),
          )
          .orderBy(desc(sessions.updatedAt))
          .limit(20),

        // Recent sessions across all agents
        db
          .select()
          .from(sessions)
          .where(and(eq(sessions.userId, uid), eq(sessions.status, "active")))
          .orderBy(desc(sessions.updatedAt))
          .limit(8),

        // Top agents by session count
        db
          .select({
            characterId: sessions.characterId,
            sessionCount: sql<number>`count(*)`,
            totalMessages: sql<number>`coalesce(sum(${sessions.messageCount}), 0)`,
          })
          .from(sessions)
          .where(and(eq(sessions.userId, uid), eq(sessions.status, "active")))
          .groupBy(sessions.characterId)
          .orderBy(desc(sql`count(*)`))
          .limit(6),
      ]);

    // Enrich agent rows with character name + avatar
    const agentIds = agentRows
      .map((r) => r.characterId)
      .filter((id): id is string => id != null);

    let agentDetails: { id: string; name: string; displayName: string | null; avatarUrl: string | null }[] = [];
    if (agentIds.length > 0) {
      const charRows = await db
        .select({
          id: characters.id,
          name: characters.name,
          displayName: characters.displayName,
        })
        .from(characters)
        .where(eq(characters.userId, uid));

      // Fetch primary avatar per character
      const avatarRows = await db
        .select({
          characterId: characterImages.characterId,
          url: characterImages.url,
        })
        .from(characterImages)
        .where(
          and(
            eq(characterImages.imageType, "avatar"),
            eq(characterImages.isPrimary, true),
          ),
        );

      const avatarMap = new Map(avatarRows.map((a) => [a.characterId, a.url]));

      agentDetails = charRows.map((c) => ({
        id: c.id,
        name: c.name,
        displayName: c.displayName,
        avatarUrl: avatarMap.get(c.id) ?? null,
      }));
    }

    const agentDetailsMap = new Map(agentDetails.map((a) => [a.id, a]));

    const topAgents = agentRows
      .filter((r) => r.characterId != null)
      .map((r) => {
        const detail = agentDetailsMap.get(r.characterId!);
        return {
          id: r.characterId!,
          name: detail?.displayName ?? detail?.name ?? "Unknown Agent",
          avatarUrl: detail?.avatarUrl ?? null,
          sessionCount: r.sessionCount,
          totalMessages: r.totalMessages,
        };
      });

    // Serialize sessions as SessionInfo-compatible shape
    const toSessionInfo = (s: typeof sessions.$inferSelect) => ({
      id: s.id,
      title: s.title,
      characterId: s.characterId,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
      lastMessageAt: s.lastMessageAt,
      messageCount: s.messageCount,
      totalTokenCount: s.totalTokenCount,
      channelType: s.channelType,
      metadata: (s.metadata ?? {}) as Record<string, unknown>,
    });

    return NextResponse.json({
      totalSessions: totalsRow.totalSessions,
      totalMessages: totalsRow.totalMessages,
      sessionsToday,
      sessionsThisWeek,
      pinnedSessions: pinnedRows.map(toSessionInfo),
      recentSessions: recentRows.map(toSessionInfo),
      topAgents,
    });
  } catch (error) {
    console.error("[dashboard/chat-stats] Failed:", error);
    return NextResponse.json({ error: "Failed to load chat stats" }, { status: 500 });
  }
}
