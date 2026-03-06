import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getCatalogSkillById } from "@/lib/skills/catalog";
import { loadBundledSkillMarkdown } from "@/lib/skills/catalog/bundled-loader";
import { fetchSkillFromGitHub } from "@/lib/skills/catalog/github-fetch";
import type { CatalogInstallRequest } from "@/lib/skills/catalog/types";
import { parseSingleSkillMd } from "@/lib/skills/import-parser";
import { assertCharacterOwnership, importSkillPackage, listSkillsForUser } from "@/lib/skills/queries";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const body = (await req.json()) as CatalogInstallRequest;
    const catalogSkillId = body?.catalogSkillId?.trim();
    const characterId = body?.characterId?.trim();

    if (!catalogSkillId || !characterId) {
      return NextResponse.json({ error: "catalogSkillId and characterId are required" }, { status: 400 });
    }

    const ownsCharacter = await assertCharacterOwnership(characterId, dbUser.id);
    if (!ownsCharacter) {
      return NextResponse.json({ error: "Character not found" }, { status: 404 });
    }

    const catalogSkill = getCatalogSkillById(catalogSkillId);
    if (!catalogSkill) {
      return NextResponse.json(
        { error: "Skill not found in catalog", code: "not_found" },
        { status: 404 }
      );
    }

    const existingSkills = await listSkillsForUser(dbUser.id, { all: true, limit: 500 });
    const existing = existingSkills.find(
      (skill) => skill.characterId === characterId && skill.catalogId === catalogSkillId
    );

    if (existing) {
      return NextResponse.json(
        {
          error: "Skill already installed",
          code: "already_installed",
          existingSkillId: existing.id,
        },
        { status: 409 }
      );
    }

    const markdown =
      catalogSkill.installSource.type === "bundled"
        ? await loadBundledSkillMarkdown(catalogSkill.id, catalogSkill.installSource)
        : await fetchSkillFromGitHub(catalogSkill.installSource);

    const parsedSkill = await parseSingleSkillMd(Buffer.from(markdown, "utf-8"), `${catalogSkill.id}.md`);

    const installed = await importSkillPackage({
      userId: dbUser.id,
      characterId,
      parsedSkill,
      sourceType: "catalog",
      catalogId: catalogSkill.id,
      icon: catalogSkill.icon,
      status: "active",
      categoryOverride: catalogSkill.category,
      nameOverride: catalogSkill.displayName,
      descriptionOverride: catalogSkill.shortDescription,
    });

    return NextResponse.json({
      installed: true,
      skillId: installed.id,
      name: installed.name,
    });
  } catch (error) {
    console.error("[Skills Catalog Install API] POST error:", error);

    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to install catalog skill" },
      { status: 500 }
    );
  }
}
