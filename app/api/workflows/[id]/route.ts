import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  addSubagentToWorkflow,
  deleteWorkflow,
  getWorkflowById,
  getWorkflowMembers,
  removeWorkflowMember,
  setWorkflowInitiator,
  updateWorkflowConfig,
} from "@/lib/agents/workflows";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const workflowPatchSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("rename"),
    name: z.string().min(1).max(160),
  }),
  z.object({
    action: z.literal("setStatus"),
    status: z.enum(["active", "paused", "archived"]),
  }),
  z.object({
    action: z.literal("setInitiator"),
    initiatorId: z.string().min(1),
  }),
  z.object({
    action: z.literal("addSubagent"),
    agentId: z.string().min(1),
    syncFolders: z.boolean().optional(),
  }),
  z.object({
    action: z.literal("removeMember"),
    agentId: z.string().min(1),
    promoteToAgentId: z.string().min(1).optional(),
  }),
]);

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const workflow = await getWorkflowById(id, dbUser.id);
    if (!workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const members = await getWorkflowMembers(id);

    return NextResponse.json({
      workflow,
      members,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Workflows API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch workflow" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;
    const body = await req.json();

    const parsed = workflowPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const action = parsed.data.action;
    if (action === "rename") {
      await updateWorkflowConfig({
        workflowId: id,
        userId: dbUser.id,
        name: parsed.data.name,
      });
    } else if (action === "setStatus") {
      await updateWorkflowConfig({
        workflowId: id,
        userId: dbUser.id,
        status: parsed.data.status,
      });
    } else if (action === "setInitiator") {
      await setWorkflowInitiator({
        workflowId: id,
        userId: dbUser.id,
        initiatorId: parsed.data.initiatorId,
      });
    } else if (action === "addSubagent") {
      await addSubagentToWorkflow({
        workflowId: id,
        userId: dbUser.id,
        agentId: parsed.data.agentId,
        syncFolders: parsed.data.syncFolders,
      });
    } else if (action === "removeMember") {
      const result = await removeWorkflowMember({
        workflowId: id,
        userId: dbUser.id,
        agentId: parsed.data.agentId,
        promoteToAgentId: parsed.data.promoteToAgentId,
      });

      if (result.workflowDeleted) {
        return NextResponse.json({ success: true, workflowDeleted: true });
      }
    }

    const workflow = await getWorkflowById(id, dbUser.id);
    if (!workflow) {
      return NextResponse.json({ success: true, workflowDeleted: true });
    }

    const members = await getWorkflowMembers(id);
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
      (error.message === "Workflow not found" ||
        error.message === "Agent not found" ||
        error.message === "Selected agent is not a workflow member" ||
        error.message === "Agent is not a workflow member" ||
        error.message === "Cannot modify archived workflow" ||
        error.message === "Agent already belongs to an active workflow" ||
        error.message === "Agent is already in this workflow")
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("[Workflows API] PATCH error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update workflow" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    await deleteWorkflow(id, dbUser.id);
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Workflow not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    console.error("[Workflows API] DELETE error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete workflow" },
      { status: 500 }
    );
  }
}
