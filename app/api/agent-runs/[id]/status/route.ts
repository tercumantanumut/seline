import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getAgentRun } from "@/lib/observability/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { isStale } from "@/lib/utils/timestamp";
import { taskRegistry } from "@/lib/background-tasks/registry";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Get status of a specific agent run
 * Used for polling to detect when run completes
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: runId } = await params;

    const run = await getAgentRun(runId);

    if (!run || run.userId !== dbUser.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const isZombie = run.status === "running" && (
      isStale(run.updatedAt ?? run.startedAt, 5 * 60 * 1000)
      || !taskRegistry.get(runId)
    );

    return NextResponse.json({
      status: run.status,
      completedAt: run.completedAt,
      durationMs: run.durationMs,
      updatedAt: run.updatedAt,
      isZombie,
    });
  } catch (error) {
    console.error("Get run status error:", error);
    return NextResponse.json({ error: "Failed to get run status" }, { status: 500 });
  }
}
