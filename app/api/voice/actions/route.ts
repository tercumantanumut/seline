import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { runVoiceAction, VOICE_ACTIONS, type VoiceActionType } from "@/lib/voice/voice-utils";

// POST — run a voice action on text. Body: { text: string, action: VoiceActionType, sessionId?: string, targetLanguage?: string }
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);
    const body = await req.json() as {
      text?: unknown;
      action?: unknown;
      sessionId?: unknown;
      targetLanguage?: unknown;
    };

    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      return NextResponse.json({ error: "text is required and must be a non-empty string" }, { status: 400 });
    }

    if (typeof body.action !== "string" || !(VOICE_ACTIONS as readonly string[]).includes(body.action)) {
      return NextResponse.json(
        { error: `action must be one of: ${VOICE_ACTIONS.join(", ")}` },
        { status: 400 }
      );
    }

    const result = await runVoiceAction({
      text: body.text.trim(),
      action: body.action as VoiceActionType,
      sessionId: typeof body.sessionId === "string" ? body.sessionId : undefined,
      targetLanguage: typeof body.targetLanguage === "string" ? body.targetLanguage : undefined,
    });

    return NextResponse.json({ success: true, text: result.text, provider: result.provider });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Voice action failed";
    console.error("[Voice API] Action POST failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
