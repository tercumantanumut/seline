import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { agentWorkflows } from "@/lib/db/sqlite-workflows-schema";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { createManualWorkflow, getWorkflowMembers } from "@/lib/agents/workflows";

const createWorkflowSchema = z.object({
  initiatorId: z.string().min(1),
  subAgentIds: z.array(z.string().min(1)).default([]),
  name: z.string().min(1).max(160).optional(),
});

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const statusParam = req.nextUrl.searchParams.get("status") || "active";

    const workflows = await db
      .select()
      .from(agentWorkflows)
      .where(
        and(
          eq(agentWorkflows.userId, dbUser.id),
          statusParam === "all"
            ? ne(agentWorkflows.status, "archived")
            : eq(agentWorkflows.status, statusParam as "active" | "paused" | "archived")
        )
      );

    // Fetch members for each workflow
    const results = await Promise.all(
      workflows.map(async (wf) => {
        const members = await getWorkflowMembers(wf.id);

        return {
          id: wf.id,
          name: wf.name,
          initiatorId: wf.initiatorId,
          status: wf.status,
          metadata: wf.metadata,
          memberCount: members.length,
          members: members.map((member) => ({
            agentId: member.agentId,
            role: member.role,
          })),
          createdAt: wf.createdAt,
          updatedAt: wf.updatedAt,
        };
      })
    );

    return NextResponse.json({ workflows: results });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Workflows API] list error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list workflows" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const body = await req.json();

    const parsed = createWorkflowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const workflow = await createManualWorkflow({
      userId: dbUser.id,
      initiatorId: parsed.data.initiatorId,
      subAgentIds: parsed.data.subAgentIds,
      name: parsed.data.name,
    });

    const members = await getWorkflowMembers(workflow.id);

    return NextResponse.json({
      success: true,
      workflow,
      members,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (
      error instanceof Error &&
      (error.message === "Agent not found" ||
        error.message === "Agent already belongs to an active workflow")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[Workflows API] create error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create workflow" },
      { status: 500 }
    );
  }
}
