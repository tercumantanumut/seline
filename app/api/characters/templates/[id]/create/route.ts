import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { createAgentFromTemplate, getTemplate } from "@/lib/characters/templates";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const template = getTemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const characterId = await createAgentFromTemplate(dbUser.id, template);
    if (!characterId) {
      return NextResponse.json({ error: "Failed to create agent from template" }, { status: 500 });
    }

    return NextResponse.json({ success: true, characterId, templateId: id });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create from template" }, { status: 500 });
  }
}
