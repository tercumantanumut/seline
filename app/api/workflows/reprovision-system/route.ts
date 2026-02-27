import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getUserDefaultCharacter, updateCharacter } from "@/lib/characters/queries";
import { ensureSystemAgentsExist } from "@/lib/characters/templates";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const defaultAgent = await getUserDefaultCharacter(dbUser.id);
    if (!defaultAgent) {
      return NextResponse.json(
        { error: "No default agent found" },
        { status: 404 }
      );
    }

    // Clear dismissal flags so ensureSystemAgentsExist will recreate the workflow
    const meta = (defaultAgent.metadata ?? {}) as Record<string, unknown>;
    await updateCharacter(defaultAgent.id, {
      metadata: {
        ...meta,
        systemWorkflowDismissed: false,
        dismissedSystemAgentIds: [],
      },
    });

    await ensureSystemAgentsExist(dbUser.id, defaultAgent.id);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.error("[Workflows API] reprovision error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to reprovision system agents" },
      { status: 500 }
    );
  }
}
