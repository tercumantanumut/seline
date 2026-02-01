import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { listAgentRunsBySession } from "@/lib/observability/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Check if a session has an active agent run
 * Returns hasActiveRun, runId, and run details if any run is "running"
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: sessionId } = await params;

    // Get all runs for this session
    const runs = await listAgentRunsBySession(sessionId);
    const activeRun = runs.find(r => r.status === "running");

    if (!activeRun) {
      return NextResponse.json({
        hasActiveRun: false,
        runId: null,
      });
    }

    return NextResponse.json({
      hasActiveRun: true,
      runId: activeRun.id,
      pipelineName: activeRun.pipelineName,
      startedAt: activeRun.startedAt,
    });
  } catch (error) {
    console.error("Check active run error:", error);
    return NextResponse.json({
      hasActiveRun: false,
      runId: null,
    }, { status: 500 });
  }
}
