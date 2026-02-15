import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getSkillById, updateSkillRunStats } from "@/lib/skills/queries";
import { runSkillSchema } from "@/lib/skills/validation";
import { renderSkillPrompt } from "@/lib/skills/runtime";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;

    const skill = await getSkillById(id, dbUser.id);
    if (!skill) {
      return NextResponse.json({ error: "Skill not found" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = runSkillSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
    }

    const rendered = renderSkillPrompt(skill, parsed.data.parameters);
    if (rendered.missingParameters.length > 0) {
      return NextResponse.json(
        {
          error: "Missing required parameters",
          missingParameters: rendered.missingParameters,
        },
        { status: 400 }
      );
    }

    const baseUrl = req.nextUrl.origin;
    const chatResponse = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: req.headers.get("cookie") || "",
      },
      body: JSON.stringify({
        sessionId: req.headers.get("X-Session-Id") || undefined,
        characterId: skill.characterId,
        messages: [{ role: "user", content: rendered.prompt }],
      }),
    });

    const succeeded = chatResponse.ok;
    await updateSkillRunStats(skill.id, dbUser.id, succeeded);
    await trackSkillTelemetryEvent({
      userId: dbUser.id,
      eventType: "skill_manual_run",
      skillId: skill.id,
      characterId: skill.characterId,
      metadata: { succeeded },
    });

    if (!chatResponse.ok) {
      const errorText = await chatResponse.text();
      return NextResponse.json(
        {
          error: "Failed to execute skill",
          details: errorText,
        },
        { status: chatResponse.status }
      );
    }

    return NextResponse.json({
      success: true,
      skillId: skill.id,
      renderedPrompt: rendered.prompt,
      resolvedParameters: rendered.resolvedParameters,
      runTriggered: true,
    });
  } catch (error) {
    console.error("[Skills API] POST [id]/run error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run skill" },
      { status: 500 }
    );
  }
}
