import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getUserDefaultCharacter, updateCharacter } from "@/lib/characters/queries";
import { ensureSystemAgentsExist, createAgentFromTemplate, getDefaultTemplate } from "@/lib/characters/templates";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    let defaultAgent = await getUserDefaultCharacter(dbUser.id);

    // If no default agent exists, recreate the Selene agent from template
    if (!defaultAgent) {
      const seleneTemplate = getDefaultTemplate();
      if (!seleneTemplate) {
        return NextResponse.json(
          { error: "No default template found" },
          { status: 500 }
        );
      }

      const newAgentId = await createAgentFromTemplate(dbUser.id, seleneTemplate);
      if (!newAgentId) {
        return NextResponse.json(
          { error: "Failed to recreate default agent" },
          { status: 500 }
        );
      }

      defaultAgent = await getUserDefaultCharacter(dbUser.id);
      if (!defaultAgent) {
        return NextResponse.json(
          { error: "Default agent created but not found" },
          { status: 500 }
        );
      }
    }

    // Clear dismissal flags AND reset provisioning flag so ensureSystemAgentsExist
    // will re-create any deleted system agents (not just maintain the workflow).
    const meta = (defaultAgent.metadata ?? {}) as Record<string, unknown>;
    await updateCharacter(defaultAgent.id, {
      metadata: {
        ...meta,
        systemWorkflowDismissed: false,
        dismissedSystemAgentIds: [],
        systemAgentsProvisioned: false,
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
