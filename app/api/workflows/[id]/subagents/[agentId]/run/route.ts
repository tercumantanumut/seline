import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  getWorkflowById,
  registerWorkflowSubagentLifecycle,
} from "@/lib/agents/workflows";

type RouteParams = { params: Promise<{ id: string; agentId: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: workflowId, agentId } = await params;

    const workflow = await getWorkflowById(workflowId, dbUser.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const body = await req.json().catch(() => ({}));
    const sessionId = (body as { sessionId?: string }).sessionId || crypto.randomUUID();

    const lifecycle = await registerWorkflowSubagentLifecycle({
      workflowId,
      userId: dbUser.id,
      agentId,
      sessionId,
    });

    return NextResponse.json({
      workflowRunId: lifecycle.workflowRunId,
      workflowId,
      agentId,
      sessionId,
      status: "started",
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Workflows API] subagent run error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to start sub-agent" },
      { status: 500 }
    );
  }
}
