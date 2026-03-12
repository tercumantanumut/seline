import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { AGENCY_AGENTS_SKILLS } from "@/lib/skills/catalog/agency-agents";
import { getCatalogSkillById } from "@/lib/skills/catalog";
import { loadBundledSkillMarkdown } from "@/lib/skills/catalog/bundled-loader";
import type { CatalogSkill } from "@/lib/skills/catalog/types";

export const runtime = "nodejs";

/**
 * GET /api/skills/catalog/:id/content
 * Returns the full bundled markdown content for a catalog skill (including agency agents).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth(req);
    const { id } = await params;

    // Search both regular catalog and agency agents
    let skill: CatalogSkill | undefined = getCatalogSkillById(id);
    if (!skill) {
      skill = AGENCY_AGENTS_SKILLS.find((s) => s.id === id);
    }

    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    if (skill.installSource.type !== "bundled") {
      return NextResponse.json(
        { error: "Only bundled skills support content loading" },
        { status: 400 }
      );
    }

    const markdown = await loadBundledSkillMarkdown(skill.id, skill.installSource);

    return NextResponse.json({ markdown });
  } catch (error) {
    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    console.error("[Skills Catalog Content API] GET error:", error);
    return NextResponse.json(
      { error: "Failed to load skill content" },
      { status: 500 }
    );
  }
}
