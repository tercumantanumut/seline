import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getInstalledPlugins } from "@/lib/plugins/registry";
import type { PluginScope, PluginStatus } from "@/lib/plugins/types";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const { searchParams } = new URL(request.url);
    const scope = searchParams.get("scope") as PluginScope | null;
    const characterId = searchParams.get("characterId");
    const status = searchParams.get("status") as PluginStatus | null;

    const plugins = await getInstalledPlugins(dbUser.id, {
      scope: scope || undefined,
      characterId: characterId || undefined,
      status: status || undefined,
    });

    return NextResponse.json({ plugins });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list plugins" },
      { status: 500 }
    );
  }
}
