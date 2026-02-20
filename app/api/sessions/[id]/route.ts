import { NextRequest, NextResponse } from "next/server";
import {
  getSessionWithMessages,
  updateSession,
  getSession,
  getOrCreateLocalUser,
} from "@/lib/db/queries";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";

// Helper to validate session ownership
async function validateSessionOwnership(sessionId: string, userId: string) {
  const session = await getSession(sessionId);
  if (!session) {
    return { error: "Session not found", status: 404 };
  }
  if (session.userId !== userId) {
    return { error: "Forbidden", status: 403 };
  }
  return { session };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get local user for offline mode
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    // Validate ownership
    const ownershipResult = await validateSessionOwnership(id, dbUser.id);
    if ("error" in ownershipResult) {
      return NextResponse.json(
        { error: ownershipResult.error },
        { status: ownershipResult.status }
      );
    }

    const result = await getSessionWithMessages(id);

    if (!result) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    console.log(`[API] Session ${id}: Found ${result.messages.length} messages in DB`);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to get session:", error);
    return NextResponse.json(
      { error: "Failed to get session" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get local user for offline mode
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    // Validate ownership
    const ownershipResult = await validateSessionOwnership(id, dbUser.id);
    if ("error" in ownershipResult) {
      return NextResponse.json(
        { error: ownershipResult.error },
        { status: ownershipResult.status }
      );
    }

    const body = await req.json();
    const { title, status, metadata } = body as {
      title?: string;
      status?: "active" | "archived" | "deleted";
      metadata?: Record<string, unknown>;
    };

    // Deep-merge metadata so partial updates don't lose existing fields
    const mergedMetadata =
      metadata !== undefined
        ? {
            ...((ownershipResult.session.metadata as Record<string, unknown>) ?? {}),
            ...metadata,
          }
        : undefined;

    const updated = await updateSession(id, {
      ...(title !== undefined && { title }),
      ...(status !== undefined && { status }),
      ...(mergedMetadata !== undefined && { metadata: mergedMetadata }),
    });

    return NextResponse.json({ session: updated });
  } catch (error) {
    console.error("Failed to update session:", error);
    return NextResponse.json(
      { error: "Failed to update session" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Get local user for offline mode
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;

    // Validate ownership
    const ownershipResult = await validateSessionOwnership(id, dbUser.id);
    if ("error" in ownershipResult) {
      return NextResponse.json(
        { error: ownershipResult.error },
        { status: ownershipResult.status }
      );
    }

    // Soft delete by setting status to 'deleted'
    await updateSession(id, { status: "deleted" });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete session:", error);
    return NextResponse.json(
      { error: "Failed to delete session" },
      { status: 500 }
    );
  }
}
