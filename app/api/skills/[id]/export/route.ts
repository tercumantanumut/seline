import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getSkillById, getSkillFiles } from "@/lib/skills/queries";
import { buildSkillExportArtifact } from "@/lib/skills/export";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const skill = await getSkillById(id, dbUser.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const files = await getSkillFiles(id, dbUser.id);
    const exported = await buildSkillExportArtifact(skill, files);

    return new NextResponse(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        "Content-Type": exported.mimeType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Content-Length": String(exported.buffer.length),
      },
    });
  } catch (error) {
    console.error("[Skills API] GET [id]/export error:", error);

    if (error instanceof Error && (error.message === "Unauthorized" || error.message === "Invalid session")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export skill" },
      { status: 500 }
    );
  }
}
