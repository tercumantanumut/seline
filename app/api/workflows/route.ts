import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { db } from "@/lib/db/sqlite-client";
import { agentWorkflows, agentWorkflowMembers } from "@/lib/db/sqlite-workflows-schema";
import { and, eq, ne } from "drizzle-orm";

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
        const members = await db
          .select({
            agentId: agentWorkflowMembers.agentId,
            role: agentWorkflowMembers.role,
          })
          .from(agentWorkflowMembers)
          .where(eq(agentWorkflowMembers.workflowId, wf.id));

        return {
          id: wf.id,
          name: wf.name,
          initiatorId: wf.initiatorId,
          status: wf.status,
          metadata: wf.metadata,
          memberCount: members.length,
          members,
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
