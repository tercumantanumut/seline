/**
 * Active Tasks Endpoint
 *
 * Returns active tasks for the authenticated user.
 */

import { NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { taskRegistry } from "@/lib/background-tasks/registry";
import { isTaskSuppressedFromUI } from "@/lib/background-tasks/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth(request);
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }

  const { tasks } = taskRegistry.list({ userId });
  const visibleTasks = tasks.filter((task) => !isTaskSuppressedFromUI(task));

  return Response.json({
    tasks: visibleTasks,
    timestamp: new Date().toISOString(),
  });
}
