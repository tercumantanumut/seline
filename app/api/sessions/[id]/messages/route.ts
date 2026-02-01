import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getSessionWithMessages } from "@/lib/db/queries";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";

type RouteParams = { params: Promise<{ id: string }> };

/**
 * GET - Fetch all messages for a session
 * Used to refresh messages after background processing completes
 */
export async function GET(req: Request, { params }: RouteParams) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id: sessionId } = await params;

    const sessionWithMessages = await getSessionWithMessages(sessionId);

    if (!sessionWithMessages || sessionWithMessages.session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      messages: sessionWithMessages.messages,
    });
  } catch (error) {
    console.error("Fetch session messages error:", error);
    return NextResponse.json({ error: "Failed to fetch messages" }, { status: 500 });
  }
}
