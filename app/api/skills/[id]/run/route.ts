import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser, createSession, createMessage } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getSkillById, updateSkillRunStats } from "@/lib/skills/queries";
import { runSkillSchema } from "@/lib/skills/validation";
import { renderSkillPrompt } from "@/lib/skills/runtime";
import { trackSkillTelemetryEvent } from "@/lib/skills/telemetry";
import { getCharacterFull } from "@/lib/characters/queries";
import { nextOrderingIndex } from "@/lib/session/message-ordering";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * "Run Now" from the skill detail page.
 *
 * Creates a dedicated session with the skill's rendered prompt as the user
 * message, then fires the chat API against that session. Returns the
 * sessionId so the UI can redirect the user to the live conversation.
 */
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

    // ── 1. Create a dedicated session for this skill run ──
    const character = await getCharacterFull(skill.characterId);
    const session = await createSession({
      title: `Skill: ${skill.name} - ${new Date().toLocaleDateString()}`,
      userId: dbUser.id,
      metadata: {
        characterId: skill.characterId,
        skillId: skill.id,
        skillRunManual: true,
      },
    });
    const sessionId = session.id;

    // ── 2. Persist the user message so it shows in the conversation ──
    await createMessage({
      sessionId,
      role: "user",
      content: [{ type: "text", text: rendered.prompt }],
      orderingIndex: await nextOrderingIndex(sessionId),
      metadata: {
        skillId: skill.id,
        skillRunManual: true,
      },
    });

    // ── 3. Fire the chat API against the new session ──
    const baseUrl = req.nextUrl.origin;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300_000);

    try {
      const chatResponse = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: req.headers.get("cookie") || "",
        },
        body: JSON.stringify({
          sessionId,
          characterId: skill.characterId,
          messages: [{ role: "user", content: rendered.prompt }],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Consume the streaming body so the inner request completes fully
      try {
        await chatResponse.text();
      } catch {
        // Body consumption may fail if the stream errored; that's OK.
      }

      const succeeded = chatResponse.ok;
      await updateSkillRunStats(skill.id, dbUser.id, succeeded);
      await trackSkillTelemetryEvent({
        userId: dbUser.id,
        eventType: "skill_manual_run",
        skillId: skill.id,
        characterId: skill.characterId,
        metadata: { succeeded, via: "skillDetailRunNow" },
      });

      if (!chatResponse.ok) {
        console.error(`[Skills API] Chat API failed: ${chatResponse.status}`);
        return NextResponse.json(
          {
            success: false,
            error: "Skill run started but the agent encountered an error.",
            sessionId,
            characterId: skill.characterId,
          },
          { status: chatResponse.status }
        );
      }

      return NextResponse.json({
        success: true,
        skillId: skill.id,
        sessionId,
        characterId: skill.characterId,
        renderedPrompt: rendered.prompt,
        resolvedParameters: rendered.resolvedParameters,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      // Even if the chat call failed, the session exists — return it so the
      // user can still navigate there and see whatever partial output landed.
      console.error("[Skills API] Chat execution error:", error);
      return NextResponse.json(
        {
          success: false,
          error: error instanceof Error ? error.message : "Failed to run skill",
          sessionId,
          characterId: skill.characterId,
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error("[Skills API] POST [id]/run error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to run skill" },
      { status: 500 }
    );
  }
}
