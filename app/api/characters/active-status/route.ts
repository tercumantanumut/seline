import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { listRunningRunsByCharacter, completeAgentRun } from "@/lib/observability/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { isStale } from "@/lib/utils/timestamp";

/**
 * GET /api/characters/active-status?ids=id1,id2,id3
 *
 * Batch active-status check. Returns a map of characterId → status.
 * Replaces N individual calls to /api/characters/[id]/active-status.
 */
export async function GET(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { searchParams } = new URL(req.url);
    const idsParam = searchParams.get("ids") || "";
    const ids = idsParam.split(",").map((id) => id.trim()).filter(Boolean);

    if (ids.length === 0) {
      return NextResponse.json({ statuses: {} });
    }

    const THIRTY_MINUTES = 30 * 60 * 1000;
    const statuses: Record<string, { hasActiveSession: boolean; activeSessionId: string | null }> = {};

    // Check all characters in parallel
    await Promise.all(
      ids.map(async (characterId) => {
        try {
          const runs = await listRunningRunsByCharacter(characterId);
          let hasRunning = false;
          let activeSessionId: string | null = null;

          for (const run of runs) {
            if (isStale(run.updatedAt ?? run.startedAt, THIRTY_MINUTES)) {
              await completeAgentRun(run.id, "failed", { error: "stale_run_cleanup" });
              continue;
            }
            hasRunning = true;
            activeSessionId = run.sessionId;
          }

          statuses[characterId] = { hasActiveSession: hasRunning, activeSessionId };
        } catch {
          statuses[characterId] = { hasActiveSession: false, activeSessionId: null };
        }
      })
    );

    return NextResponse.json({ statuses });
  } catch (error) {
    console.error("Batch active status error:", error);
    return NextResponse.json({ statuses: {} }, { status: 500 });
  }
}
