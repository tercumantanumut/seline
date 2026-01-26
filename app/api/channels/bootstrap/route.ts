import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getOrCreateLocalUser } from "@/lib/db/queries";
import { getChannelManager } from "@/lib/channels/manager";

export async function POST(req: Request) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    await getOrCreateLocalUser(userId, settings.localUserEmail);

    await getChannelManager().bootstrap();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Channel bootstrap error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to bootstrap channels" },
      { status: 500 }
    );
  }
}
