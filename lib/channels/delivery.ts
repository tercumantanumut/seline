import { readLocalFile } from "@/lib/storage/local-storage";
import {
  createChannelMessage,
  getChannelConnection,
  getChannelConversation,
  getSession,
  touchChannelConversation,
  updateSession,
} from "@/lib/db/queries";
import { getCharacter } from "@/lib/characters/queries";
import type { DBContentPart } from "@/lib/messages/converter";
import { getChannelManager } from "./manager";
import type { ChannelAttachment } from "./types";
import { loadSettings } from "@/lib/settings/settings-manager";
import { isTTSAvailable, synthesizeSpeech, shouldSummarizeForTTS, summarizeForTTS, getAudioForChannel } from "@/lib/tts/manager";
import { parseTTSDirectives } from "@/lib/tts/directives";

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

  const { text: rawText, attachments } = await buildOutgoingPayload(params.content);
  if (!rawText && attachments.length === 0) {
    return;
  }

  // Parse [[tts:...]] directives from LLM output
  const { text, directive: ttsDirective } = parseTTSDirectives(rawText);

  // Load per-agent voice config from character metadata
  const characterId = params.sessionMetadata.characterId as string | undefined;
  let agentVoiceConfig: import("@/lib/tts/directives").TTSDirective | null = null;
  if (characterId) {
    try {
      const character = await getCharacter(characterId);
      const meta = character?.metadata as Record<string, unknown> | null;
      if (meta?.voiceConfig && typeof meta.voiceConfig === "object") {
        agentVoiceConfig = meta.voiceConfig as import("@/lib/tts/directives").TTSDirective;
      }
    } catch {
      // Ignore character lookup failures
    }
  }

  // Merge: directive overrides > agent voice config > global defaults
  const mergedDirective = agentVoiceConfig || ttsDirective
    ? { ...agentVoiceConfig, ...ttsDirective }
    : ttsDirective;

  // TTS: Convert text reply to audio attachment if enabled
  const ttsAttachment = await maybeGenerateTTSAttachment(text, connection.channelType, mergedDirective);
  const allAttachments = [...attachments];
  if (ttsAttachment) {
    allAttachments.push(ttsAttachment);
  }

  const manager = getChannelManager();
  const result = await manager.sendMessage(connection.id, {
    peerId: conversation.peerId,
    threadId: conversation.threadId,
    text: text || " ",
    attachments: allAttachments.length > 0 ? allAttachments : undefined,
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

/**
 * Generate a TTS audio attachment from text if TTS is enabled and configured.
 */
async function maybeGenerateTTSAttachment(
  text: string,
  channelType: string,
  directive?: import("@/lib/tts/directives").TTSDirective | null,
): Promise<ChannelAttachment | null> {
  // If LLM explicitly disabled TTS for this message
  if (directive?.off) return null;

  const settings = loadSettings();

  // Check if TTS is enabled (either globally or via directive)
  const hasDirective = directive && !directive.off;
  if (!hasDirective && !settings.ttsEnabled) return null;
  if (!hasDirective && settings.ttsAutoMode === "off") return null;
  if (!isTTSAvailable() && !hasDirective) return null;

  // Skip TTS for empty or very short responses
  if (!text || text.trim().length < 5) return null;

  try {
    // Summarize long text before TTS (uses LLM when available, falls back to truncation)
    let ttsText = text;
    if (shouldSummarizeForTTS(text)) {
      ttsText = await summarizeForTTS(text);
    }

    // Strip markdown formatting for cleaner speech
    ttsText = stripMarkdownForTTS(ttsText);

    const result = await synthesizeSpeech({
      text: ttsText,
      voice: directive?.voice || directive?.voiceId,
      speed: directive?.speed,
      channelHint: channelType,
    });
    const channelAudio = getAudioForChannel(result.audio, result.mimeType, channelType);

    return {
      type: "audio",
      filename: `voice-reply.${channelAudio.extension}`,
      mimeType: channelAudio.mimeType,
      data: channelAudio.audio,
    };
  } catch (error) {
    console.warn("[TTS] Failed to generate audio for channel reply:", error);
    return null;
  }
}

/**
 * Persist voice-related state to session metadata.
 * Follows the same pattern as update-plan-tool.ts session persistence.
 */
export async function persistVoiceState(
  sessionId: string,
  voiceState: {
    ttsAutoMode?: string;
    lastProvider?: string;
    lastVoice?: string;
    lastSpeed?: number;
  }
): Promise<void> {
  try {
    const session = await getSession(sessionId);
    if (!session) return;

    const metadata = (session.metadata || {}) as Record<string, unknown>;
    const existingVoice = (metadata.voice || {}) as Record<string, unknown>;

    await updateSession(sessionId, {
      metadata: {
        ...metadata,
        voice: {
          ...existingVoice,
          ...voiceState,
          updatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.warn("[Voice] Failed to persist voice state:", error);
  }
}

/**
 * Strip markdown syntax for cleaner TTS output.
 */
function stripMarkdownForTTS(text: string): string {
  return text
    .replace(/#{1,6}\s+/g, "") // headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/`{1,3}[^`]*`{1,3}/g, "") // inline/block code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links
    .replace(/^[-*]\s+/gm, "") // list markers
    .replace(/^\d+\.\s+/gm, "") // numbered lists
    .replace(/\n{3,}/g, "\n\n") // excess newlines
    .trim();
}
