/**
 * Task Registry Debug Endpoint
 *
 * Returns task registry stats for debugging in development.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { isLocalEnvironment } from "@/lib/utils/environment";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireAuth(request);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  // Only allow in local environments (development and Electron production)
  if (!isLocalEnvironment()) {
    return new Response("Forbidden", { status: 403 });
  }

  const { tasks, total } = taskRegistry.list();
  const cleanupStats = taskRegistry.getCleanupStats();

  return Response.json({
    activeTasks: {
      total,
      byType: {
        chat: tasks.filter((t) => t.type === "chat").length,
        scheduled: tasks.filter((t) => t.type === "scheduled").length,
        channel: tasks.filter((t) => t.type === "channel").length,
      },
      byStatus: {
        running: tasks.filter((t) => t.status === "running").length,
        queued: tasks.filter((t) => t.status === "queued").length,
      },
    },
    cleanup: cleanupStats,
    oldestTask:
      tasks.length > 0
        ? tasks.reduce((oldest, task) =>
            new Date(task.startedAt) < new Date(oldest.startedAt) ? task : oldest
          )
        : null,
  });
}
