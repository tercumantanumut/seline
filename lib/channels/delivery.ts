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
  const imageUrls: string[] = [];

  for (const part of content) {
    if (part.type === "text" && part.text) {
      textChunks.push(part.text);
    }
    if (part.type === "image" && part.image) {
      imageUrls.push(part.image);
    }
    if (part.type === "tool-result") {
      const result = (part as { result?: unknown }).result;
      if (result) {
        imageUrls.push(...extractImageUrlsFromToolResult(result));
      }
    }
  }

  for (const imageUrl of imageUrls) {
    const attachment = await resolveImageAttachment(imageUrl);
    if (attachment) {
      attachments.push(attachment);
      break;
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

  if (url.startsWith("data:")) {
    const parsed = parseDataUrl(url);
    if (!parsed || !parsed.mimeType.startsWith("image/")) {
      return null;
    }
    const extension = parsed.mimeType.split("/")[1] || "png";
    return {
      type: "image",
      filename: `image-${Date.now()}.${extension}`,
      mimeType: parsed.mimeType,
      data: Buffer.from(parsed.data, "base64"),
    };
  }

  return null;
}

function extractImageUrlsFromToolResult(result: unknown): string[] {
  const urls: string[] = [];
  if (!result || typeof result !== "object") {
    return urls;
  }

  const record = result as Record<string, unknown>;
  const images = record.images;
  if (Array.isArray(images)) {
    for (const item of images) {
      if (typeof item === "string") {
        urls.push(item);
      } else if (item && typeof item === "object") {
        const imageRecord = item as Record<string, unknown>;
        const nestedUrl = (imageRecord.image_url as Record<string, unknown> | undefined)?.url;
        const imageUrl =
          (typeof imageRecord.url === "string" && imageRecord.url) ||
          (typeof imageRecord.imageUrl === "string" && imageRecord.imageUrl) ||
          (typeof imageRecord.image_url === "string" && imageRecord.image_url) ||
          (typeof nestedUrl === "string" ? nestedUrl : undefined);
        if (imageUrl) {
          urls.push(imageUrl);
        }
      }
    }
  }

  const directUrl =
    (typeof record.image_url === "string" && record.image_url) ||
    (typeof record.imageUrl === "string" && record.imageUrl) ||
    (typeof record.image === "string" && record.image) ||
    (typeof record.url === "string" && record.url);
  if (directUrl) {
    urls.push(directUrl);
  }

  const content = record.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (!item || typeof item !== "object") continue;
      const contentRecord = item as Record<string, unknown>;
      if (contentRecord.type === "image") {
        const contentUrl = typeof contentRecord.url === "string" ? contentRecord.url : undefined;
        if (contentUrl) {
          urls.push(contentUrl);
        }
      }
    }
  }

  return urls;
}

function parseDataUrl(value: string): { mimeType: string; data: string } | null {
  const match = value.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}
