import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { clearVoiceHistory, deleteVoiceHistoryEntry, getVoiceHistory } from "@/lib/voice/voice-utils";

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get("sessionId") || undefined;
    const limitParam = searchParams.get("limit");

    const parsedLimit = limitParam ? Number(limitParam) : undefined;
    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(Math.floor(parsedLimit as number), 500))
      : undefined;

    const items = await getVoiceHistory({ sessionId, limit });

    return NextResponse.json({ success: true, items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load voice history";
    console.error("[Voice API] History GET failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await requireAuth(req);

    const { searchParams } = new URL(req.url);
    const entryId = searchParams.get("id");
    const sessionId = searchParams.get("sessionId") || undefined;

    if (entryId) {
      await deleteVoiceHistoryEntry(entryId);
    } else {
      await clearVoiceHistory(sessionId);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to clear voice history";
    console.error("[Voice API] History DELETE failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
