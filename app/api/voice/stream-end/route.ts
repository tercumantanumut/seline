import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { endSession } from "@/lib/audio/vosk-session";

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);

    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId || typeof sessionId !== "string") {
      return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
    }

    const result = endSession(sessionId);

    return NextResponse.json({
      sessionId,
      text: result.text,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to end voice session";
    console.error("[Voice API] stream-end failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
