import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { shareFolderToWorkflowSubagents } from "@/lib/agents/workflows";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: workflowId } = await params;

    const body = await req.json();
    const { folderId, dryRun } = body as { folderId?: string; dryRun?: boolean };

    if (!folderId || typeof folderId !== "string") {
      return NextResponse.json({ error: "folderId is required" }, { status: 400 });
    }

    const result = await shareFolderToWorkflowSubagents({
      workflowId,
      folderId,
      userId: dbUser.id,
      dryRun: dryRun === true,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && (error.message === "Workflow not found" || error.message === "Folder not found")) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    console.error("[Workflows API] share-folder error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to share folder" },
      { status: 500 }
    );
  }
}
