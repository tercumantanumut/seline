import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  parsePluginFromFiles,
  parsePluginFromMarkdown,
  parsePluginPackage,
} from "@/lib/plugins/import-parser";
import { installPlugin } from "@/lib/plugins/registry";
import type { PluginParseResult, PluginScope } from "@/lib/plugins/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);

  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const formData = await request.formData();
    const singleFile = formData.get("file") as File | null;
    const multipleFiles = formData.getAll("files").filter((f): f is File => f instanceof File);
    const characterId = formData.get("characterId") as string | null;
    const scope = (formData.get("scope") as PluginScope | null) || "user";
    const marketplaceName = formData.get("marketplaceName") as string | null;

    const uploadFiles = multipleFiles.length > 0 ? multipleFiles : singleFile ? [singleFile] : [];

    if (uploadFiles.length === 0) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const maxSizePerFile = 50 * 1024 * 1024;
    const totalSize = uploadFiles.reduce((sum, file) => sum + file.size, 0);
    if (uploadFiles.some((file) => file.size > maxSizePerFile)) {
      return NextResponse.json(
        { error: "One or more files exceed the 50MB per-file limit" },
        { status: 400 }
      );
    }
    if (totalSize > 150 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Total upload size exceeds 150MB limit" },
        { status: 400 }
      );
    }

    let parsed: PluginParseResult;

    if (uploadFiles.length === 1) {
      const file = uploadFiles[0];
      const lowerName = file.name.toLowerCase();
      const buffer = Buffer.from(await file.arrayBuffer());

      if (lowerName.endsWith(".zip")) {
        parsed = await parsePluginPackage(buffer, { sourceLabel: file.name.replace(/\.zip$/i, "") });
      } else if (lowerName.endsWith(".md") || lowerName.endsWith(".mds")) {
        parsed = await parsePluginFromMarkdown(buffer, file.name);
      } else {
        return NextResponse.json(
          { error: "Single-file imports must be .zip or .md. For folder imports, upload multiple files." },
          { status: 400 }
        );
      }
    } else {
      const uploaded = await Promise.all(
        uploadFiles.map(async (file) => ({
          relativePath: file.name,
          content: Buffer.from(await file.arrayBuffer()),
        }))
      );

      const topLevel = uploaded
        .map((f) => f.relativePath.split("/")[0])
        .filter(Boolean);
      const sourceLabel = topLevel.length > 0 ? topLevel[0] : "folder-import";

      parsed = await parsePluginFromFiles(uploaded, { sourceLabel });
    }

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
