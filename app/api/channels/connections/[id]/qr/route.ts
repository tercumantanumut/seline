import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import { getChannelConnection, getOrCreateLocalUser } from "@/lib/db/queries";
import { getChannelManager } from "@/lib/channels/manager";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const qr = getChannelManager().getQrCode(id);
    const dataUrl = qr ? await QRCode.toDataURL(qr, { margin: 1, width: 240 }) : null;

    return NextResponse.json({ qr, dataUrl });
  } catch (error) {
    console.error("Channel QR error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch QR" },
      { status: 500 }
    );
  }
}
