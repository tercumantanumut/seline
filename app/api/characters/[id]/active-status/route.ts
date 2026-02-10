import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { listRunningRunsByCharacter, completeAgentRun } from "@/lib/observability/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { isStale } from "@/lib/utils/timestamp";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Check if a character has active operations
 * Returns hasActiveSession and activeSessionId if any runs are "running"
 * Checks all sessions for the character, not just the most recent one.
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: characterId } = await params;

    // Find running runs across all sessions for this character
    const runs = await listRunningRunsByCharacter(characterId);
    const THIRTY_MINUTES = 30 * 60 * 1000;

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

    return NextResponse.json({
      hasActiveSession: hasRunning,
      activeSessionId,
    });
  } catch (error) {
    console.error("Check active status error:", error);
    return NextResponse.json({
      hasActiveSession: false,
      activeSessionId: null,
    }, { status: 500 });
  }
}
