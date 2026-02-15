import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { copySkill } from "@/lib/skills/queries";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const copySkillSchema = z.object({
  targetCharacterId: z.string().uuid(),
  targetName: z.string().min(1).max(120).optional(),
});

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;
    const body = await req.json();
    const parsed = copySkillSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const copied = await copySkill(
      {
        skillId: id,
        targetCharacterId: parsed.data.targetCharacterId,
        targetName: parsed.data.targetName,
      },
      dbUser.id
    );

    if (!copied) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, skill: copied }, { status: 201 });
  } catch (error) {
    console.error("[Skills API] POST [id]/copy error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to copy skill" },
      { status: 500 }
    );
  }
}
