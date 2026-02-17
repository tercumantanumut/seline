import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getCharacter } from "@/lib/characters/queries";
import {
  getAvailablePluginsForAgent,
  setPluginEnabledForAgent,
} from "@/lib/plugins/registry";
import { z } from "zod";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

const updateAgentPluginSchema = z.object({
  pluginId: z.string().min(1),
  enabled: z.boolean(),
});

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);
    const { id } = await params;

    const character = await getCharacter(id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const assignments = await getAvailablePluginsForAgent(dbUser.id, id, id);

    return NextResponse.json({
      plugins: assignments.map((entry) => ({
        ...entry.plugin,
        enabledForAgent: entry.enabledForAgent,
      })),
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list agent plugins" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);
    const { id } = await params;

    const character = await getCharacter(id);
    if (!character) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }
    if (character.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = updateAgentPluginSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const available = await getAvailablePluginsForAgent(dbUser.id, id, id);
    const canAssign = available.some((entry) => entry.plugin.id === parsed.data.pluginId);
    if (!canAssign) {
      return NextResponse.json(
        { error: "Plugin not available for this agent" },
        { status: 400 }
      );
    }

    await setPluginEnabledForAgent(id, parsed.data.pluginId, parsed.data.enabled);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update agent plugin" },
      { status: 500 }
    );
  }
}
