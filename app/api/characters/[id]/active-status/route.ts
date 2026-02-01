import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { listAgentRunsBySession } from "@/lib/observability/queries";
import { getSessionByCharacterId } from "@/lib/db/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Check if a character has active operations
 * Returns hasActiveSession and activeSessionId if any runs are "running"
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: characterId } = await params;

    // Find most recent session for this character
    const session = await getSessionByCharacterId(dbUser.id, characterId);

    if (!session) {
      return NextResponse.json({
        hasActiveSession: false,
        activeSessionId: null,
      });
    }

    // Check if any runs for this session are still running
    const runs = await listAgentRunsBySession(session.id);
    const hasRunning = runs.some(r => r.status === "running");

    return NextResponse.json({
      hasActiveSession: hasRunning,
      activeSessionId: hasRunning ? session.id : null,
    });
  } catch (error) {
    console.error("Check active status error:", error);
    return NextResponse.json({
      hasActiveSession: false,
      activeSessionId: null,
    }, { status: 500 });
  }
}
