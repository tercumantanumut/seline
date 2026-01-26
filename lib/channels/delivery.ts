import { readLocalFile } from "@/lib/storage/local-storage";
import {
  createChannelMessage,
  getChannelConnection,
  getChannelConversation,
  touchChannelConversation,
} from "@/lib/db/queries";
import type { DBContentPart } from "@/lib/messages/converter";
import { getChannelManager } from "./manager";
import type { ChannelAttachment } from "./types";

export async function deliverChannelReply(params: {
  sessionId: string;
  messageId: string;
  content: DBContentPart[];
  sessionMetadata: Record<string, unknown>;
}): Promise<void> {
  const conversationId = params.sessionMetadata.channelConversationId as string | undefined;
  if (!conversationId) {
    return;
  }

  const conversation = await getChannelConversation(conversationId);
  if (!conversation) {
    return;
  }

  const connection = await getChannelConnection(conversation.connectionId);
  if (!connection) {
    return;
  }

  const { text, attachments } = await buildOutgoingPayload(params.content);
  if (!text && attachments.length === 0) {
    return;
  }

  const manager = getChannelManager();
  const result = await manager.sendMessage(connection.id, {
    peerId: conversation.peerId,
    threadId: conversation.threadId,
    text: text || " ",
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  await createChannelMessage({
    connectionId: connection.id,
    channelType: connection.channelType,
    externalMessageId: result.externalMessageId,
    sessionId: params.sessionId,
    messageId: params.messageId,
    direction: "outbound",
  });

  await touchChannelConversation(conversation.id);
}

async function buildOutgoingPayload(content: DBContentPart[]): Promise<{
  text: string;
  attachments: ChannelAttachment[];
}> {
  const textChunks: string[] = [];
  const attachments: ChannelAttachment[] = [];

  for (const part of content) {
    if (part.type === "text" && part.text) {
      textChunks.push(part.text);
    }
    if (part.type === "image" && part.image) {
      const attachment = await resolveImageAttachment(part.image);
      if (attachment) {
        attachments.push(attachment);
      }
    }
  }

  return {
    text: textChunks.join("\n").trim(),
    attachments,
  };
}

async function resolveImageAttachment(url: string): Promise<ChannelAttachment | null> {
  if (!url) return null;

  if (url.startsWith("/api/media/")) {
    const relativePath = url.replace("/api/media/", "");
    const buffer = readLocalFile(relativePath);
    const filename = relativePath.split("/").pop() || "image.jpg";
    return {
      type: "image",
      filename,
      mimeType: "image/jpeg",
      data: buffer,
    };
  }

  if (url.startsWith("http")) {
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    const mimeType = response.headers.get("content-type") || "image/jpeg";
    return {
      type: "image",
      filename: `image-${Date.now()}.jpg`,
      mimeType,
      data: Buffer.from(arrayBuffer),
    };
  }

  return null;
}
