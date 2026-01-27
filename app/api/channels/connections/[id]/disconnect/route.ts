import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getChannelConnection, getOrCreateLocalUser } from "@/lib/db/queries";
import { getChannelManager } from "@/lib/channels/manager";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const connection = await getChannelConnection(id);
    if (!connection) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    if (connection.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await getChannelManager().disconnect(id);
    const refreshed = await getChannelConnection(id);

    return NextResponse.json({ connection: refreshed });
  } catch (error) {
    console.error("Disconnect channel error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to disconnect channel" },
      { status: 500 }
    );
  }
}
