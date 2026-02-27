import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { listAgentRunsBySession, completeAgentRun } from "@/lib/observability/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { isStale } from "@/lib/utils/timestamp";

function isBackgroundChatRun(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object") return false;
  const meta = metadata as Record<string, unknown>;

  return (
    meta.deepResearch === true ||
    meta.suppressFromUI === true ||
    meta.isDelegation === true ||
    meta.taskSource === "channel" ||
    typeof meta.scheduledRunId === "string" ||
    typeof meta.scheduledTaskId === "string"
  );
}

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
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const staleRunIds = new Set<string>();

    for (const run of runs) {
      if (run.status !== "running") continue;
      if (!isStale(run.updatedAt ?? run.startedAt, THIRTY_MINUTES)) continue;
      staleRunIds.add(run.id);
      await completeAgentRun(run.id, "failed", { error: "stale_run_cleanup" });
    }

    const nonStaleRuns = runs.filter((run) => !staleRunIds.has(run.id));

    const activeForegroundChatRun = nonStaleRuns.find((run) =>
      run.status === "running" &&
      run.pipelineName === "chat" &&
      !isBackgroundChatRun(run.metadata)
    );

    const latestDeepResearchRun = nonStaleRuns.find((run) => run.pipelineName === "deep-research");
    const latestDeepResearchMetadata = (
      latestDeepResearchRun?.metadata && typeof latestDeepResearchRun.metadata === "object"
    )
      ? latestDeepResearchRun.metadata as Record<string, unknown>
      : {};

    if (!activeForegroundChatRun) {
      return NextResponse.json({
        hasActiveRun: false,
        runId: null,
        pipelineName: null,
        startedAt: null,
        latestDeepResearchRunId: latestDeepResearchRun?.id ?? null,
        latestDeepResearchStatus: latestDeepResearchRun?.status ?? null,
        latestDeepResearchState: latestDeepResearchMetadata.deepResearchState ?? null,
      });
    }

    return NextResponse.json({
      hasActiveRun: true,
      runId: activeForegroundChatRun.id,
      pipelineName: activeForegroundChatRun.pipelineName,
      startedAt: activeForegroundChatRun.startedAt,
      latestDeepResearchRunId: latestDeepResearchRun?.id ?? null,
      latestDeepResearchStatus: latestDeepResearchRun?.status ?? null,
      latestDeepResearchState: latestDeepResearchMetadata.deepResearchState ?? null,
    });
  } catch (error) {
    console.error("Check active run error:", error);
    return NextResponse.json({
      hasActiveRun: false,
      runId: null,
    }, { status: 500 });
  }
}
