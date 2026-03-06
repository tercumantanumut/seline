import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getAllCatalogSkills, SYSTEM_SKILLS } from "@/lib/skills/catalog";
import type { CatalogSkillWithStatus } from "@/lib/skills/catalog/types";
import { listSkillsForUser } from "@/lib/skills/queries";

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const characterId = req.nextUrl.searchParams.get("characterId") || undefined;

    const installedSkills = await listSkillsForUser(dbUser.id, { all: true, limit: 500, characterId });
    const installedByCatalogId = new Map<string, { id: string; isEnabled: boolean }>();

    for (const skill of installedSkills) {
      if (!skill.catalogId) continue;
      installedByCatalogId.set(skill.catalogId, {
        id: skill.id,
        isEnabled: skill.status === "active",
      });
    }

    const allCatalog = getAllCatalogSkills();

    const toStatus = (id: string): Pick<CatalogSkillWithStatus, "isInstalled" | "installedSkillId" | "isEnabled"> => {
      const installed = installedByCatalogId.get(id);
      if (!installed) {
        return {
          isInstalled: false,
          installedSkillId: null,
          isEnabled: null,
        };
      }

      return {
        isInstalled: true,
        installedSkillId: installed.id,
        isEnabled: installed.isEnabled,
      };
    };

    const catalog: CatalogSkillWithStatus[] = allCatalog
      .filter((skill) => !SYSTEM_SKILLS.some((systemSkill) => systemSkill.id === skill.id))
      .map((skill) => ({
        ...skill,
        ...toStatus(skill.id),
      }));

    const systemSkills: CatalogSkillWithStatus[] = SYSTEM_SKILLS.map((skill) => ({
      ...skill,
      ...toStatus(skill.id),
    }));

    return NextResponse.json({
      catalog,
      systemSkills,
      installedSkills,
    });
  } catch (error) {
    console.error("[Skills Catalog API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch skill catalog" },
      { status: 500 }
    );
  }
}
