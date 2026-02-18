import { NextRequest, NextResponse } from "next/server";
import {
  listSessions,
  getOrCreateLocalUser,
} from "@/lib/db/queries";
import { getCharacterFull } from "@/lib/characters/queries";
import { getCharacterAvatarUrl } from "@/lib/ai/character-prompt";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getWorkspaceInfo } from "@/lib/workspace/types";
import type { WorkspaceSummary } from "@/lib/workspace/types";

/**
 * GET /api/workspaces
 *
 * Lists all active workspace sessions for the authenticated user.
 * Returns a WorkspaceSummary[] with agent info, branch, status, etc.
 */
export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    // Fetch all active sessions for this user
    const sessions = await listSessions(dbUser.id, 500);

    // Filter to sessions that have workspace info
    const workspaceSessions = sessions.filter((s) => {
      const metadata = s.metadata as Record<string, unknown> | null;
      return getWorkspaceInfo(metadata) !== null;
    });

    // Build summaries, fetching agent info for each unique character
    const characterCache = new Map<
      string,
      { name: string; avatarUrl: string | null } | null
    >();

    const summaries: WorkspaceSummary[] = await Promise.all(
      workspaceSessions.map(async (session) => {
        const metadata = session.metadata as Record<string, unknown>;
        const workspaceInfo = getWorkspaceInfo(metadata)!;

        // Resolve agent info
        let agentName: string | undefined;
        let agentAvatarUrl: string | undefined;
        const agentId = session.characterId ?? undefined;

        if (agentId) {
          if (!characterCache.has(agentId)) {
            try {
              const character = await getCharacterFull(agentId);
              if (character) {
                characterCache.set(agentId, {
                  name: character.name,
                  avatarUrl: getCharacterAvatarUrl(character),
                });
              } else {
                characterCache.set(agentId, null);
              }
            } catch {
              characterCache.set(agentId, null);
            }
          }

          const cached = characterCache.get(agentId);
          if (cached) {
            agentName = cached.name;
            agentAvatarUrl = cached.avatarUrl ?? undefined;
          }
        }

        return {
          sessionId: session.id,
          agentId,
          agentName,
          agentAvatarUrl,
          branch: workspaceInfo.branch,
          status: workspaceInfo.status,
          changedFiles: workspaceInfo.changedFiles,
          prUrl: workspaceInfo.prUrl,
          prNumber: workspaceInfo.prNumber,
          prStatus: workspaceInfo.prStatus,
          worktreePath: workspaceInfo.worktreePath,
          createdAt: session.createdAt ?? undefined,
          lastSyncedAt: workspaceInfo.lastSyncedAt,
        } satisfies WorkspaceSummary;
      })
    );

    return NextResponse.json({ workspaces: summaries });
  } catch (error) {
    console.error("Failed to list workspaces:", error);
    return NextResponse.json(
      { error: "Failed to list workspaces" },
      { status: 500 }
    );
  }
}
