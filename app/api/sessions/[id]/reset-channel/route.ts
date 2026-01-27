import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/local-auth";
import { loadSettings } from "@/lib/settings/settings-manager";
import {
  createChannelConversation,
  createSession,
  findChannelConversation,
  getChannelConnection,
  getChannelConversation,
  getOrCreateLocalUser,
  getSession,
  updateChannelConversation,
  updateSession,
} from "@/lib/db/queries";
import { getChannelManager } from "@/lib/channels/manager";

function buildConversationTitle(
  channelType: string,
  peerName?: string | null,
  peerId?: string | null
) {
  const label = channelType.charAt(0).toUpperCase() + channelType.slice(1);
  if (peerName) {
    return `${label}: ${peerName}`;
  }
  if (peerId) {
    return `${label}: ${peerId}`;
  }
  return `${label} conversation`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await requireAuth(req);
    const settings = loadSettings();
    const dbUser = await getOrCreateLocalUser(userId, settings.localUserEmail);

    const { id } = await params;
    const session = await getSession(id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.userId !== dbUser.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const metadata = (session.metadata || {}) as Record<string, unknown>;
    const channelType = metadata.channelType as string | undefined;
    const channelConnectionId = metadata.channelConnectionId as string | undefined;
    const channelPeerId = metadata.channelPeerId as string | undefined;
    const channelPeerName = (metadata.channelPeerName as string | null | undefined) ?? null;
    const channelThreadId = (metadata.channelThreadId as string | null | undefined) ?? null;
    const channelConversationId = metadata.channelConversationId as string | undefined;

    if (!channelType || !channelConnectionId || !channelPeerId) {
      return NextResponse.json(
        { error: "Session is not linked to a channel" },
        { status: 400 }
      );
    }

    const connection = await getChannelConnection(channelConnectionId);
    if (!connection || connection.userId !== dbUser.id) {
      return NextResponse.json(
        { error: "Channel connection not found" },
        { status: 404 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const archiveOld = Boolean((body as { archiveOld?: boolean }).archiveOld);

    const baseMetadata = { ...metadata };
    delete baseMetadata.channelConversationId;
    if (!baseMetadata.characterId) {
      baseMetadata.characterId = connection.characterId;
    }

    const newSession = await createSession({
      title: buildConversationTitle(
        channelType,
        channelPeerName,
        channelPeerId
      ),
      userId: dbUser.id,
      metadata: baseMetadata,
    });

    let conversation = channelConversationId
      ? await getChannelConversation(channelConversationId)
      : await findChannelConversation({
          connectionId: channelConnectionId,
          peerId: channelPeerId,
          threadId: channelThreadId,
        });

    if (!conversation) {
      conversation = await createChannelConversation({
        connectionId: channelConnectionId,
        characterId:
          (metadata.characterId as string | undefined) ?? connection.characterId,
        channelType: channelType as "whatsapp" | "telegram" | "slack",
        peerId: channelPeerId,
        peerName: channelPeerName,
        threadId: channelThreadId,
        sessionId: newSession.id,
        lastMessageAt: new Date().toISOString(),
      });
    } else {
      const updated = await updateChannelConversation(conversation.id, {
        sessionId: newSession.id,
        peerName: channelPeerName ?? conversation.peerName ?? null,
        lastMessageAt: new Date().toISOString(),
      });
      conversation = updated ?? conversation;
    }

    const updatedSession = await updateSession(newSession.id, {
      metadata: {
        ...baseMetadata,
        channelConversationId: conversation.id,
      },
    });

    if (archiveOld) {
      await updateSession(session.id, { status: "archived" });
    }

    if (channelType !== "whatsapp") {
      try {
        const manager = getChannelManager();
        await manager.sendMessage(connection.id, {
          peerId: channelPeerId,
          threadId: channelThreadId ?? undefined,
          text: "Started a new session. Send your next message to begin.",
        });
      } catch (error) {
        console.warn("[Channels] Failed to send reset confirmation:", error);
      }
    }

    return NextResponse.json({ session: updatedSession ?? newSession });
  } catch (error) {
    console.error("Failed to reset channel session:", error);
    return NextResponse.json(
      { error: "Failed to reset channel session" },
      { status: 500 }
    );
  }
}
