import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { getOrCreateLocalUser, getSession } from "@/lib/db/queries";
import { loadSettings } from "@/lib/settings/settings-manager";
import { exportSession } from "@/lib/export/session-export";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);
    const { id } = await params;
    const formatParam = (new URL(req.url).searchParams.get("format") || "markdown") as "markdown" | "json" | "text";
    const format = ["markdown", "json", "text"].includes(formatParam) ? formatParam : "markdown";

    const session = await getSession(id);
    if (!session || session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const exported = await exportSession(id, format);
    if (!exported) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json(exported);
  } catch (error) {
    console.error("Failed to export session:", error);
    return NextResponse.json({ error: "Failed to export session" }, { status: 500 });
  }
}

