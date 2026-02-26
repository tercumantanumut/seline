import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getAgentRun, markRunAsCancelled } from "@/lib/observability/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { abortChatRun, removeChatAbortController } from "@/lib/background-tasks/chat-abort-registry";
import { isStale } from "@/lib/utils/timestamp";
import { taskRegistry } from "@/lib/background-tasks/registry";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * POST - Cancel a running agent run (background chat)
 */
export async function POST(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: runId } = await params;

    const run = await getAgentRun(runId);

    if (!run || run.userId !== dbUser.id) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    if (run.status !== "running") {
      return NextResponse.json({ error: "Run is not running", status: run.status }, { status: 409 });
    }

    const registryTask = taskRegistry.get(runId);
    const registryDurationMs = registryTask
      ? Date.now() - new Date(registryTask.startedAt).getTime()
      : undefined;

    const aborted = abortChatRun(runId, "user_cancelled");
    if (!aborted) {
      const hasRegistryTask = Boolean(registryTask);
      const isZombie = isStale(run.updatedAt ?? run.startedAt, 30 * 60 * 1000);
      if (hasRegistryTask && !isZombie) {
        return NextResponse.json({ error: "Run is not cancellable" }, { status: 409 });
      }

      await markRunAsCancelled(runId, "force_cancelled", { forceCancelled: true });
      taskRegistry.updateStatus(runId, "cancelled", {
        durationMs: registryDurationMs,
      });
      removeChatAbortController(runId);
      return NextResponse.json({ cancelled: true, forced: true });
    }

    await markRunAsCancelled(runId, "user_cancelled");
    taskRegistry.updateStatus(runId, "cancelled", {
      durationMs: registryDurationMs,
    });
    removeChatAbortController(runId);

    return NextResponse.json({ cancelled: true });
  } catch (error) {
    console.error("Cancel run error:", error);
    return NextResponse.json({ error: "Failed to cancel run" }, { status: 500 });
  }
}
