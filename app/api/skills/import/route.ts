import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { parseSkillPackage, parseSingleSkillMd } from "@/lib/skills/import-parser";
import { importSkillPackage } from "@/lib/skills/queries";
import { parsePluginPackage } from "@/lib/plugins/import-parser";
import { installPlugin } from "@/lib/plugins/registry";

export const runtime = "nodejs";
export const maxDuration = 60; // 1 minute timeout for large files

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).slice(2, 8);
  console.log(`[SkillImport:${requestId}] Request started at ${new Date().toISOString()}`);

  try {
    const authUserId = await requireAuth(request);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(authUserId, settings.localUserEmail);

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const characterId = formData.get("characterId") as string | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!characterId) {
      return NextResponse.json({ error: "No characterId provided" }, { status: 400 });
    }

    // Validate file type
    const isZip = file.name.endsWith(".zip");
    const isMd = file.name.endsWith(".md");

    if (!isZip && !isMd) {
      return NextResponse.json(
        { error: "Only .zip packages or .md files are supported" },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB)
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 50MB limit" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // For .md files, use the legacy single-skill parser directly
    if (isMd) {
      const parsedSkill = await parseSingleSkillMd(buffer, file.name);
      const skill = await importSkillPackage({
        userId: dbUser.id,
        characterId,
        parsedSkill,
      });
      return NextResponse.json({
        success: true,
        type: "skill",
        skillId: skill.id,
        skillName: skill.name,
        filesImported: parsedSkill.files.length,
        scriptsFound: parsedSkill.scripts.length,
      });
    }

    // For .zip files, try plugin format first, then fall back to legacy skill
    try {
      const parsed = await parsePluginPackage(buffer);

      if (parsed.isLegacySkillFormat) {
        // Legacy SKILL.md zip — use existing skill import flow
        console.log(`[SkillImport:${requestId}] Detected legacy SKILL.md format, using skill import flow`);
        const parsedSkill = await parseSkillPackage(buffer);
        const skill = await importSkillPackage({
          userId: dbUser.id,
          characterId,
          parsedSkill,
        });
        return NextResponse.json({
          success: true,
          type: "skill",
          skillId: skill.id,
          skillName: skill.name,
          filesImported: parsedSkill.files.length,
          scriptsFound: parsedSkill.scripts.length,
        });
      }

      // Full plugin format — install as plugin
      console.log(`[SkillImport:${requestId}] Detected full plugin format: ${parsed.manifest.name}`);
      const plugin = await installPlugin({
        userId: dbUser.id,
        characterId,
        parsed,
        scope: "user",
      });

      return NextResponse.json({
        success: true,
        type: "plugin",
        pluginId: plugin.id,
        pluginName: plugin.name,
        pluginVersion: plugin.version,
        skillsImported: parsed.components.skills.length,
        agentsImported: parsed.components.agents.length,
        hasHooks: parsed.components.hooks !== null,
        hasMcpServers: parsed.components.mcpServers !== null,
        hasLspServers: parsed.components.lspServers !== null,
        warnings: parsed.warnings,
      });
    } catch (pluginError) {
      // If plugin parsing fails, try legacy skill parsing as fallback
      console.log(`[SkillImport:${requestId}] Plugin parse failed, trying legacy skill format:`, pluginError);
      try {
        const parsedSkill = await parseSkillPackage(buffer);
        const skill = await importSkillPackage({
          userId: dbUser.id,
          characterId,
          parsedSkill,
        });
        return NextResponse.json({
          success: true,
          type: "skill",
          skillId: skill.id,
          skillName: skill.name,
          filesImported: parsedSkill.files.length,
          scriptsFound: parsedSkill.scripts.length,
        });
      } catch (skillError) {
        // Both parsers failed — report the plugin error (more informative)
        throw pluginError;
      }
    }
  } catch (error) {
    console.error(`[SkillImport:${requestId}] Error:`, error);

    if (error instanceof Error &&
        (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Import failed" },
      { status: 500 }
    );
  }
}
