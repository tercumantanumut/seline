import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { parsePluginPackage } from "@/lib/plugins/import-parser";
import { installPlugin } from "@/lib/plugins/registry";
import type { PluginScope } from "@/lib/plugins/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const characterId = formData.get("characterId") as string | null;
    const scope = (formData.get("scope") as PluginScope | null) || "user";
    const marketplaceName = formData.get("marketplaceName") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!file.name.endsWith(".zip")) {
      return NextResponse.json(
        { error: "Only .zip plugin packages are supported" },
        { status: 400 }
      );
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const parsed = await parsePluginPackage(buffer);

    console.log(
      `[PluginImport:${requestId}] Parsed plugin: ${parsed.manifest.name} v${parsed.manifest.version} ` +
      `(${parsed.components.skills.length} skills, ${parsed.components.agents.length} agents, ` +
      `hooks: ${parsed.components.hooks !== null}, mcp: ${parsed.components.mcpServers !== null})`
    );

    const plugin = await installPlugin({
      userId: dbUser.id,
      characterId: characterId || undefined,
      parsed,
      scope,
      marketplaceName: marketplaceName || undefined,
    });

    return NextResponse.json({
      success: true,
      plugin: {
        id: plugin.id,
        name: plugin.name,
        version: plugin.version,
        scope: plugin.scope,
        status: plugin.status,
      },
      components: {
        skills: parsed.components.skills.map((s) => ({
          name: s.name,
          namespacedName: s.namespacedName,
          description: s.description,
        })),
        agents: parsed.components.agents.map((a) => ({
          name: a.name,
          description: a.description,
        })),
        hasHooks: parsed.components.hooks !== null,
        mcpServers: parsed.components.mcpServers
          ? Object.keys(parsed.components.mcpServers)
          : [],
        lspServers: parsed.components.lspServers
          ? Object.keys(parsed.components.lspServers)
          : [],
      },
      isLegacySkillFormat: parsed.isLegacySkillFormat,
      warnings: parsed.warnings,
    });
  } catch (error) {
    console.error(`[PluginImport:${requestId}] Error:`, error);

    if (
      error instanceof Error &&
      (error.message === "Unauthorized" || error.message === "Invalid session")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Plugin import failed" },
      { status: 500 }
    );
  }
}
